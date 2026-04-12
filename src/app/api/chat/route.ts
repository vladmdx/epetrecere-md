import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { chatMessages, bookingRequests, artists, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Verify the signed-in user is either the client or the artist on this booking
async function verifyBookingAccess(clerkId: string, bookingRequestId: number) {
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return false;

  const [booking] = await db
    .select({ clientUserId: bookingRequests.clientUserId, artistId: bookingRequests.artistId })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);
  if (!booking) return false;

  // Client side
  if (booking.clientUserId === appUser.id) return true;

  // Artist side
  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.id, booking.artistId), eq(artists.userId, appUser.id)))
    .limit(1);
  return !!artist;
}

// GET chat messages for a booking request
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingRequestId = req.nextUrl.searchParams.get("booking_request_id");
  if (!bookingRequestId) return NextResponse.json({ error: "booking_request_id required" }, { status: 400 });

  const hasAccess = await verifyBookingAccess(clerkId, Number(bookingRequestId));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.bookingRequestId, Number(bookingRequestId)))
    .orderBy(chatMessages.createdAt)
    .limit(100);

  return NextResponse.json(messages);
}

// SEND chat message
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { bookingRequestId, senderType, senderName, message } = body;

  if (!bookingRequestId || !senderType || !senderName || !message) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  const hasAccess = await verifyBookingAccess(clerkId, Number(bookingRequestId));
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [msg] = await db.insert(chatMessages).values({
    bookingRequestId,
    senderType,
    senderName,
    message,
  }).returning();

  return NextResponse.json(msg, { status: 201 });
}
