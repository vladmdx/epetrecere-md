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
import { eq } from "drizzle-orm";
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
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

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

  const ownedPlans = await db
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(eq(eventPlans.userId, user.id));
  const ownedPhotoUrls = ownedPlans.length
    ? await db
        .select({ url: eventPhotos.url })
        .from(eventPhotos)
        .where(inArray(eventPhotos.planId, ownedPlans.map((p) => p.id)))
    : [];
  const [ownedArtists, ownedVenues] = await Promise.all([
    db.select({ id: artists.id, photoUrl: artists.photoUrl }).from(artists).where(eq(artists.userId, user.id)),
    db.select({ id: venues.id, menuPdfUrl: venues.menuPdfUrl, ogImageUrl: venues.ogImageUrl }).from(venues).where(eq(venues.userId, user.id)),
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

  // 1. Anonymize leads (vendors legitimately kept them as business records).
  if (user.email) {
    await db
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
  await db
    .update(reviews)
    .set({ authorName: "Utilizator verificat" })
    .where(eq(reviews.authorUserId, user.id));

  // 3. Take any vendor profile out of the public listings and minimize the
  // personal data left on the dormant business record. Contract evidence is
  // kept separately in the append-only legal_acceptances table.
  await db
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
  await db
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
    .where(eq(venues.userId, user.id));
  if (artistIds.length > 0) {
    await db.delete(artistImages).where(inArray(artistImages.artistId, artistIds));
    await db.delete(artistVideos).where(inArray(artistVideos.artistId, artistIds));
  }
  if (venueIds.length > 0) {
    await db.delete(venueImages).where(inArray(venueImages.venueId, venueIds));
  }

  // 4. Delete the user row — cascades to event plans, messages,
  //    conversations, invitations and photos.
  await db.delete(users).where(eq(users.id, user.id));

  // Database cascades remove photo records. Remove matching Vercel Blob
  // objects as well so account deletion is not limited to the relational DB.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const urls = [
      ...ownedPhotoUrls.map((p) => p.url),
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
