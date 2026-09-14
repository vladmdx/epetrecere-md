import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import {
  artistImages,
  artistVideos,
  artists,
  bookingRequests,
  leads,
  offerRequests,
  reviews,
  users,
  venueImages,
  venues,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  BOOKING_CLIENT_ERASURE,
  BOOKING_CREATION_IDENTITY_ERASURE,
  OFFER_REQUEST_CLIENT_ERASURE,
} from "@/lib/privacy/account-erasure";
import { acquireUserMembershipMutationLocks } from "@/lib/partner/organization-members";
import { validatePhone } from "@/lib/phone/validate";
import { writeUserPhoneInDatabase } from "@/lib/auth/user-phone";
import {
  scrubBookingEffectRecipientForErasure,
  scrubBookingEffectsForClientErasure,
} from "@/lib/booking/effect-outbox";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import { captureAccountAssetErasures } from "@/lib/privacy/account-asset-erasure";
import { scrubLegalContractDeliveriesForUserErasure } from "@/lib/legal/contract-delivery-privacy";
import {
  accountErasureIdentityIsTombstoned,
  assertAccountErasureIdentityConfigured,
  completeAccountErasureIdentityFromWebhook,
} from "@/lib/privacy/account-erasure-identity";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";
import { purgeGoogleCalendarForAccountErasure } from "@/lib/google/calendar-erasure";

const SAFE_CLERK_WEBHOOK_ERROR_CODES = new Set([
  "ACCOUNT_ERASURE_IDENTITY_SECRET_INVALID",
]);

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    phone_numbers?: { phone_number: string }[];
  };
}

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  if (!process.env.CLERK_WEBHOOK_SECRET) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured");
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

  let event: ClerkWebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  try {
    assertAccountErasureIdentityConfigured();
  } catch (error) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[clerk-webhook] identity erasure configuration unavailable",
      safeServerErrorLog(error, {
        correlationId,
        allowedCodes: SAFE_CLERK_WEBHOOK_ERROR_CODES,
      }),
    );
    return NextResponse.json(
      { error: "Webhook temporarily unavailable", correlationId },
      { status: 503, headers: { "X-Correlation-Id": correlationId } },
    );
  }

  if (type === "user.created" || type === "user.updated") {
    const email = data.email_addresses[0]?.email_address;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    const phone = data.phone_numbers?.[0]?.phone_number || null;

    const bootstrap = await db.transaction(async (tx) => {
      // An advisory identity lock makes the tombstone check and user upsert
      // atomic with account erasure even when the tombstone did not exist at
      // this transaction's first snapshot.
      if (await accountErasureIdentityIsTombstoned(
        tx as unknown as typeof db,
        data.id,
      )) {
        return { blocked: true as const, appUserId: null };
      }

      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, data.id))
        .limit(1);

      let appUserId = existing?.id ?? null;
      if (appUserId) {
        await tx
          .update(users)
          .set({
            email,
            name,
            avatarUrl: data.image_url,
            updatedAt: new Date(),
          })
          .where(eq(users.id, appUserId));
      } else {
        const [created] = await tx
          .insert(users)
          .values({
            clerkId: data.id,
            email,
            name,
            phone: null,
            avatarUrl: data.image_url,
            role: "user",
          })
          .onConflictDoNothing()
          .returning({ id: users.id });
        appUserId = created?.id ?? null;
        if (!appUserId) {
          const [refound] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, data.id))
            .limit(1);
          appUserId = refound?.id ?? null;
        }
      }
      return { blocked: false as const, appUserId };
    });
    const appUserId = bootstrap.appUserId;
    if (bootstrap.blocked) {
      console.info("[clerk-webhook] ignored update for erased identity");
    }

    // Clerk is only a bootstrap source. `user.updated` events can arrive out
    // of order and must never overwrite a phone explicitly saved inside the
    // product. A delayed/redelivered create also fills NULL only.
    if (type === "user.created" && appUserId && phone) {
      const normalized = validatePhone(phone);
      if (normalized.ok) {
        const phoneWrite = await writeUserPhoneInDatabase(
          appUserId,
          normalized.e164,
          { onlyIfMissing: true },
        );
        if (!phoneWrite.ok) {
          console.warn("[clerk-webhook] phone sync skipped", {
            code: phoneWrite.code,
          });
        }
      }
    }
  }

  if (type === "user.deleted") {
    const deactivated = await db.transaction(async (tx) => {
      // A verified deletion is authoritative: persist/complete the tombstone
      // even when no local user exists. Identity is always the first lock.
      await completeAccountErasureIdentityFromWebhook(
        tx as unknown as typeof db,
        data.id,
      );
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, data.id))
        .limit(1);
      if (!user) return { artistSlugs: [], venueSlugs: [] };

      const lockedOrganizationIds = await acquireUserMembershipMutationLocks(
        tx,
        user.id,
      );
        // Match the in-app deletion lock order and serialize with every
        // booking creator, which takes a SHARE lock on the same actor row.
        // Without this lock, a booking and its copied offer projection could
        // commit after the erasure UPDATEs but before the user DELETE.
        const [current] = await tx
          .select({
            id: users.id,
            email: users.email,
            phone: users.phone,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, user.id))
          .for("update")
          .limit(1);
        if (!current) return { artistSlugs: [], venueSlugs: [] };

        // An out-of-band deletion (Clerk dashboard/API) cannot ask the owner
        // to transfer first. Suspend any organization that would become
        // ownerless and create a durable admin-review case before the
        // membership cascade removes the user.
        await tx.execute(sql`
          INSERT INTO partner_admin_review_cases
            (venue_id, organization_id, reason, status)
          SELECT v.id, v.organization_id, 'clerk_deleted_last_owner', 'pending'
          FROM venues v
          WHERE v.organization_id IN (
            SELECT m.organization_id
            FROM partner_organization_members m
            WHERE m.user_id = ${user.id} AND m.role = 'owner' AND m.is_active
              AND NOT EXISTS (
                SELECT 1 FROM partner_organization_members other
                WHERE other.organization_id = m.organization_id
                  AND other.user_id <> m.user_id
                  AND other.role = 'owner' AND other.is_active
              )
          )
          ON CONFLICT (venue_id, reason) WHERE status = 'pending' DO NOTHING
        `);
        await tx.execute(sql`
          UPDATE partner_organizations o SET status = 'suspended', updated_at = now()
          WHERE o.id IN (
            SELECT m.organization_id
            FROM partner_organization_members m
            WHERE m.user_id = ${user.id} AND m.role = 'owner' AND m.is_active
              AND NOT EXISTS (
                SELECT 1 FROM partner_organization_members other
                WHERE other.organization_id = m.organization_id
                  AND other.user_id <> m.user_id
                  AND other.role = 'owner' AND other.is_active
              )
          )
        `);

        // Google event summaries may contain personal text. The user/org
        // legal locks fence the sync replacer: delete owned-profile rows and
        // scrub shared-org notes without opening a false-free calendar gap.
        await purgeGoogleCalendarForAccountErasure(tx, {
          userId: current.id,
          organizationIds: lockedOrganizationIds,
        });

        // Clerk dashboard/API deletion bypasses the product's DELETE route.
        // Deactivate and minimize legacy vendor profiles here as well, before
        // the SET NULL user FK could leave a public orphan containing PII.
        // The webhook bypasses the in-app DELETE route, so it must create the
        // same durable deletion intent before clearing/cascading asset URLs.
        // This helper only performs locked database work; Blob I/O happens in
        // the scheduled worker after commit.
        const capturedAssets = await captureAccountAssetErasures(
          tx,
          user.id,
          current.avatarUrl,
        );
        const { artistIds, venueIds } = capturedAssets;

        if (current.email) {
          await tx
            .update(leads)
            .set({
              name: "Utilizator șters",
              phone: "deleted",
              email: null,
              message: null,
              wizardData: null,
            })
            .where(eq(leads.email, current.email));
        }
        await tx
          .update(reviews)
          .set({ authorName: "Utilizator verificat" })
          .where(eq(reviews.authorUserId, user.id));
        await tx
          .update(artists)
          .set({
            isActive: false,
            nameRo: "Profil dezactivat",
            nameRu: null,
            nameEn: null,
            descriptionRo: null,
            descriptionRu: null,
            descriptionEn: null,
            phone: null,
            email: null,
            website: null,
            instagram: null,
            facebook: null,
            youtube: null,
            tiktok: null,
            photoUrl: null,
            videoTestimonials: [],
            autoReplyEnabled: false,
            autoReplyMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(artists.userId, user.id));
        await tx
          .update(venues)
          .set({
            isActive: false,
            nameRo: "Profil dezactivat",
            nameRu: null,
            nameEn: null,
            descriptionRo: null,
            descriptionRu: null,
            descriptionEn: null,
            address: null,
            lat: null,
            lng: null,
            phone: null,
            email: null,
            website: null,
            menuUrl: null,
            menuPdfUrl: null,
            virtualTourUrl: null,
            ogImageUrl: null,
            videoTestimonials: [],
            autoReplyEnabled: false,
            autoReplyMessage: null,
            updatedAt: new Date(),
          })
          .where(and(eq(venues.userId, user.id), isNull(venues.organizationId)));
        if (artistIds.length > 0) {
          await tx.delete(artistImages).where(inArray(artistImages.artistId, artistIds));
          await tx.delete(artistVideos).where(inArray(artistVideos.artistId, artistIds));
        }
        if (venueIds.length > 0) {
          await tx.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
        }

        const clientBookings = await tx
          .select({ id: bookingRequests.id })
          .from(bookingRequests)
          .where(eq(bookingRequests.clientUserId, user.id));
        const clientBookingIds = clientBookings.map((booking) => booking.id);
        if (clientBookingIds.length > 0) {
          await tx
            .update(offerRequests)
            .set(OFFER_REQUEST_CLIENT_ERASURE)
            .where(inArray(offerRequests.bookingRequestId, clientBookingIds));
        }
        const legacyOfferIdentity = or(
          current.email
            ? eq(offerRequests.clientEmail, current.email)
            : undefined,
          current.phone
            ? eq(offerRequests.clientPhone, current.phone)
            : undefined,
        );
        if (legacyOfferIdentity) {
          await tx
            .update(offerRequests)
            .set(OFFER_REQUEST_CLIENT_ERASURE)
            .where(
              and(
                isNull(offerRequests.bookingRequestId),
                legacyOfferIdentity,
              ),
            );
        }
        await scrubBookingEffectsForClientErasure(
          tx as unknown as typeof db,
          clientBookingIds,
        );
        await scrubBookingEffectRecipientForErasure(
          tx as unknown as typeof db,
          current.id,
        );
        await scrubLegalContractDeliveriesForUserErasure(
          tx as unknown as typeof db,
          current.id,
        );
        await tx
          .update(bookingRequests)
          .set(BOOKING_CLIENT_ERASURE)
          .where(eq(bookingRequests.clientUserId, user.id));
        const ownedManualTarget = or(
          artistIds.length > 0
            ? inArray(bookingRequests.artistId, artistIds)
            : undefined,
          venueIds.length > 0
            ? inArray(bookingRequests.venueId, venueIds)
            : undefined,
        );
        if (ownedManualTarget) {
          await tx
            .update(bookingRequests)
            .set(BOOKING_CREATION_IDENTITY_ERASURE)
            .where(and(eq(bookingRequests.source, "manual"), ownedManualTarget));
        }
        await tx.delete(users).where(eq(users.id, user.id));
        return {
          artistSlugs: capturedAssets.artists
            .filter(({ isActive }) => isActive)
            .map(({ slug }) => slug),
          venueSlugs: capturedAssets.venues
            .filter(({ isActive }) => isActive)
            .map(({ slug }) => slug),
        };
    });
    if (deactivated.artistSlugs.length > 0) {
      revalidateVendorCatalog("artist", {
        profileSlugs: deactivated.artistSlugs,
        directory: true,
        homepage: true,
        services: true,
      });
    }
    if (deactivated.venueSlugs.length > 0) {
      revalidateVendorCatalog("venue", {
        profileSlugs: deactivated.venueSlugs,
        directory: true,
        homepage: true,
        services: true,
      });
    }
  }

  return NextResponse.json({ success: true });
}
