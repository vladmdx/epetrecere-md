// M11 Intern #1 — GDPR data export (Art. 20 — right to portability).
// Returns a JSON blob containing every personal record we hold about the
// authenticated user: profile, leads, bookings, reviews, messages, plans,
// invitations, uploaded photos. No sensitive secrets.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
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
  eventPhotos,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

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
  ]);

  // Chat messages are scoped via conversations (no direct user FK).
  const conversationIds = userConversations.map((c) => c.id);
  const userMessages = conversationIds.length
    ? await db
        .select()
        .from(chatMessages)
        .where(inArray(chatMessages.conversationId, conversationIds))
    : [];

  // Fetch guests for each invitation.
  const guestsByInvitation: Record<number, unknown[]> = {};
  for (const inv of userInvitations) {
    const g = await db
      .select()
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, inv.id));
    guestsByInvitation[inv.id] = g;
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
    eventPlans: userPlans,
    reviews: userReviews,
    messages: userMessages,
    conversations: userConversations,
    invitations: userInvitations.map((i) => ({
      ...i,
      guests: guestsByInvitation[i.id] ?? [],
    })),
    eventPhotos: userPhotos,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="epetrecere-data-${user.id}.json"`,
    },
  });
}
