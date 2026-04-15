// M12 — Venue owner onboarding. Mirrors /api/auth/register-artist but for
// venues. Creates an inactive venue row linked to the user, sets role=user
// (we don't have a "venue" enum value — ownership is detected via venues.userId)
// and notifies admins for approval.

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, users, notifications } from "@/lib/db/schema";
import { slugify } from "@/lib/utils/slugify";

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

export async function POST(req: Request) {
  try {
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

    // Look up user by clerkId
    let [appUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    // If user not in DB yet (webhook delay), create them on the fly
    if (!appUser) {
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json(
          { error: "Could not load user profile" },
          { status: 500 },
        );
      }

      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        return NextResponse.json(
          { error: "No email found on account" },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          name: [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null,
          phone: clerkUser.phoneNumbers?.[0]?.phoneNumber || null,
          avatarUrl: clerkUser.imageUrl || null,
          role: "user",
        })
        .onConflictDoNothing()
        .returning({ id: users.id, email: users.email });

      if (created) {
        appUser = created;
      } else {
        const [existing] = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        if (!existing) {
          return NextResponse.json(
            { error: "User creation failed" },
            { status: 500 },
          );
        }
        appUser = existing;
      }
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

    // Mark onboarding complete
    await db
      .update(users)
      .set({ onboardingComplete: true })
      .where(eq(users.id, appUser.id));

    // Notify admins (in-app + email)
    const admins = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, "super_admin"));
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        type: "venue_registered",
        title: "Sală nouă înregistrată!",
        message: `${data.name} (${data.phone}) s-a înregistrat ca sală și așteaptă aprobare.`,
        actionUrl: `/admin/cereri-inregistrare`,
      });

      if (admin.email) {
        const { sendEmail } = await import("@/lib/email/send");
        await sendEmail({
          to: admin.email,
          subject: `🔔 Sală nouă: ${data.name} așteaptă aprobare`,
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
            <h2 style="color:#C9A84C;margin:0 0 16px;">Sală Nouă Înregistrată</h2>
            <p><strong>${data.name}</strong> (${data.phone}) s-a înregistrat ca sală.</p>
            <p>Oraș: ${data.city || "Nespecificat"}</p>
            <div style="margin-top:20px;text-align:center;">
              <a href="https://epetrecere.md/admin/cereri-inregistrare" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Vezi cererea →</a>
            </div>
          </div>`,
        }).catch((err) => console.error("[register-venue] Email failed:", err));
      }
    }

    return NextResponse.json({ success: true, venueId: venue.id, slug });
  } catch (err) {
    console.error("[register-venue] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
