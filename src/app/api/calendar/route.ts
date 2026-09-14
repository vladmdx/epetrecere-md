import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireVenueCapability, authorizeVenueAccess } from "@/lib/venue-access";
import { users, artists } from "@/lib/db/schema";
import { calendarEventForViewer } from "@/lib/privacy/booking-text";
import {
  getCalendarEvents,
  bulkSetCalendarEvents,
} from "@/lib/db/queries/calendar";
import {
  CalendarWriteValidationError,
  isValidCalendarDate,
  isValidCalendarMonth,
  type ManagedCalendarReplacementOptions,
} from "@/lib/booking/calendar-write";
import {
  artistCalendarWriteAuthorization,
  CalendarWriteAuthorizationError,
  venueCalendarWriteAuthorization,
} from "@/lib/booking/calendar-write-authorization";

const getSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.coerce.number().int().positive(),
  month: z.string().refine(isValidCalendarMonth, {
    message: "Month must be a real YYYY-MM calendar month",
  }),
});

const postSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.number().int().positive(),
  dates: z
    .array(
      z.string().refine(isValidCalendarDate, {
        message: "Date must be a real YYYY-MM-DD calendar date",
      }),
    )
    .min(1)
    .max(366)
    .refine((dates) => new Set(dates).size === dates.length, {
      message: "Duplicate dates are not allowed",
    }),
  status: z.enum(["available", "booked", "tentative", "blocked"]),
  note: z.string().max(500).nullable().optional(),
  event_type: z.string().max(120).nullable().optional(),
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

  // Public availability never includes private notes or free-text event names.
  // Keep those fields for the entity owner/admin's calendar editing surface.
  let privileged = false;
  const { userId: clerkId } = await auth();
  if (clerkId) {
    const [user] = await db.select({ id: users.id, role: users.role }).from(users)
      .where(eq(users.clerkId, clerkId)).limit(1);
    if (user) {
      privileged = user.role === "admin" || user.role === "super_admin";
      if (!privileged) {
        if (parsed.data.entity_type === "venue") {
          // ADR 0028 / CP3 #2 — private notes visible to venue members only.
          const access = await authorizeVenueAccess(
            { id: user.id, role: user.role, isGlobalAdmin: false },
            parsed.data.entity_id,
          );
          privileged = access.ok;
        } else {
          const [owner] = await db.select({ userId: artists.userId }).from(artists)
            .where(eq(artists.id, parsed.data.entity_id)).limit(1);
          privileged = owner?.userId === user.id;
        }
      }
    }
  }

  // Normalize dates to YYYY-MM-DD to avoid timezone issues
  const normalized = events.map((e) => ({
    ...calendarEventForViewer(e, privileged),
    date: normalizeDate(e.date),
  }));

  return NextResponse.json(normalized, { headers: { "Cache-Control": "private, no-store" } });
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
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fast preflight for a useful response. The same authority is locked and
  // rechecked inside the calendar replacement transaction below.
  let writeAuthorization: ManagedCalendarReplacementOptions;
  if (parsed.data.entity_type === "artist") {
    const [artist] = await db
      .select({ id: artists.id, userId: artists.userId })
      .from(artists)
      .where(eq(artists.id, parsed.data.entity_id))
      .limit(1);
    if (!artist || artist.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    writeAuthorization = artistCalendarWriteAuthorization({
      userId: appUser.id,
      artistId: parsed.data.entity_id,
    });
  } else {
    // ADR 0028 — venue ownership via the membership chain (IDOR-safe).
    const access = await requireVenueCapability(parsed.data.entity_id, "manage_calendar");
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    writeAuthorization = venueCalendarWriteAuthorization({
      user: access.user,
      venueId: parsed.data.entity_id,
      organizationId: access.organizationId,
    });
  }

  try {
    await bulkSetCalendarEvents(
      parsed.data.entity_type,
      parsed.data.entity_id,
      parsed.data.dates,
      parsed.data.status,
      "manual",
      parsed.data.note ?? null,
      parsed.data.event_type ?? null,
      writeAuthorization,
    );
  } catch (error) {
    if (error instanceof CalendarWriteAuthorizationError) {
      return NextResponse.json(
        { error: "Forbidden", code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof CalendarWriteValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}
