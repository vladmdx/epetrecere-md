// M11 Intern #1 — GDPR account deletion (Art. 17 — right to be forgotten).
//
// Deleting the user row cascades to event plans, messages, conversations,
// invitations and photos. Three things deliberately survive, and the header
// used to claim otherwise:
//
//   - Reviews. `reviews.author_user_id` is ON DELETE SET NULL and
//     `author_name` is NOT NULL (schema.ts:680, :683), so a review stays up
//     under the name it was written with. That is the honest behaviour for a
//     marketplace — a vendor's rating cannot be erased by deleting the
//     account that left it — but it is not what "cascade deletes reviews"
//     said.
//   - Signed contracts. `legal_acceptances.user_id` is SET NULL and the
//     append-only trigger permits exactly that clearing and nothing else.
//     Evidence of what a partner agreed to has to outlive their account.
//   - Leads, anonymized below rather than deleted: they belong to the
//     vendor's own business record.
//
// And one thing that used to survive but should not: a vendor profile.
// `artists.user_id` / `venues.user_id` are SET NULL too (schema.ts:262,
// :414), so deleting a partner's account left their public listing standing —
// name, photos, description, still collecting booking requests that nobody
// could answer, because the only account that could answer them was gone.
// Now it is taken out of the shop window first.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  leads,
  artists,
  artistImages,
  artistVideos,
  venues,
  venueImages,
  reviews,
  bookingRequests,
  offerRequests,
  partnerOrganizations,
  partnerOrganizationMembers,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import {
  BOOKING_CLIENT_ERASURE,
  BOOKING_CREATION_IDENTITY_ERASURE,
  OFFER_REQUEST_CLIENT_ERASURE,
} from "@/lib/privacy/account-erasure";
import { acquireUserMembershipMutationLocks } from "@/lib/partner/organization-members";
import {
  scrubBookingEffectRecipientForErasure,
  scrubBookingEffectsForClientErasure,
} from "@/lib/booking/effect-outbox";
import { captureAccountAssetErasures } from "@/lib/privacy/account-asset-erasure";
import { scrubLegalContractDeliveriesForUserErasure } from "@/lib/legal/contract-delivery-privacy";
import {
  assertAccountErasureIdentityConfigured,
  enqueueAccountErasureIdentity,
  lockAccountErasureIdentity,
  processAccountErasureIdentity,
} from "@/lib/privacy/account-erasure-identity";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";
import { purgeGoogleCalendarForAccountErasure } from "@/lib/google/calendar-erasure";

const SAFE_ACCOUNT_ERASURE_ERROR_CODES = new Set([
  "ACCOUNT_ERASURE_IDENTITY_SECRET_INVALID",
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const SAFE_ACCOUNT_ERASURE_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 422, 425, 429, 500, 502, 503, 504,
]);

async function tryDeleteErasedClerkIdentity(
  identityHash: string,
): Promise<"completed" | "failed" | "pending"> {
  try {
    const result = await processAccountErasureIdentity(identityHash);
    return result.status === "not_due" ? "pending" : result.status;
  } catch (error) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[delete-account] durable Clerk deletion attempt failed",
      safeServerErrorLog(error, {
        correlationId,
        allowedCodes: SAFE_ACCOUNT_ERASURE_ERROR_CODES,
        allowedStatuses: SAFE_ACCOUNT_ERASURE_ERROR_STATUSES,
      }),
    );
    return "pending";
  }
}

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertAccountErasureIdentityConfigured();
  } catch (error) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[delete-account] identity erasure configuration unavailable",
      safeServerErrorLog(error, {
        correlationId,
        allowedCodes: SAFE_ACCOUNT_ERASURE_ERROR_CODES,
      }),
    );
    return NextResponse.json(
      {
        error: "Account deletion is temporarily unavailable. Please retry.",
        code: "ACCOUNT_ERASURE_RETRY",
        retryable: true,
        correlationId,
      },
      { status: 503, headers: { "X-Correlation-Id": correlationId } },
    );
  }

  let user: typeof users.$inferSelect | undefined = (await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1))[0];

  if (!user) {
    // DELETE is idempotent even if the local projection is already absent.
    // Recheck under the same identity lock used by every bootstrap: a fallback
    // insert may have committed between the optimistic SELECT above and this
    // transaction. If so, continue through the full local minimization path.
    const missingResolution = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
      await lockAccountErasureIdentity(tx as unknown as typeof db, clerkId);
      const [racedUser] = await tx
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .for("update")
        .limit(1);
      if (racedUser) {
        return { user: racedUser, identityHash: null };
      }
      const queued = await enqueueAccountErasureIdentity(
        tx as unknown as typeof db,
        clerkId,
      );
      return { user: null, identityHash: queued.identityHash };
    }).catch(() => null);
    if (!missingResolution) {
      return NextResponse.json(
        {
          error: "Account deletion could not be completed safely. Please retry.",
          code: "ACCOUNT_ERASURE_RETRY",
          retryable: true,
        },
        { status: 503 },
      );
    }
    if (missingResolution.identityHash) {
      const identityDeletion = await tryDeleteErasedClerkIdentity(
        missingResolution.identityHash,
      );
      return NextResponse.json({ success: true, identityDeletion });
    }
    user = missingResolution.user ?? undefined;
    if (!user) {
      return NextResponse.json(
        {
          error: "Account deletion could not be completed safely. Please retry.",
          code: "ACCOUNT_ERASURE_RETRY",
          retryable: true,
        },
        { status: 503 },
      );
    }
  }

  // An organization must never be left without an owner. This preflight runs
  // before Blob deletion or any database mutation, so a blocked request is
  // completely side-effect free. The owner can transfer ownership and retry.
  const ownerMemberships = await db
    .select({ organizationId: partnerOrganizationMembers.organizationId })
    .from(partnerOrganizationMembers)
    .innerJoin(
      partnerOrganizations,
      eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
    )
    .where(
      and(
        eq(partnerOrganizationMembers.userId, user.id),
        eq(partnerOrganizationMembers.role, "owner"),
        eq(partnerOrganizationMembers.isActive, true),
        ne(partnerOrganizations.status, "archived"),
      ),
    );
  const lastOwnerOrganizationIds: number[] = [];
  for (const membership of ownerMemberships) {
    const [otherOwner] = await db
      .select({ id: partnerOrganizationMembers.id })
      .from(partnerOrganizationMembers)
      .where(
        and(
          eq(partnerOrganizationMembers.organizationId, membership.organizationId),
          eq(partnerOrganizationMembers.role, "owner"),
          eq(partnerOrganizationMembers.isActive, true),
          ne(partnerOrganizationMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (!otherOwner) lastOwnerOrganizationIds.push(membership.organizationId);
  }
  if (lastOwnerOrganizationIds.length > 0) {
    return NextResponse.json(
      {
        error: "Transferă proprietatea organizației înainte de ștergerea contului.",
        code: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
        organizationIds: lastOwnerOrganizationIds,
      },
      { status: 409 },
    );
  }

  const deleted = await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
    // Identity is the first application lock in both bootstrap and erasure.
    // This closes the absent-row race where a delayed Clerk webhook could
    // otherwise insert a user immediately after this transaction commits.
    const identityHash = await lockAccountErasureIdentity(
      tx as unknown as typeof db,
      clerkId,
    );
    const lockedOrganizationIds = await acquireUserMembershipMutationLocks(tx, user.id);
    const [current] = await tx
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!current) {
      await enqueueAccountErasureIdentity(tx as unknown as typeof db, clerkId);
      return {
        ok: true as const,
        identityHash,
        artistSlugs: [] as string[],
        venueSlugs: [] as string[],
      };
    }

    // The earlier check protects external cleanup from avoidable work; this
    // locked check is authoritative against concurrent grant/transfer/sign.
    const lockedOwnerMemberships = await tx
      .select({ organizationId: partnerOrganizationMembers.organizationId })
      .from(partnerOrganizationMembers)
      .innerJoin(
        partnerOrganizations,
        eq(partnerOrganizations.id, partnerOrganizationMembers.organizationId),
      )
      .where(and(
        eq(partnerOrganizationMembers.userId, user.id),
        eq(partnerOrganizationMembers.role, "owner"),
        eq(partnerOrganizationMembers.isActive, true),
        ne(partnerOrganizations.status, "archived"),
      ));
    const lockedLastOwnerIds: number[] = [];
    for (const membership of lockedOwnerMemberships) {
      const [otherOwner] = await tx
        .select({ id: partnerOrganizationMembers.id })
        .from(partnerOrganizationMembers)
        .where(and(
          eq(partnerOrganizationMembers.organizationId, membership.organizationId),
          eq(partnerOrganizationMembers.role, "owner"),
          eq(partnerOrganizationMembers.isActive, true),
          ne(partnerOrganizationMembers.userId, user.id),
        ))
        .limit(1);
      if (!otherOwner) lockedLastOwnerIds.push(membership.organizationId);
    }
    if (lockedLastOwnerIds.length) {
      return { ok: false as const, lastOwnerOrganizationIds: lockedLastOwnerIds };
    }
    // Provider summaries can contain personal event text. Under the same
    // user/org legal locks used by Google replacement, delete owned-profile
    // rows and scrub shared-org notes while retaining their blocked state.
    await purgeGoogleCalendarForAccountErasure(tx, {
      userId: current.id,
      organizationIds: lockedOrganizationIds,
    });
    // Commit the retryable raw Clerk id before deleting the local user. The
    // row's permanent HMAC also becomes the no-reprovision tombstone.
    await enqueueAccountErasureIdentity(tx as unknown as typeof db, clerkId);
    // Capture every managed URL before any profile field is cleared or child
    // row is cascaded. The durable outbox insert is part of this transaction;
    // Blob deletion is performed later by the scheduled worker.
    const capturedAssets = await captureAccountAssetErasures(
      tx,
      user.id,
      current.avatarUrl,
    );
    const { artistIds, venueIds } = capturedAssets;

    // 1. Anonymize leads (vendors legitimately kept them as business records).
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

    // 2. Reviews remain useful to the marketplace, but the deleted account's
    // public identity does not. Preserve the verified transaction signal while
    // removing the author's name and account linkage on the subsequent delete.
    await tx
      .update(reviews)
      .set({ authorName: "Utilizator verificat" })
      .where(eq(reviews.authorUserId, user.id));

    // 3. Take any vendor profile out of the public listings and minimize the
    // personal data left on the dormant business record. Contract evidence is
    // kept separately in the append-only legal_acceptances table.
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

    // CP3 #3 — anonymize every CRM projection linked to one of the client's
    // bookings before minimizing its parent. `offer_requests` has no user FK,
    // so a user deletion cannot clean these copied contact/message fields for
    // us. The user row lock above serializes this set with booking creation.
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

    // Rows created by the legacy/direct CRM flow intentionally have no
    // booking_request_id, so the relational update above cannot reach them.
    // Exact account e-mail/phone matches are the only deterministic identity
    // evidence available for those records. Keep the fallback restricted to
    // unlinked rows so it cannot widen the linked booking scope.
    const legacyOfferIdentity = or(
      current.email ? eq(offerRequests.clientEmail, current.email) : undefined,
      current.phone ? eq(offerRequests.clientPhone, current.phone) : undefined,
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

    // Booking notifications freeze recipient/contact/message fields for
    // retryability. Cancel pending sends and minimize outbox plus in-app
    // projections in the same transaction before detaching the user.
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

    // Anonymize the client's bookings BEFORE deleting the user, then let the
    // SET NULL FK detach them. The booking (and its commission) is kept as
    // financial evidence with no personal data, so deletion never hits the
    // commission RESTRICT and never 503s on that path.
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

    // 4. Delete the user row — cascades to event plans, messages,
    //    conversations, invitations and photos; booking_requests.client_user_id
    //    is SET NULL (evidence retained).
    await tx.delete(users).where(eq(users.id, user.id));
    return {
      ok: true as const,
      identityHash,
      artistSlugs: capturedAssets.artists
        .filter(({ isActive }) => isActive)
        .map(({ slug }) => slug),
      venueSlugs: capturedAssets.venues
        .filter(({ isActive }) => isActive)
        .map(({ slug }) => slug),
    };
  }).catch(() => null);
  if (deleted && !deleted.ok && "lastOwnerOrganizationIds" in deleted) {
    return NextResponse.json(
      {
        error: "Transferă proprietatea organizației înainte de ștergerea contului.",
        code: "LAST_ORG_OWNER_TRANSFER_REQUIRED",
        organizationIds: deleted.lastOwnerOrganizationIds,
      },
      { status: 409 },
    );
  }
  if (!deleted?.ok) {
    return NextResponse.json(
      {
        error: "Account deletion could not be completed safely. Please retry.",
        code: "ACCOUNT_ERASURE_RETRY",
        retryable: true,
      },
      { status: 503 },
    );
  }
  // Invalidate only after the atomic local erasure committed. Signed legal
  // evidence is unrelated to the public catalog and remains untouched.
  const publishedArtistSlugs = deleted.artistSlugs;
  const publishedVenueSlugs = deleted.venueSlugs;
  if (publishedArtistSlugs.length > 0) {
    revalidateVendorCatalog("artist", {
      profileSlugs: publishedArtistSlugs,
      directory: true,
      homepage: true,
      services: true,
    });
  }
  if (publishedVenueSlugs.length > 0) {
    revalidateVendorCatalog("venue", {
      profileSlugs: publishedVenueSlugs,
      directory: true,
      homepage: true,
      services: true,
    });
  }
  // 5. Try immediately; the 5-minute workers durably recover any provider or
  // process failure. The raw Clerk id is cleared only after delete/404.
  const identityDeletion = await tryDeleteErasedClerkIdentity(
    deleted.identityHash,
  );

  return NextResponse.json({ success: true, identityDeletion });
}
