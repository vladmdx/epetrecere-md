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
import { auth, clerkClient } from "@clerk/nextjs/server";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  leads,
  artists,
  artistImages,
  artistVideos,
  venues,
  venueImages,
  eventPlans,
  eventPhotos,
  reviews,
  bookingRequests,
  partnerOrganizations,
  partnerOrganizationMembers,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import { erasePhotoBatch, photoErasureError, PHOTO_ERASURE_BATCH_SIZE } from "@/lib/moments/erase-photo";
import { BOOKING_CLIENT_ERASURE } from "@/lib/privacy/account-erasure";

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const ownedPlans = await db
    .select({ id: eventPlans.id, momentsSlug: eventPlans.momentsSlug })
    .from(eventPlans)
    .where(eq(eventPlans.userId, user.id));
  const ownedPhotoUrls = ownedPlans.length
    ? await db
        .select({ id: eventPhotos.id, url: eventPhotos.url, planId: eventPhotos.planId })
        .from(eventPhotos)
        .where(inArray(eventPhotos.planId, ownedPlans.map((p) => p.id)))
        .orderBy(asc(eventPhotos.id)).limit(PHOTO_ERASURE_BATCH_SIZE + 1)
    : [];
  const cleanup = await erasePhotoBatch(ownedPhotoUrls.map(photo => ({ ...photo, plan: ownedPlans.find(plan => plan.id === photo.planId)! })), async photo => {
    await db.delete(eventPhotos).where(and(eq(eventPhotos.id, photo.id), eq(eventPhotos.planId, photo.plan.id), eq(eventPhotos.url, photo.url)));
  });
  if (!cleanup.complete) return NextResponse.json(photoErasureError(cleanup.reason!), { status: cleanup.reason === "unverified" ? 409 : 503 });
  const [ownedArtists, ownedVenues] = await Promise.all([
    db.select({ id: artists.id, slug: artists.slug, isActive: artists.isActive, photoUrl: artists.photoUrl }).from(artists).where(eq(artists.userId, user.id)),
    db.select({ id: venues.id, slug: venues.slug, isActive: venues.isActive, menuPdfUrl: venues.menuPdfUrl, ogImageUrl: venues.ogImageUrl }).from(venues).where(and(eq(venues.userId, user.id), isNull(venues.organizationId))),
  ]);
  const artistIds = ownedArtists.map((profile) => profile.id);
  const venueIds = ownedVenues.map((profile) => profile.id);
  const [ownedArtistImages, ownedVenueImages] = await Promise.all([
    artistIds.length
      ? db.select({ url: artistImages.url }).from(artistImages).where(inArray(artistImages.artistId, artistIds))
      : Promise.resolve([]),
    venueIds.length
      ? db.select({ url: venueImages.url }).from(venueImages).where(inArray(venueImages.venueId, venueIds))
      : Promise.resolve([]),
  ]);

  const deleted = await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
    const [current] = await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    if (!current) return true;
    // Lock parents and recheck before any profile minimization. A concurrent
    // upload must not make a retry lose the vendor's original media URLs.
    const plans = await tx.select({ id: eventPlans.id }).from(eventPlans).where(eq(eventPlans.userId, user.id)).for("update");
    if (plans.length) {
      const remaining = await tx.select({ id: eventPhotos.id }).from(eventPhotos).where(inArray(eventPhotos.planId, plans.map(plan => plan.id))).limit(1);
      if (remaining.length) return false;
    }

    // 1. Anonymize leads (vendors legitimately kept them as business records).
    if (user.email) {
      await tx
        .update(leads)
        .set({
          name: "Utilizator șters",
          phone: "deleted",
          email: null,
          message: null,
          wizardData: null,
        })
        .where(eq(leads.email, user.email));
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

    // CP3 #3 — anonymize the client's bookings BEFORE deleting the user, then
    // let the SET NULL FK detach them. The booking (and its commission) is kept
    // as financial evidence with no personal data, so deletion never hits the
    // commission RESTRICT and never 503s on that path.
    await tx
      .update(bookingRequests)
      .set(BOOKING_CLIENT_ERASURE)
      .where(eq(bookingRequests.clientUserId, user.id));

    // 4. Delete the user row — cascades to event plans, messages,
    //    conversations, invitations and photos; booking_requests.client_user_id
    //    is SET NULL (evidence retained).
    await tx.delete(users).where(eq(users.id, user.id));
    return true;
  }).catch(() => false);
  if (!deleted) return NextResponse.json(photoErasureError("remaining"), { status: 503 });
  // Invalidate only after the atomic local erasure committed. Signed legal
  // evidence is unrelated to the public catalog and remains untouched.
  const publishedArtistSlugs = ownedArtists.filter(profile => profile.isActive).map(profile => profile.slug);
  const publishedVenueSlugs = ownedVenues.filter(profile => profile.isActive).map(profile => profile.slug);
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
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const urls = [
      ...ownedArtistImages.map((image) => image.url),
      ...ownedVenueImages.map((image) => image.url),
      ...ownedArtists.map((profile) => profile.photoUrl),
      ...ownedVenues.flatMap((profile) => [profile.menuPdfUrl, profile.ogImageUrl]),
    ].filter((url): url is string => Boolean(url?.includes("blob.vercel-storage.com")));
    if (urls.length > 0) {
      try {
        const { del } = await import("@vercel/blob");
        await del(urls);
      } catch (error) {
        console.error("[delete-account] blob cleanup failed", error);
      }
    }
  }

  // 5. Delete the Clerk account so the user can't log back in.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkId);
  } catch (e) {
    console.error("[delete-account] Clerk delete failed", e);
    // Continue — local data is already gone.
  }

  return NextResponse.json({ success: true });
}
