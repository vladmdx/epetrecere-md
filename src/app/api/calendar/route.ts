import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import {
  getCalendarEvents,
  bulkSetCalendarEvents,
} from "@/lib/db/queries/calendar";

const getSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.coerce.number(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const postSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.number(),
  dates: z.array(z.string()),
  status: z.enum(["available", "booked", "tentative", "blocked"]),
  note: z.string().nullable().optional(),
  event_type: z.string().nullable().optional(),
});

/** Normalize a date value to YYYY-MM-DD string, handling timezone offsets */
function normalizeDate(d: string | Date): string {
  if (typeof d === "string") {
    // If already YYYY-MM-DD, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // If ISO timestamp, parse and extract local date
    const dt = new Date(d);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  if (d instanceof Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return String(d);
}

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = getSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params", details: parsed.error.issues }, { status: 400 });
  }

  const events = await getCalendarEvents(
    parsed.data.entity_type,
    parsed.data.entity_id,
    parsed.data.month,
  );

  // Normalize dates to YYYY-MM-DD to avoid timezone issues
  const normalized = events.map((e) => ({
    ...e,
    date: normalizeDate(e.date),
  }));

  return NextResponse.json(normalized);
}

export async function POST(req: Request) {
  // Ownership-gated write: the signed-in user must own the entity
  // (artist.userId or venue.userId === users.id derived from Clerk session).
  // Same pattern as PUT /api/venues/[id] and PUT /api/artists/[id].
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership of the target entity before touching its calendar.
  if (parsed.data.entity_type === "artist") {
    const [artist] = await db
      .select({ id: artists.id, userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, parsed.data.entity_id))
      .limit(1);
    if (!artist || artist.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const [venue] = await db
      .select({ id: venues.id, userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, parsed.data.entity_id))
      .limit(1);
    if (!venue || venue.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await bulkSetCalendarEvents(
    parsed.data.entity_type,
    parsed.data.entity_id,
    parsed.data.dates,
    parsed.data.status,
    "manual",
    parsed.data.note ?? null,
    parsed.data.event_type ?? null,
  );

  return NextResponse.json({ success: true });
}
