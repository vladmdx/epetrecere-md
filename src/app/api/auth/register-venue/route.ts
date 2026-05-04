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
  // Address is now REQUIRED in the onboarding wizard. Server still accepts
  // missing for legacy compatibility — onboarding UI enforces it.
  address: z.string().optional(),
  capacityMin: z.number().int().positive().optional(),
  capacityMax: z.number().int().positive().optional(),
  description: z.string().optional(),
  // Required: at least one image. Onboarding uploads to /api/upload and
  // passes URL(s) here. First one becomes the cover photo.
  imageUrls: z.array(z.string().url()).max(10).optional(),
  // Optional extras — venue can fill any combination during onboarding;
  // missing ones can be edited later from /dashboard/sala/profil.
  menuPdfUrl: z.string().url().optional(),
  menuUrl: z.string().url().optional(), // public website URL with menu
  virtualTourUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
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

    // A user may own only one APPROVED venue through this flow. If they
    // already have one that's still pending (isActive=false), treat this
    // submission as a re-submission and UPDATE the pending row instead of
    // hard-blocking. The previous behavior locked users out forever after
    // their first incomplete attempt.
    const [existing] = await db
      .select({ id: venues.id, isActive: venues.isActive })
      .from(venues)
      .where(eq(venues.userId, appUser.id))
      .limit(1);

    if (existing && existing.isActive) {
      return NextResponse.json(
        { error: "Venue already registered", venueId: existing.id },
        { status: 409 },
      );
    }

    const data = parsed.data;
    const slug = `${slugify(data.name)}-${Date.now().toString(36)}`;

    let venue: typeof venues.$inferSelect;
    if (existing) {
      // Re-submission of a still-pending venue — overwrite all editable
      // fields, keep the original id + slug + createdAt so any in-flight
      // admin notifications still resolve.
      const [updated] = await db
        .update(venues)
        .set({
          nameRo: data.name,
          phone: data.phone,
          email: data.email ?? appUser.email ?? null,
          city: data.city ?? "Chișinău",
          address: data.address ?? null,
          capacityMin: data.capacityMin ?? null,
          capacityMax: data.capacityMax ?? null,
          descriptionRo: data.description ?? null,
          website: data.websiteUrl ?? null,
          menuUrl: data.menuUrl ?? null,
          menuPdfUrl: data.menuPdfUrl ?? null,
          virtualTourUrl: data.virtualTourUrl ?? null,
          seoTitleRo: `${data.name} — Sală Evenimente | ePetrecere.md`,
          updatedAt: new Date(),
        })
        .where(eq(venues.id, existing.id))
        .returning();
      venue = updated;
    } else {
      const [created] = await db
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
          website: data.websiteUrl ?? null,
          menuUrl: data.menuUrl ?? null,
          menuPdfUrl: data.menuPdfUrl ?? null,
          virtualTourUrl: data.virtualTourUrl ?? null,
          isActive: false,
          // Launch-phase: every approved venue gets the premium homepage
          // placement. Will revert to false once paid tiers are introduced.
          isFeatured: true,
          facilities: [],
          seoTitleRo: `${data.name} — Sală Evenimente | ePetrecere.md`,
        })
        .returning();
      venue = created;
    }

    // Create venue_images rows. First image is the cover (isCover=true).
    // On re-submission we wipe the previous images and re-insert — keeps
    // the new uploads as the source of truth and avoids accumulating
    // stale URLs from earlier failed attempts.
    if (data.imageUrls && data.imageUrls.length > 0) {
      const { venueImages } = await import("@/lib/db/schema");
      if (existing) {
        await db.delete(venueImages).where(eq(venueImages.venueId, venue.id));
      }
      await db.insert(venueImages).values(
        data.imageUrls.map((url, idx) => ({
          venueId: venue.id,
          url,
          isCover: idx === 0,
          sortOrder: idx,
          altRo: data.name,
        })),
      );
    }

    // Mark onboarding complete
    await db
      .update(users)
      .set({ onboardingComplete: true })
      .where(eq(users.id, appUser.id));

    // Referral milestone — non-blocking, dedupes server-side.
    void (async () => {
      try {
        const { triggerReferral } = await import("@/lib/referrals/trigger");
        await triggerReferral(appUser.id, "onboarded", {
          kind: "venue",
          venueId: venue.id,
        });
      } catch (err) {
        console.error("[referral] venue onboarded trigger failed", err);
      }
    })();

    // Notify admins (in-app + email) — fire-and-forget. Awaiting these
    // sends caused the venue registration POST to hang for ~1 minute when
    // the email provider was slow, leaving the user staring at a stuck
    // "Trimite pentru aprobare" button.
    void (async () => {
      try {
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
            sendEmail({
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
      } catch (err) {
        console.error("[register-venue] admin notify failed:", err);
      }
    })();

    return NextResponse.json({ success: true, venueId: venue.id, slug });
  } catch (err) {
    console.error("[register-venue] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
