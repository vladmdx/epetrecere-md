import { NextResponse } from "next/server";
import { checkName, checkDescription } from "@/lib/validation/text-quality";
import { z } from "zod/v4";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  artists,
  artistPackages,
  users,
  notifications,
  venues,
} from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { pickUniqueSlug } from "@/lib/utils/slugify";
import { validatePhone } from "@/lib/phone/validate";

/** A single duration → price tier the onboarding wizard can submit
 *  alongside the artist row. Mirrors the artist_packages columns. */
/** The ten canonical keys from lib/events/normalize.ts. */
const EVENT_TYPE_KEYS = [
  "wedding",
  "proposal",
  "cununie",
  "baptism",
  "cumatrie",
  "birthday",
  "kids_birthday",
  "corporate",
  "concert",
  "other",
] as const;

/** Default Romanian label when the partner does not name the tier itself.
 *  Display elsewhere goes through eventTypeLabel() for the reader's locale;
 *  this is only the stored name_ro. */
const EVENT_TYPE_NAME_RO: Record<string, string> = {
  wedding: "Nuntă",
  proposal: "Cerere în căsătorie",
  cununie: "Cununie",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  kids_birthday: "Zi de naștere pentru copii",
  corporate: "Eveniment corporativ",
  concert: "Concert",
  other: "Alt eveniment",
};

const packageTierSchema = z.object({
  hours: z.number().int().min(0).max(24).default(0),
  minutes: z.number().int().min(0).max(59).default(0),
  price: z.number().int().min(0).max(100_000),
  nameRo: z.string().max(120).optional(),
  /** per_hour — N minutes for `price`, the classic duration tier.
   *  per_event — one figure for a whole event, whatever it runs to. A
   *  photographer charges by the wedding, not by the hour. */
  pricingMode: z.enum(["per_hour", "per_event"]).default("per_hour"),
  /** Which event this price is for; null means "any". Only meaningful
   *  alongside per_event. */
  eventType: z.enum(EVENT_TYPE_KEYS).nullish(),
});

/** A duration tier needs a duration; an event tier needs only a price, since
 *  it deliberately has none. Requiring hours/minutes of both is what would
 *  silently drop every per-event price on the way to the database. */
function isUsableTier(p: z.infer<typeof packageTierSchema>): boolean {
  if (p.price <= 0) return false;
  return p.pricingMode === "per_event" || p.hours > 0 || p.minutes > 0;
}

const registerSchema = z.object({
  // Shared with the wizard so the disabled button and the API agree. min(2)
  // accepted "kk"; this asks for letters and more than one distinct one.
  name: z.string().refine((v) => checkName(v).ok, {
    message: "name_not_substantive",
  }),
  // Phone is now collected at registration and stored on the user; the
  // onboarding form may send an empty string. We fall back to users.phone.
  phone: z.string().optional().default(""),
  categoryId: z.number(),
  description: z
    .string()
    .refine((v) => checkDescription(v).ok, {
      message: "description_not_substantive",
    })
    .optional(),
  location: z.string().optional(),
  imageUrl: z.string().optional(),
  /** Legacy single "preț de start". Still supported for backwards
   *  compatibility but new clients should send the packages array
   *  instead. When packages are sent, the lowest price wins as
   *  priceFrom. */
  priceFrom: z.number().optional(),
  /** Multiple duration-based tiers (45min/1h/2h etc.) — surfaces in
   *  /dashboard/tarife and as the rezervare modal's package picker. */
  packages: z.array(packageTierSchema).max(20).optional(),
});

export async function POST(req: Request) {
  try {
    // Auth: use Clerk session
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.message },
        { status: 400 },
      );
    }

    // Look up the app user by clerkId
    let [appUser] = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
      })
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
        .returning({ id: users.id, email: users.email, phone: users.phone });

      if (created) {
        appUser = created;
      } else {
        // Conflict means the user was created between our check and insert
        const [existing] = await db
          .select({ id: users.id, email: users.email, phone: users.phone })
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

    // Check if already registered as artist
    const [existingArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, appUser.id))
      .limit(1);

    if (existingArtist) {
      return NextResponse.json(
        { error: "Already registered as artist", artistId: existingArtist.id },
        { status: 409 },
      );
    }
    const [existingVenue] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.userId, appUser.id))
      .limit(1);
    if (existingVenue) {
      return NextResponse.json(
        { error: "Un cont de sală nu poate fi înregistrat și ca artist." },
        { status: 409 },
      );
    }

    const data = parsed.data;
    // Clean slug derived from the artist's name. We collide-check against
    // existing artists.slug; -2/-3 suffixes are added only when needed.
    const slug = await pickUniqueSlug(data.name, async (candidate) => {
      const [hit] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.slug, candidate))
        .limit(1);
      return !!hit;
    });

    // Phone falls back to the user's phone (collected at registration).
    // Validate against the country-specific format and de-dupe across
    // accounts so each artist contact is unique.
    const candidatePhone =
      data.phone && data.phone.trim().length >= 6
        ? data.phone
        : appUser.phone || "";
    let finalPhone = candidatePhone;
    if (candidatePhone) {
      const phoneCheck = validatePhone(candidatePhone);
      if (!phoneCheck.ok) {
        return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
      }
      finalPhone = phoneCheck.e164;
      const [phoneCollision] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, finalPhone), ne(users.id, appUser.id)))
        .limit(1);
      if (phoneCollision) {
        return NextResponse.json(
          {
            error:
              "Acest număr de telefon este deja folosit de un alt cont.",
          },
          { status: 409 },
        );
      }
      // Keep the user row in sync — partners often edit their phone in
      // onboarding even if they entered a different one earlier.
      if (appUser.phone !== finalPhone) {
        await db
          .update(users)
          .set({ phone: finalPhone, updatedAt: new Date() })
          .where(eq(users.id, appUser.id));
      }
    }

    // priceFrom precedence: minimum across the packages array, falling
    // back to the legacy `priceFrom` field. Listing pages still sort
    // by this column, so we keep it accurate even with multiple tiers.
    const validTiers = (data.packages ?? []).filter(isUsableTier);
    const minTierPrice = validTiers.length
      ? Math.min(...validTiers.map((p) => p.price))
      : null;
    const resolvedPriceFrom =
      minTierPrice ??
      (data.priceFrom && data.priceFrom > 0 ? data.priceFrom : null);

    // Create artist (inactive — needs admin approval)
    const [artist] = await db
      .insert(artists)
      .values({
        userId: appUser.id,
        nameRo: data.name,
        nameRu: data.name,
        nameEn: data.name,
        slug,
        phone: finalPhone,
        email: appUser.email,
        photoUrl: data.imageUrl || null,
        descriptionRo: data.description || null,
        location: data.location || "Chișinău",
        priceFrom: resolvedPriceFrom,
        categoryIds: [data.categoryId],
        isActive: false,
        isVerified: false,
        isFeatured: false,
        isPremium: false,
        calendarEnabled: false,
        seoTitleRo: `${data.name} — Artist Evenimente | ePetrecere.md`,
      })
      .returning();

    // Auto-improve the description in the background. The partner wrote
    // a seed in onboarding; we polish it with Claude so the public page
    // launches with SEO-friendly copy instead of a one-paragraph blurb.
    // Fire-and-forget: failures don't block submission, the partner can
    // re-trigger from /dashboard/profil.
    if (data.description && data.description.trim().length >= 40) {
      const seed = data.description.trim();
      void (async () => {
        try {
          const { generateArtistDescription } = await import("@/lib/ai");
          const polished = await generateArtistDescription(
            data.name,
            // categoryIds resolved earlier as data.categoryId — we don't
            // have the name handy here without another lookup, so we use
            // a generic "artist" as the category. Good enough for the
            // first pass; partner can re-generate from settings.
            "artist",
            seed,
            "ro",
          );
          if (polished && polished.trim().length > 0) {
            await db
              .update(artists)
              .set({ descriptionRo: polished, updatedAt: new Date() })
              .where(eq(artists.id, artist.id));
          }
        } catch (err) {
          console.error("[register-artist] auto AI rewrite failed:", err);
        }
      })();
    }

    // Persist each duration tier as an artist_packages row. Skipped
    // when the array is empty so legacy onboarding submissions stay
    // exactly the same shape.
    if (validTiers.length > 0) {
      await db.insert(artistPackages).values(
        validTiers.map((p) => ({
          artistId: artist.id,
          nameRo:
            p.nameRo?.trim() ||
            (p.pricingMode === "per_event"
              ? EVENT_TYPE_NAME_RO[p.eventType ?? "other"]
              : p.hours > 0
                ? `${p.hours}h${p.minutes ? ` ${p.minutes}min` : ""}`
                : `${p.minutes} min`),
          price: p.price,
          // For a per-event tier the duration is not a billable unit; leave it
          // empty rather than writing a zero that reads as "0 hours".
          durationHours:
            p.pricingMode === "per_event" ? null : p.hours > 0 ? p.hours : null,
          durationMinutes: p.pricingMode === "per_event" ? 0 : p.minutes,
          pricingMode: p.pricingMode,
          eventType: p.pricingMode === "per_event" ? (p.eventType ?? null) : null,
          scope: "base" as const,
          isVisible: true,
        })),
      );
    }

    // Update user role to artist and mark onboarding complete
    await db
      .update(users)
      .set({ role: "artist", onboardingComplete: true })
      .where(eq(users.id, appUser.id));

    // Referral milestone — non-blocking, dedupes server-side.
    void (async () => {
      try {
        const { triggerReferral } = await import("@/lib/referrals/trigger");
        await triggerReferral(appUser.id, "onboarded", {
          kind: "artist",
          artistId: artist.id,
        });
      } catch (err) {
        console.error("[referral] artist onboarded trigger failed", err);
      }
    })();

    // Link the Legal Pack signature to the profile that has just been
    // created. Onboarding records the acceptance BEFORE the artist row
    // exists — deliberately, so nobody goes live without a contract — which
    // left artist_id NULL on every signature and made the admin contracts
    // page fall back to a bare e-mail instead of the partner's name.
    // Backfilling here is the fix: the id is written once, at the first
    // moment it exists, and the append-only trigger allows exactly this
    // NULL → id transition and nothing else.
    const { legalAcceptances } = await import("@/lib/db/schema");
    const { desc: descOrder, isNull } = await import("drizzle-orm");
    try {
      await db
        .update(legalAcceptances)
        .set({ artistId: artist.id })
        .where(
          and(
            eq(legalAcceptances.userId, appUser.id),
            eq(legalAcceptances.subjectType, "artist"),
            isNull(legalAcceptances.artistId),
          ),
        );
    } catch (err) {
      console.error("[register-artist] linking signature to artist failed", err);
    }

    // Notify admins (in-app + email)
    // Attach the vendor's signed contract (drawn signature) to the admin
    // notification, so whoever approves the request sees what was signed
    // without digging through the admin panel.
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

    // "admin" and "super_admin" both pass every requireAdmin() gate; filtering
    // on super_admin alone meant a second administrator got nothing.
    const { getAdminRecipients } = await import("@/lib/email/recipients");
    const admins = await getAdminRecipients();
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        type: "artist_registered",
        title: "Artist nou înregistrat!",
        message: `${data.name} (${appUser.email}) s-a înregistrat ca artist și așteaptă aprobare.`,
        actionUrl: `/admin/cereri-inregistrare`,
      });

      // Email notification to admin
      if (admin.email) {
        const { sendEmail } = await import("@/lib/email/send");
        const photoBlock = data.imageUrl
          ? `<div style="text-align:center;margin:0 0 16px;">
              <img src="${data.imageUrl}" alt="${data.name}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #C9A84C;" />
            </div>`
          : "";
        await sendEmail({
          to: admin.email,
          subject: `🔔 Artist nou: ${data.name} așteaptă aprobare`,
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#1A1A2E;border-radius:12px;color:#FAF8F2;">
            <h2 style="color:#C9A84C;margin:0 0 16px;">Artist Nou Înregistrat</h2>
            ${photoBlock}
            <p><strong>${data.name}</strong> (${appUser.email}) s-a înregistrat ca artist.</p>
            <p>Telefon: ${finalPhone || "—"}</p>
            <p>Oraș: ${data.location || "Nespecificat"}</p>
            <div style="margin-top:20px;text-align:center;">
              <a href="https://epetrecere.md/admin/cereri-inregistrare" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Vezi cererea →</a>
            </div>
          </div>${signedBlock}`,
          attachments: signatureAttachment ? [signatureAttachment] : undefined,
        }).catch((err) => console.error("[register-artist] Email failed:", err));
      }
    }

    return NextResponse.json({ success: true, artistId: artist.id });
  } catch (err) {
    console.error("[register-artist] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
