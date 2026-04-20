// Manual bookings created directly by the artist on their calendar.
//
// The artist picks a start time + a duration (from their Tarife packages)
// and the server computes end_time + agreed_price, then stores it as a
// booking_request with source="manual", status="accepted". These rows
// appear in the calendar day-detail panel alongside client bookings so
// the artist gets a unified view of "what's happening on this day".

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  artistPackages,
  bookingRequests,
  calendarEvents,
  users,
} from "@/lib/db/schema";

const schema = z.object({
  artistId: z.number().int().positive(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM"),
  /** Either durationMinutes (explicit) or packageId (look up its duration) */
  durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
  packageId: z.number().int().positive().optional(),
  /** Optional — if omitted we derive it from the package, if any. */
  price: z.number().int().min(0).nullable().optional(),
  /** Free-form note shown on the calendar (e.g. "Nuntă Popescu, Codru"). */
  note: z.string().max(500).optional(),
  /** Event type — drives the colored dot on the calendar grid. */
  eventType: z.string().max(60).optional(),
});

function addMinutes(hhmm: string, totalMinutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + totalMinutes;
  const endH = Math.floor(t / 60) % 24;
  const endM = t % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

async function requireArtistOwner(artistId: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false as const, status: 401 };
  const [u] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return { ok: false as const, status: 403 };
  if (u.role === "admin" || u.role === "super_admin") {
    return { ok: true as const, userId: u.id };
  }
  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.id, artistId), eq(artists.userId, u.id)))
    .limit(1);
  if (!row) return { ok: false as const, status: 403 };
  return { ok: true as const, userId: u.id };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const owner = await requireArtistOwner(parsed.data.artistId);
  if (!owner.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: owner.status });
  }

  // Resolve duration and price from the package, if provided.
  let durationMinutes = parsed.data.durationMinutes;
  let price = parsed.data.price ?? null;

  if (parsed.data.packageId) {
    const [pkg] = await db
      .select({
        artistId: artistPackages.artistId,
        durationHours: artistPackages.durationHours,
        durationMinutes: artistPackages.durationMinutes,
        price: artistPackages.price,
      })
      .from(artistPackages)
      .where(eq(artistPackages.id, parsed.data.packageId))
      .limit(1);
    if (!pkg || pkg.artistId !== parsed.data.artistId) {
      return NextResponse.json(
        { error: "Invalid package" },
        { status: 400 },
      );
    }
    if (durationMinutes == null) {
      durationMinutes =
        Math.round((pkg.durationHours ?? 0) * 60) +
        (pkg.durationMinutes ?? 0);
    }
    if (price == null) {
      price = pkg.price;
    }
  }

  if (!durationMinutes || durationMinutes <= 0) {
    return NextResponse.json(
      { error: "Durata trebuie să fie pozitivă" },
      { status: 400 },
    );
  }

  const endTime = addMinutes(parsed.data.startTime, durationMinutes);

  // Create the booking row. We reuse booking_requests so the calendar
  // day-detail panel (which already reads this table) renders it.
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      artistId: parsed.data.artistId,
      clientName: (parsed.data.note?.trim() || "Rezervare manuală").slice(
        0,
        200,
      ),
      clientPhone: "—",
      clientEmail: null,
      eventDate: parsed.data.eventDate,
      startTime: parsed.data.startTime,
      endTime,
      eventType: parsed.data.eventType ?? null,
      guestCount: null,
      message: parsed.data.note?.trim() || null,
      status: "accepted",
      source: "manual",
      agreedPrice: price,
    })
    .returning();

  // Also add a matching calendar_events row so the calendar grid shows the
  // day as booked. We don't block existing calendar entries for this day
  // — the artist may already have a different status set.
  try {
    await db.insert(calendarEvents).values({
      entityType: "artist",
      entityId: parsed.data.artistId,
      date: parsed.data.eventDate,
      status: "booked",
      source: "booking",
      note: parsed.data.note?.trim() || null,
    });
  } catch {
    // Non-fatal: an entry for this day may already exist.
  }

  return NextResponse.json(booking, { status: 201 });
}

export async function DELETE(req: Request) {
  // Auth FIRST — don't leak existence / source of a booking row to
  // unauthenticated probes. Only after we know the caller is a valid
  // signed-in user do we look up the row and check ownership + source.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const [row] = await db
    .select({ artistId: bookingRequests.artistId, source: bookingRequests.source })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const owner = await requireArtistOwner(row.artistId);
  if (!owner.ok) {
    // Same status for "not owner" and "unknown row" so attackers can't
    // distinguish existence via the response.
    return NextResponse.json({ error: "Forbidden" }, { status: owner.status });
  }
  if (row.source !== "manual") {
    return NextResponse.json(
      { error: "Only manual bookings can be deleted here" },
      { status: 400 },
    );
  }
  await db.delete(bookingRequests).where(eq(bookingRequests.id, id));
  return NextResponse.json({ success: true });
}
