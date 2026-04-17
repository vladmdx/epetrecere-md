// Artist availability slots — granular windows the artist declares they
// are free (and at what price). Multiple slots per day are allowed.
//
// GET  ?artist_id=N [&from=YYYY-MM-DD&to=YYYY-MM-DD]  → public
// POST                                                  → artist-owner only

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistAvailabilitySlots, artists, users } from "@/lib/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  if (!artistId) {
    return NextResponse.json({ error: "artist_id required" }, { status: 400 });
  }
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const conditions = [eq(artistAvailabilitySlots.artistId, Number(artistId))];
  if (from) conditions.push(gte(artistAvailabilitySlots.date, from));
  if (to) conditions.push(lte(artistAvailabilitySlots.date, to));

  const slots = await db
    .select()
    .from(artistAvailabilitySlots)
    .where(and(...conditions))
    .orderBy(
      asc(artistAvailabilitySlots.date),
      asc(artistAvailabilitySlots.startTime),
    );

  return NextResponse.json({ slots });
}

const createSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
  price: z.number().int().nonnegative().optional().nullable(),
  note: z.string().max(280).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Resolve the signed-in user's artist profile — only the owner can post.
  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) {
    return NextResponse.json(
      { error: "No artist profile for this user." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Sanity check: end must be after start (same-day slots only).
  if (parsed.data.startTime >= parsed.data.endTime) {
    return NextResponse.json(
      { error: "endTime must be after startTime" },
      { status: 400 },
    );
  }

  const [slot] = await db
    .insert(artistAvailabilitySlots)
    .values({
      artistId: artist.id,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      price: parsed.data.price ?? null,
      note: parsed.data.note ?? null,
    })
    .returning();

  return NextResponse.json({ slot }, { status: 201 });
}
