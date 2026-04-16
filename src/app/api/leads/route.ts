import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { leads, offerRequests, leadMatches, artists } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { rateLimit } from "@/lib/rate-limit";
import { matchLeadToVendors } from "@/lib/leads/matching";
import { scoreAndPersist } from "@/lib/leads/quality-score";
import { requireAdmin } from "@/lib/auth/admin";
import { inngest } from "@/lib/inngest/client";

// SEC — CRM lead listing exposes all client PII (name, phone, email,
// budget). Admin-only gate prevents anonymous scraping.

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const allLeads = await db
    .select()
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(200);

  return NextResponse.json(allLeads);
}

const createLeadSchema = z
  .object({
    name: z.string().min(2),
    phone: z.string().min(6),
    phonePrefix: z.string().default("+373"),
    email: z.email().optional(),
    eventType: z.string().optional(),
    eventDate: z.string().optional(),
    location: z.string().optional(),
    guestCount: z.number().optional(),
    budget: z.number().optional(),
    message: z.string().optional(),
    source: z.enum(["form", "wizard", "direct", "import"]).default("form"),
    artistId: z.number().optional(),
    venueId: z.number().optional(),
    /** M3 — full wizard payload persisted so the matching engine can pull
     *  services[] and venueNeeded later. */
    wizardData: z
      .object({
        services: z.array(z.string()).optional(),
        venueNeeded: z.string().optional(),
        timeSlot: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  // M6 Intern #2 — wizard submissions must carry the full event payload so
  // the matching engine always has something to work with. Other sources
  // (contact form, artist profile form) keep the individual fields optional.
  .refine(
    (v) =>
      v.source !== "wizard" ||
      (!!v.eventType &&
        !!v.eventDate &&
        !!v.location &&
        typeof v.guestCount === "number" &&
        v.guestCount > 0 &&
        typeof v.budget === "number" &&
        v.budget > 0 &&
        !!v.wizardData?.services &&
        v.wizardData.services.length > 0),
    {
      message:
        "Wizard submissions require eventType, eventDate, location, guestCount, budget și services.",
    },
  );

export async function POST(req: NextRequest) {
  // Rate limit: 10 submissions per minute per IP
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`leads:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { artistId, venueId, wizardData, ...leadData } = parsed.data;

  // 1. Create lead record
  const [lead] = await db
    .insert(leads)
    .values({
      ...leadData,
      wizardData: wizardData ?? null,
      status: "new",
      score: calculateScore(leadData),
    })
    .returning();

  // 1b. Direct match: when the lead comes from a specific artist page,
  // create a guaranteed lead_match + notify the artist immediately.
  if (artistId) {
    void (async () => {
      try {
        await db.insert(leadMatches).values({
          leadId: lead.id,
          artistId,
          score: 100,
          reasons: ["Cerere directă de pe pagina artistului"],
          status: "matched",
        });
        // Notify the artist owner
        const [artist] = await db
          .select({ userId: artists.userId })
          .from(artists)
          .where(eq(artists.id, artistId))
          .limit(1);
        if (artist?.userId) {
          await dispatchNotification({
            userId: artist.userId,
            type: "lead_new",
            title: "Cerere nouă de rezervare!",
            message: `${leadData.name} · ${leadData.eventType ?? "Eveniment"}${leadData.eventDate ? ` · ${leadData.eventDate}` : ""}`,
            actionUrl: "/dashboard/lead-uri",
          });
        }
      } catch (err) {
        console.error("[leads] Direct artist match failed:", err);
      }
    })();
  }

  // 1c. M3 — Fire-and-forget lead matching for other vendors too.
  void matchLeadToVendors({ leadId: lead.id });

  // 1c. M9 Intern #2 — Fire-and-forget AI quality score. Also safe: the
  // helper catches its own errors and updates the row when done.
  void scoreAndPersist({
    id: lead.id,
    name: leadData.name,
    phone: leadData.phone,
    email: leadData.email,
    eventType: leadData.eventType,
    eventDate: leadData.eventDate,
    location: leadData.location,
    guestCount: leadData.guestCount,
    budget: leadData.budget,
    message: leadData.message,
    source: leadData.source,
    services: wizardData?.services,
  });

  // 2. Also create offerRequest for admin panel visibility
  try {
    await db.insert(offerRequests).values({
      artistId: artistId ?? null,
      venueId: venueId ?? null,
      clientName: leadData.name,
      clientPhone: `${leadData.phonePrefix || "+373"} ${leadData.phone}`,
      clientEmail: leadData.email ?? null,
      eventType: leadData.eventType ?? null,
      eventDate: leadData.eventDate ?? null,
      message: leadData.message ?? null,
      source: leadData.source ?? "form",
      status: "new",
    });
  } catch (e) {
    // Don't fail the lead creation if offerRequest fails
    console.error("Failed to create offer request:", e);
  }

  // 3. Fire Inngest event for email notifications (confirmation + admin alert)
  try {
    await inngest.send({
      name: "lead/created",
      data: { lead },
    });
  } catch (e) {
    // Don't fail the lead if Inngest is unreachable
    console.error("[leads] Failed to send Inngest event:", e);
  }

  return NextResponse.json(lead, { status: 201 });
}

function calculateScore(data: { budget?: number; eventType?: string; source?: string }): number {
  let score = 10;
  if (data.budget) {
    if (data.budget > 5000) score += 30;
    else if (data.budget > 2000) score += 20;
    else if (data.budget > 500) score += 10;
  }
  if (data.eventType === "wedding") score += 20;
  if (data.source === "wizard") score += 15;
  return Math.min(score, 100);
}
