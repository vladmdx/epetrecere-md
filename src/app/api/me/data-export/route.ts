// M11 Intern #1 — GDPR data export (Art. 20 — right to portability).
// Returns a JSON blob containing every personal record we hold about the
// authenticated user: profile, leads, bookings, reviews, messages, plans,
// invitations, uploaded photos. No sensitive secrets.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  leads,
  eventPlans,
  reviews,
  chatMessages,
  conversations,
  invitations,
  invitationGuests,
  guestList,
  eventPhotos,
  artists,
  artistImages,
  artistVideos,
  venues,
  venueImages,
  bookingRequests,
  aiConversations,
  notifications,
  wishlistItems,
  legalAcceptances,
  pushSubscriptions,
  pushTokens,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import {
  revealGuestListRecord,
  revealInvitationGuestRecord,
} from "@/lib/privacy/guest-encryption";

export async function GET() {
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
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Leads match by email or phone since legacy leads don't store user id.
  const [
    userLeads,
    userPlans,
    userReviews,
    userConversations,
    userInvitations,
    userPhotos,
    artistProfiles,
    venueProfiles,
    clientBookings,
    userAiConversations,
    userNotifications,
    userWishlist,
    userLegalAcceptances,
    userPushSubscriptions,
    userPushTokens,
  ] = await Promise.all([
    user.email
      ? db.select().from(leads).where(eq(leads.email, user.email))
      : Promise.resolve([]),
    db.select().from(eventPlans).where(eq(eventPlans.userId, user.id)),
    db.select().from(reviews).where(eq(reviews.authorUserId, user.id)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.clientUserId, user.id)),
    db.select().from(invitations).where(eq(invitations.userId, user.id)),
    db.select().from(eventPhotos).where(eq(eventPhotos.userId, user.id)),
    db.select().from(artists).where(eq(artists.userId, user.id)),
    db.select().from(venues).where(eq(venues.userId, user.id)),
    db.select().from(bookingRequests).where(eq(bookingRequests.clientUserId, user.id)),
    db.select().from(aiConversations).where(eq(aiConversations.userId, user.id)),
    db.select().from(notifications).where(eq(notifications.userId, user.id)),
    db.select().from(wishlistItems).where(eq(wishlistItems.userId, user.id)),
    db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, user.id)),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db.select().from(pushTokens).where(eq(pushTokens.userId, user.id)),
  ]);

  const artistIds = artistProfiles.map((profile) => profile.id);
  const venueIds = venueProfiles.map((profile) => profile.id);
  const [ownedArtistImages, ownedArtistVideos, ownedVenueImages, vendorBookings] =
    await Promise.all([
      artistIds.length
        ? db.select().from(artistImages).where(inArray(artistImages.artistId, artistIds))
        : Promise.resolve([]),
      artistIds.length
        ? db.select().from(artistVideos).where(inArray(artistVideos.artistId, artistIds))
        : Promise.resolve([]),
      venueIds.length
        ? db.select().from(venueImages).where(inArray(venueImages.venueId, venueIds))
        : Promise.resolve([]),
      artistIds.length || venueIds.length
        ? db
            .select()
            .from(bookingRequests)
            .where(
              artistIds.length > 0 && venueIds.length > 0
                ? or(
                    inArray(bookingRequests.artistId, artistIds),
                    inArray(bookingRequests.venueId, venueIds),
                  )
                : artistIds.length > 0
                  ? inArray(bookingRequests.artistId, artistIds)
                  : inArray(bookingRequests.venueId, venueIds),
            )
        : Promise.resolve([]),
    ]);

  // Chat messages are scoped via conversations (no direct user FK).
  const conversationIds = userConversations.map((c) => c.id);
  const bookingIds = Array.from(
    new Set([...clientBookings, ...vendorBookings].map((booking) => booking.id)),
  );
  const [conversationMessages, bookingMessages] = await Promise.all([
    conversationIds.length
      ? db.select().from(chatMessages).where(inArray(chatMessages.conversationId, conversationIds))
      : Promise.resolve([]),
    bookingIds.length
      ? db.select().from(chatMessages).where(inArray(chatMessages.bookingRequestId, bookingIds))
      : Promise.resolve([]),
  ]);
  const userMessages = Array.from(
    new Map([...conversationMessages, ...bookingMessages].map((message) => [message.id, message])).values(),
  );

  // Fetch guests for each invitation.
  const guestsByInvitation: Record<number, unknown[]> = {};
  for (const inv of userInvitations) {
    const g = await db
      .select()
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, inv.id));
    guestsByInvitation[inv.id] = g.map(revealInvitationGuestRecord);
  }

  // The planner list is separate from electronic invitations. Include it in
  // the portability export as well, after decrypting it for its owner.
  const plannerGuestsByPlan: Record<number, unknown[]> = {};
  for (const plan of userPlans) {
    const rows = await db
      .select()
      .from(guestList)
      .where(eq(guestList.planId, plan.id));
    plannerGuestsByPlan[plan.id] = rows.map(revealGuestListRecord);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Acesta este exportul complet al datelor tale personale de pe ePetrecere.md. Pentru întrebări: privacy@epetrecere.md",
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      languagePref: user.languagePref,
      createdAt: user.createdAt,
    },
    leads: userLeads,
    eventPlans: userPlans.map((plan) => ({
      ...plan,
      guests: plannerGuestsByPlan[plan.id] ?? [],
    })),
    reviews: userReviews,
    messages: userMessages,
    conversations: userConversations,
    invitations: userInvitations.map((i) => ({
      ...i,
      guests: guestsByInvitation[i.id] ?? [],
    })),
    eventPhotos: userPhotos,
    vendorProfiles: {
      artists: artistProfiles.map((profile) => ({
        ...profile,
        images: ownedArtistImages.filter((image) => image.artistId === profile.id),
        videos: ownedArtistVideos.filter((video) => video.artistId === profile.id),
      })),
      venues: venueProfiles.map((profile) => ({
        ...profile,
        images: ownedVenueImages.filter((image) => image.venueId === profile.id),
      })),
    },
    bookingRequests: Array.from(
      new Map([...clientBookings, ...vendorBookings].map((booking) => [booking.id, booking])).values(),
    ),
    legalAcceptances: userLegalAcceptances,
    notifications: userNotifications,
    aiConversations: userAiConversations,
    wishlist: userWishlist,
    pushSubscriptions: userPushSubscriptions,
    pushTokens: userPushTokens,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="epetrecere-data-${user.id}.json"`,
    },
  });
}
