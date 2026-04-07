import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { bookingRequests, offerRequests } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

const bookingSchema = z.object({
  artistId: z.number(),
  clientName: z.string().min(2),
  clientPhone: z.string().min(6),
  clientEmail: z.string().optional(),
  eventDate: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventType: z.string().optional(),
  guestCount: z.number().optional(),
  message: z.string().optional(),
});

// GET booking requests (for artist or client)
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  const clientEmail = req.nextUrl.searchParams.get("client_email");

  const conditions = [];
  if (artistId) conditions.push(eq(bookingRequests.artistId, Number(artistId)));
  if (clientEmail) conditions.push(eq(bookingRequests.clientEmail, clientEmail));

  const result = await db
    .select()
    .from(bookingRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingRequests.createdAt))
    .limit(50);

  return NextResponse.json(result);
}

// CREATE booking request
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`booking:${ip}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  // Create booking request
  const [booking] = await db.insert(bookingRequests).values({
    ...parsed.data,
    status: "pending",
  }).returning();

  // Also create offer request for admin
  await db.insert(offerRequests).values({
    artistId: parsed.data.artistId,
    clientName: parsed.data.clientName,
    clientPhone: parsed.data.clientPhone,
    clientEmail: parsed.data.clientEmail,
    eventType: parsed.data.eventType,
    eventDate: parsed.data.eventDate,
    message: parsed.data.message,
    status: "new",
  });

  return NextResponse.json(booking, { status: 201 });
}
