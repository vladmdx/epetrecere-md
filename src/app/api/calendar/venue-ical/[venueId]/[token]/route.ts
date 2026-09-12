// iCal feed for venues — subscribeable from Google / Apple / Outlook calendar.
// Mirrors the artist feed but for venueId-linked bookings.

import { bookingTextForViewer } from "@/lib/privacy/booking-text";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, bookingRequests, calendarEvents, venueScheduleBlocks } from "@/lib/db/schema";
import { verifyVenueIcalToken } from "@/lib/calendar/ical-token";
import { localDatesIntersecting } from "@/lib/booking/zoned-interval";

export const runtime = "nodejs";

function escapeIcs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string; token: string }> },
) {
  const { venueId: venueIdStr, token: rawToken } = await params;
  const venueId = Number(venueIdStr);
  const token = rawToken.replace(/\.ics$/i, "");

  if (!Number.isFinite(venueId) || !(await verifyVenueIcalToken(venueId, token))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) {
    return new NextResponse("Not found", { status: 404 });
  }

  const hallIdRaw = _req.nextUrl.searchParams.get("hallId");
  const hallId = hallIdRaw ? Number(hallIdRaw) : null;

  const [bookings, blackouts, blocks] = await Promise.all([
    db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venueId),
          inArray(bookingRequests.status, ["accepted", "confirmed_by_client"]),
        ),
      ),
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "venue"),
          eq(calendarEvents.entityId, venueId),
          eq(calendarEvents.status, "blocked"),
        ),
      ),
    db.select().from(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, venueId)),
  ]);

  const filteredBookings = hallId && Number.isFinite(hallId)
    ? bookings.filter((b) => b.hallId === hallId)
    : bookings;
  const filteredBlackouts = hallId && Number.isFinite(hallId)
    ? blackouts.filter((c) => c.hallId == null || c.hallId === hallId)
    : blackouts;
  const filteredBlocks = hallId && Number.isFinite(hallId)
    ? blocks.filter((block) => block.hallId == null || block.hallId === hallId)
    : blocks;

  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ePetrecere.md//Venue Calendar//RO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`ePetrecere — ${venue.nameRo}`)}`,
    "X-WR-TIMEZONE:Europe/Chisinau",
  ];

  for (const b of filteredBookings) {
    const shared = b.status === "confirmed_by_client";
    const clientName = bookingTextForViewer(b.clientName, shared);
    const eventType = bookingTextForViewer(b.eventType, shared) ?? "Eveniment";
    const uid = `venue-booking-${b.id}@epetrecere.md`;
    const start = formatDate(b.eventDate);
    const endDate = new Date(b.eventDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = formatDate(endDate);
    const title =
      b.status === "confirmed_by_client"
        ? `✅ ${eventType} — ${clientName}`
        : `🟡 ${eventType} — ${clientName}`;
    const descParts = [
      `Client: ${clientName}`,
      b.guestCount ? `Invitați: ${b.guestCount}` : "",
      b.startTime && b.endTime ? `Ora: ${b.startTime}–${b.endTime}` : "",
    ].filter(Boolean);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${formatDateTime(b.updatedAt ?? b.createdAt ?? now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(descParts.join("\n"))}`,
      `STATUS:${b.status === "confirmed_by_client" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    );
  }

  for (const c of filteredBlackouts) {
    const uid = `venue-blackout-${c.id}@epetrecere.md`;
    const start = formatDate(c.date);
    const endDate = new Date(c.date);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = formatDate(endDate);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${formatDateTime(c.createdAt ?? now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcs("⛔ Indisponibil")}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  for (const block of filteredBlocks) {
    const dates = localDatesIntersecting({
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      timezone: "Europe/Chisinau",
      eventDate: block.startsAt.toISOString().slice(0, 10),
      startTime: null,
      endTime: null,
    });
    for (const date of dates) {
      const uid = `venue-block-${block.id}-${date}@epetrecere.md`;
      const start = formatDate(date);
      const endDate = new Date(date);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const end = formatDate(endDate);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${formatDateTime(block.createdAt ?? now)}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcs("⛔ Indisponibil")}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="epetrecere-venue-${venueId}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
