import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET chat messages for a booking request
export async function GET(req: NextRequest) {
  const bookingRequestId = req.nextUrl.searchParams.get("booking_request_id");
  if (!bookingRequestId) return NextResponse.json({ error: "booking_request_id required" }, { status: 400 });

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
  const body = await req.json();
  const { bookingRequestId, senderType, senderName, message } = body;

  if (!bookingRequestId || !senderType || !senderName || !message) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  const [msg] = await db.insert(chatMessages).values({
    bookingRequestId,
    senderType,
    senderName,
    message,
  }).returning();

  return NextResponse.json(msg, { status: 201 });
}
