// M12 — Venue owner onboarding. Mirrors /api/auth/register-artist but for
// venues. Creates an inactive venue row linked to the user, sets role=user
// (we don't have a "venue" enum value — ownership is detected via venues.userId)
// and notifies admins for approval.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, users, notifications } from "@/lib/db/schema";

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  capacityMin: z.number().int().positive().optional(),
  capacityMax: z.number().int().positive().optional(),
  description: z.string().optional(),
});

function slugify(text: string): string {
  const cyMap: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",
    й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",
    у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",
    ь:"",э:"e",ю:"yu",я:"ya",
  };
  const transliterated = text
    .split("")
    .map((c) => cyMap[c.toLowerCase()] || c)
    .join("");
  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // A user may only own one venue through this flow.
  const existing = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Venue already registered", venueId: existing[0].id },
      { status: 409 },
    );
  }

  const data = parsed.data;
  const slug = `${slugify(data.name)}-${Date.now().toString(36)}`;

  const [venue] = await db
    .insert(venues)
    .values({
      userId: appUser.id,
      nameRo: data.name,
      slug,
      phone: data.phone,
      email: data.email ?? appUser.email ?? null,
      city: data.city ?? "Chișinău",
      address: data.address ?? null,
      capacityMin: data.capacityMin ?? null,
      capacityMax: data.capacityMax ?? null,
      descriptionRo: data.description ?? null,
      isActive: false,
      isFeatured: false,
      facilities: [],
      seoTitleRo: `${data.name} — Sală Evenimente | ePetrecere.md`,
    })
    .returning();

  // Notify admins so they can approve the venue.
  const admins = await db
    .select()
    .from(users)
    .where(eq(users.role, "super_admin"));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      type: "venue_registered",
      title: "Sală nouă înregistrată!",
      message: `${data.name} (${data.phone}) s-a înregistrat ca sală și așteaptă aprobare.`,
      actionUrl: `/admin/sali/${venue.id}`,
    });
  }

  return NextResponse.json({ success: true, venueId: venue.id, slug });
}
