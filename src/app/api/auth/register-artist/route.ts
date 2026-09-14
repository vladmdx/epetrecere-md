import { NextResponse, after } from "next/server";
import { checkName, checkDescription } from "@/lib/validation/text-quality";
import { z } from "zod/v4";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  artists,
  categories,
  artistPackages,
  legalAcceptances,
  users,
  notifications,
} from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { pickUniqueSlug } from "@/lib/utils/slugify";
import { validatePhone } from "@/lib/phone/validate";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";
import { artistLocationUpdate, artistTravelShape } from "@/lib/validation/vendor-profile";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { claimArtistRegistrationInDatabase } from "@/lib/auth/select-role";

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
  /** Which selected event this price is for. Only meaningful alongside
   *  per_event; current clients always send one explicit key. */
  eventType: z.enum(EVENT_TYPE_KEYS).nullish(),
});

const descriptionSchema = z
  .string()
  .max(2_000)
  .refine((value) => checkDescription(value).ok, {
    message: "description_not_substantive",
  })
  .optional();

// AI translations can expand slightly compared with the source language.
// Keep a generous storage bound without re-running the source-text quality
// rule, whose 2,000-character ceiling would reject a valid longer translation.
const translatedDescriptionSchema = z.string().max(5_000).optional();

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
  // Legacy/mobile clients may omit this field, but the locked account must
  // then already carry a valid phone. Registration never completes without it.
  phone: z.string().optional().default(""),
  categoryId: z.number().int().positive(),
  eventTypes: z
    .array(z.enum(EVENT_TYPE_KEYS))
    .min(1)
    .max(EVENT_TYPE_KEYS.length)
    .transform((values) => [...new Set(values)])
    .optional(),
  description: descriptionSchema,
  descriptionLanguage: z.enum(["ro", "ru", "en"]).default("ro"),
  descriptionRo: translatedDescriptionSchema,
  descriptionRu: translatedDescriptionSchema,
  descriptionEn: translatedDescriptionSchema,
  location: z.string().optional(),
  ...artistTravelShape,
  imageUrl: z.string().url().max(2000),
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
          // Registration claims the canonical phone under a dedicated lock;
          // never pre-populate an unverified duplicate during fallback sync.
          phone: null,
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

    const missing = await missingRegistrationDocuments(appUser.id, "artist");
    if (missing.length) return NextResponse.json({ error: "current_signed_contract_required", missing }, { status: 409 });

    const data = parsed.data;
    const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, data.categoryId), eq(categories.isActive, true))).limit(1);
    if (!category) return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    // An omitted legacy/mobile field means "preserve the account phone", not
    // "write the pre-transaction snapshot back". Only an explicit value is
    // normalized here; the callback reads the locked account value below.
    const suppliedPhone = data.phone.trim();
    let requestedPhone: string | undefined;
    if (suppliedPhone) {
      const phoneCheck = validatePhone(suppliedPhone);
      if (!phoneCheck.ok) {
        return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
      }
      requestedPhone = phoneCheck.e164;
    }

    // priceFrom precedence: minimum across the packages array, falling
    // back to the legacy `priceFrom` field. Listing pages still sort
    // by this column, so we keep it accurate even with multiple tiers.
    const validTiers = (data.packages ?? []).filter(isUsableTier);
    const selectedEventTypes = new Set(
      data.eventTypes ?? [...EVENT_TYPE_KEYS],
    );
    const invalidEventTier = validTiers.some(
      (tier) =>
        tier.pricingMode === "per_event" &&
        (!tier.eventType || !selectedEventTypes.has(tier.eventType)),
    );
    if (invalidEventTier) {
      return NextResponse.json(
        { error: "package_event_type_not_selected" },
        { status: 400 },
      );
    }
    const minTierPrice = validTiers.length
      ? Math.min(...validTiers.map((p) => p.price))
      : null;
    const resolvedPriceFrom =
      minTierPrice ??
      (data.priceFrom && data.priceFrom > 0 ? data.priceFrom : null);

    const sourceDescription = data.description?.trim() || null;
    const descriptions = {
      ro:
        data.descriptionRo?.trim() ||
        (data.descriptionLanguage === "ro" ? sourceDescription : null),
      ru:
        data.descriptionRu?.trim() ||
        (data.descriptionLanguage === "ru" ? sourceDescription : null),
      en:
        data.descriptionEn?.trim() ||
        (data.descriptionLanguage === "en" ? sourceDescription : null),
    };

    const claimed = await claimArtistRegistrationInDatabase({
      userId: appUser.id,
      multiHallEnabled: isMultiHallEnabled(),
      normalizedPhone: requestedPhone,
      write: async (executor, lockedUser) => {
        const finalPhone = requestedPhone ?? lockedUser.phone;
        if (!finalPhone) throw new Error("artist_registration_phone_invariant_failed");
        let artist: typeof artists.$inferSelect | undefined;
        // Different users do not share an account lock. Resolve and claim the
        // unique slug inside this transaction, retrying only a slug conflict
        // if another same-name registration commits first.
        for (let attempt = 0; attempt < 64 && !artist; attempt += 1) {
          const slug = await pickUniqueSlug(data.name, async (candidate) => {
            const [hit] = await executor
              .select({ id: artists.id })
              .from(artists)
              .where(eq(artists.slug, candidate))
              .limit(1);
            return Boolean(hit);
          });
          const [created] = await executor
            .insert(artists)
            .values({
              userId: lockedUser.id,
              nameRo: data.name,
              nameRu: data.name,
              nameEn: data.name,
              slug,
              phone: finalPhone,
              email: lockedUser.email,
              photoUrl: data.imageUrl || null,
              descriptionRo: descriptions.ro,
              descriptionRu: descriptions.ru,
              descriptionEn: descriptions.en,
              ...artistLocationUpdate({ baseCity: data.baseCity, location: data.location || "Chișinău" }),
              travelDistanceKm: data.travelDistanceKm ?? 30,
              travelSurchargeEnabled: data.travelSurchargeEnabled ?? false,
              travelSurchargeAmount: data.travelSurchargeEnabled ? data.travelSurchargeAmount ?? null : null,
              priceHidden: data.priceHidden ?? false,
              priceFrom: resolvedPriceFrom,
              categoryIds: [data.categoryId],
              // Older mobile builds do not send this field yet. They retain the
              // all-events behaviour while the current onboarding requires a choice.
              eventTypes: data.eventTypes ?? [...EVENT_TYPE_KEYS],
              isActive: false,
              isVerified: false,
              isFeatured: false,
              isPremium: false,
              calendarEnabled: false,
              seoTitleRo: `${data.name} — Artist Evenimente | ePetrecere.md`,
            })
            .onConflictDoNothing({ target: artists.slug })
            .returning();
          artist = created;
        }
        if (!artist) throw new Error("artist_slug_allocation_exhausted");

        if (validTiers.length > 0) {
          await executor.insert(artistPackages).values(
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
        // The acceptance predates the profile by design. Link it in the same
        // transaction as profile creation so a lost HTTP response cannot
        // leave a permanently unlinked contract on the retry path.
        await executor
          .update(legalAcceptances)
          .set({ artistId: artist.id })
          .where(and(
            eq(legalAcceptances.userId, lockedUser.id),
            eq(legalAcceptances.subjectType, "artist"),
            isNull(legalAcceptances.organizationId),
            isNull(legalAcceptances.artistId),
          ));
        return { artist, userEmail: lockedUser.email, finalPhone };
      },
    });
    if (!claimed.ok) {
      if (
        claimed.code === "ARTIST_ALREADY_REGISTERED"
        && claimed.replayable
        && claimed.profileId
      ) {
        return NextResponse.json({
          success: true,
          artistId: claimed.profileId,
          replayed: true,
        });
      }
      return NextResponse.json(
        {
          error: claimed.error,
          code: claimed.code === "PHONE_IN_USE" ? "phone_in_use" : claimed.code,
          ...(claimed.profileId ? { artistId: claimed.profileId } : {}),
        },
        { status: claimed.status },
      );
    }
    const { artist, userEmail, finalPhone } = claimed.value;

    // Legacy/mobile clients may still send one description only. Fill just
    // the missing languages in the background; never rewrite the partner's
    // source or overwrite a translation that already exists.
    if (
      sourceDescription &&
      sourceDescription.length >= 10 &&
      (!descriptions.ro || !descriptions.ru || !descriptions.en)
    ) {
      const sourceLanguage = data.descriptionLanguage;
      after(async () => {
        try {
          const { translateProfileDescription } = await import("@/lib/ai");
          const translated = await translateProfileDescription(
            sourceDescription,
            sourceLanguage,
          );
          const [current] = await db
            .select({
              descriptionRo: artists.descriptionRo,
              descriptionRu: artists.descriptionRu,
              descriptionEn: artists.descriptionEn,
            })
            .from(artists)
            .where(eq(artists.id, artist.id))
            .limit(1);
          if (!current) return;
          const currentSource = {
            ro: current.descriptionRo,
            ru: current.descriptionRu,
            en: current.descriptionEn,
          }[sourceLanguage];
          if (currentSource?.trim() !== sourceDescription) return;

          await db
            .update(artists)
            .set({
              descriptionRo: current.descriptionRo?.trim()
                ? current.descriptionRo
                : translated.ro,
              descriptionRu: current.descriptionRu?.trim()
                ? current.descriptionRu
                : translated.ru,
              descriptionEn: current.descriptionEn?.trim()
                ? current.descriptionEn
                : translated.en,
              updatedAt: new Date(),
            })
            .where(eq(artists.id, artist.id));
        } catch (err) {
          console.error("[register-artist] auto translation failed:", err);
        }
      });
    }

    // Referral milestone — non-blocking, dedupes server-side.
    after(async () => {
      try {
        const { triggerReferral } = await import("@/lib/referrals/trigger");
        await triggerReferral(appUser.id, "onboarded", {
          kind: "artist",
          artistId: artist.id,
        });
      } catch (err) {
        console.error("[referral] artist onboarded trigger failed", err);
      }
    });

    const { desc: descOrder } = await import("drizzle-orm");

    // Keep serverless notification work alive without delaying a successful
    // registration or returning an error after the profile already exists.
    after(async () => {
      try {
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
      .where(and(eq(legalAcceptances.userId, appUser.id), eq(legalAcceptances.subjectType, "artist")))
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
        message: `${data.name} (${userEmail}) s-a înregistrat ca artist și așteaptă aprobare.`,
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
            <p><strong>${data.name}</strong> (${userEmail}) s-a înregistrat ca artist.</p>
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
      } catch (err) {
        console.error("[register-artist] admin notification failed:", err);
      }
    });

    return NextResponse.json({ success: true, artistId: artist.id });
  } catch (err) {
    console.error("[register-artist] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
