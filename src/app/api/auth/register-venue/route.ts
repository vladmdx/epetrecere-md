// M12 — Venue owner onboarding. Mirrors /api/auth/register-artist but for
// venues. Creates an inactive venue row linked to the user, sets role=user
// (we don't have a "venue" enum value — ownership is detected via venues.userId)
// and notifies admins for approval.

import { NextResponse, after } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues, users, notifications } from "@/lib/db/schema";
import { pickUniqueSlug } from "@/lib/utils/slugify";
import { validatePhone } from "@/lib/phone/validate";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";

// Each day is `{ open: HH:mm, close: HH:mm }` or null (closed). Mirrors
// venues.workingHours so we can pass it straight through.
const dayWindowSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .nullable();

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  city: z.string().optional(),
  // Address is now REQUIRED in the onboarding wizard. Server still accepts
  // missing for legacy compatibility — onboarding UI enforces it.
  address: z.string().trim().min(5).max(300),
  capacityMin: z.number().int().positive().optional(),
  capacityMax: z.number().int().positive().optional(),
  description: z.string().optional(),
  // Required: at least one image. Onboarding uploads to /api/upload and
  // passes URL(s) here. First one becomes the cover photo.
  imageUrls: z.array(z.string().url()).min(1).max(10),
  // Optional extras — venue can fill any combination during onboarding;
  // missing ones can be edited later from /dashboard/sala/profil.
  menuPdfUrl: z.string().url().optional(),
  menuUrl: z.string().url().optional(), // public website URL with menu
  virtualTourUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  // Map autofill payload — captured by /api/maps/expand, forwarded on submit.
  // Saved on the venue row so the public page renders the embedded map and
  // the schedule section without admin help.
  lat: z.number().optional(),
  lng: z.number().optional(),
  workingHours: z
    .object({
      mon: dayWindowSchema,
      tue: dayWindowSchema,
      wed: dayWindowSchema,
      thu: dayWindowSchema,
      fri: dayWindowSchema,
      sat: dayWindowSchema,
      sun: dayWindowSchema,
    })
    .optional(),
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

    // Country-aware phone format check (MD = 8 digits, RO = 9, etc.).
    const phoneCheck = validatePhone(parsed.data.phone);
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
    }
    const normalizedPhone = phoneCheck.e164;

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

    const missing = await missingRegistrationDocuments(appUser.id, "venue");
    if (missing.length) return NextResponse.json({ error: "current_signed_contract_required", missing }, { status: 409 });

    const [existingArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, appUser.id))
      .limit(1);
    if (existingArtist) {
      return NextResponse.json(
        { error: "Un cont de artist nu poate fi înregistrat și ca sală." },
        { status: 409 },
      );
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

    // Phone uniqueness across users — partner contacts must be unique so
    // SMS/email dedupe and bulk admin lookups stay correct.
    const [phoneCollision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, normalizedPhone), ne(users.id, appUser.id)))
      .limit(1);
    if (phoneCollision) {
      return NextResponse.json(
        { error: "Acest număr de telefon este deja folosit de un alt cont." },
        { status: 409 },
      );
    }
    // Persist the normalized phone on the user row so future lookups use
    // the same canonical form.
    await db
      .update(users)
      .set({ phone: normalizedPhone, updatedAt: new Date() })
      .where(eq(users.id, appUser.id));

    const data = parsed.data;
    // Clean slug from venue name. If a previous venue is using it, the
    // helper appends -2, -3, etc. — never a timestamp.
    const slug = await pickUniqueSlug(data.name, async (candidate) => {
      const [hit] = await db
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.slug, candidate))
        .limit(1);
      return !!hit;
    });

    let venue: typeof venues.$inferSelect;
    if (existing) {
      // Re-submission of a still-pending venue — overwrite all editable
      // fields, keep the original id + slug + createdAt so any in-flight
      // admin notifications still resolve.
      const [updated] = await db
        .update(venues)
        .set({
          nameRo: data.name,
          phone: normalizedPhone,
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
          // Map data: only overwrite when the new submission carries fresh
          // values, so a partner who removed the URL doesn't lose previously
          // resolved coordinates.
          ...(typeof data.lat === "number" ? { lat: data.lat } : {}),
          ...(typeof data.lng === "number" ? { lng: data.lng } : {}),
          ...(data.workingHours ? { workingHours: data.workingHours } : {}),
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
          phone: normalizedPhone,
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
          // Coordinates and weekly schedule when the partner pasted a Maps
          // URL during onboarding. Null otherwise — public page renders the
          // map only when both lat & lng are present.
          lat: typeof data.lat === "number" ? data.lat : null,
          lng: typeof data.lng === "number" ? data.lng : null,
          workingHours: data.workingHours ?? null,
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

    // Link the Legal Pack signature to the venue that has just been created.
    // Onboarding records the acceptance BEFORE the venue row exists —
    // deliberately, so nobody goes live without a contract — which left
    // venue_id NULL on every signature and made the admin contracts page
    // fall back to a bare e-mail instead of the partner's name. The
    // append-only trigger on legal_acceptances allows exactly this
    // NULL → id transition and nothing else.
    try {
      const { legalAcceptances } = await import("@/lib/db/schema");
      const { isNull } = await import("drizzle-orm");
      await db
        .update(legalAcceptances)
        .set({ venueId: venue.id })
        .where(
          and(
            eq(legalAcceptances.userId, appUser.id),
            eq(legalAcceptances.subjectType, "venue"),
            isNull(legalAcceptances.venueId),
          ),
        );
    } catch (err) {
      console.error("[register-venue] linking signature to venue failed", err);
    }

    // Auto-improve the description with AI in the background. The seed
    // can come from either the partner or the Maps autofill summary —
    // either way, polishing it gives the public page launch-ready copy.
    if (data.description && data.description.trim().length >= 40) {
      const seed = data.description.trim();
      after(async () => {
        try {
          const { generateVenueDescription } = await import("@/lib/ai");
          const html = await generateVenueDescription({
            name: data.name,
            city: data.city ?? null,
            capacityMin: data.capacityMin ?? null,
            capacityMax: data.capacityMax ?? null,
            facilities: [],
            current: seed,
            mode: "improve",
            language: "ro",
          });
          if (html && html.trim().length > 0) {
            await db
              .update(venues)
              .set({ descriptionRo: html, updatedAt: new Date() })
              .where(eq(venues.id, venue.id));
          }
        } catch (err) {
          console.error("[register-venue] auto AI rewrite failed:", err);
        }
      });
    }

    // Referral milestone — non-blocking, dedupes server-side.
    after(async () => {
      try {
        const { triggerReferral } = await import("@/lib/referrals/trigger");
        await triggerReferral(appUser.id, "onboarded", {
          kind: "venue",
          venueId: venue.id,
        });
      } catch (err) {
        console.error("[referral] venue onboarded trigger failed", err);
      }
    });

    // Notify admins (in-app + email) — fire-and-forget. Awaiting these
    // sends caused the venue registration POST to hang for ~1 minute when
    // the email provider was slow, leaving the user staring at a stuck
    // "Trimite pentru aprobare" button.
    after(async () => {
      try {
    // Attach the vendor's signed contract (drawn signature) to the admin
    // notification, so whoever approves the request sees what was signed
    // without digging through the admin panel.
    const { legalAcceptances } = await import("@/lib/db/schema");
    const { desc: descOrder } = await import("drizzle-orm");
    const signedRows = await db
      .select({
        image: legalAcceptances.signatureImage,
        name: legalAcceptances.signatureName,
        acceptedAt: legalAcceptances.acceptedAt,
      })
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, appUser.id))
      .orderBy(descOrder(legalAcceptances.acceptedAt))
      .limit(1);
    const signed = signedRows[0] ?? null;
    const { dataUrlToAttachment } = await import("@/lib/email/send");
    const signatureAttachment = dataUrlToAttachment(
      signed?.image ?? null,
      "semnatura-furnizor.png",
    );
    const signedBlock = signed
      ? `<p style="margin:12px 0 0;">Contract semnat de <strong>${signed.name}</strong> la ${new Date(signed.acceptedAt).toLocaleString("ro-RO")}.${signatureAttachment ? " Semnătura este atașată." : ""}</p>`
      : `<p style="margin:12px 0 0;color:#E8B84B;">⚠ Nu există un contract semnat pentru acest cont.</p>`;

        // "admin" and "super_admin" both pass every requireAdmin() gate;
        // filtering on super_admin alone meant a second administrator got
        // nothing.
        const { getAdminRecipients } = await import("@/lib/email/recipients");
        const admins = await getAdminRecipients();
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
            const coverUrl = data.imageUrls?.[0];
            const coverBlock = coverUrl
              ? `<div style="text-align:center;margin:0 0 16px;">
                  <img src="${coverUrl}" alt="${data.name}" style="width:100%;max-width:420px;height:200px;border-radius:8px;object-fit:cover;border:1px solid #C9A84C;" />
                </div>`
              : "";
            sendEmail({
              to: admin.email,
              subject: `🔔 Sală nouă: ${data.name} așteaptă aprobare`,
              html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
                <h2 style="color:#C9A84C;margin:0 0 16px;">Sală Nouă Înregistrată</h2>
                ${coverBlock}
                <p><strong>${data.name}</strong> (${data.phone}) s-a înregistrat ca sală.</p>
                <p>Oraș: ${data.city || "Nespecificat"}</p>
                <div style="margin-top:20px;text-align:center;">
                  <a href="https://epetrecere.md/admin/cereri-inregistrare" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Vezi cererea →</a>
                </div>
              </div>${signedBlock}`,
              attachments: signatureAttachment ? [signatureAttachment] : undefined,
            }).catch((err) => console.error("[register-venue] Email failed:", err));
          }
        }
      } catch (err) {
        console.error("[register-venue] admin notify failed:", err);
      }
    });

    return NextResponse.json({ success: true, venueId: venue.id, slug });
  } catch (err) {
    console.error("[register-venue] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
