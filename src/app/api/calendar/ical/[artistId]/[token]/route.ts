import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, bookingRequests, calendarEvents } from "@/lib/db/schema";
import { verifyIcalToken } from "@/lib/calendar/ical-token";

// M5 — GET /api/calendar/ical/[artistId]/[token].ics
//
// Public iCal feed that Google / Apple / Outlook can subscribe to so the
// vendor sees their confirmed bookings in their personal calendar. The
// token is derived via HMAC of artistId + process secret so no DB column
// is required; anyone with the URL can read (but the URL is unguessable).
//
// Covers:
//  • bookingRequests in accepted / confirmed_by_client state
//  • calendarEvents rows marked "blocked" (vendor-managed blackout dates)
//
// Calendar clients re-fetch periodically so just returning a fresh ICS
// document every time is enough.

export const runtime = "nodejs";

function escapeIcs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatDate(date: string | Date): string {
  // All-day format: YYYYMMDD
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
  { params }: { params: Promise<{ artistId: string; token: string }> },
) {
  const { artistId: artistIdStr, token: rawToken } = await params;
  const artistId = Number(artistIdStr);
  // Strip a trailing ".ics" if the client asked for it
  const token = rawToken.replace(/\.ics$/i, "");

  if (!Number.isFinite(artistId) || !verifyIcalToken(artistId, token)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [artist] = await db
    .select({ id: artists.id, nameRo: artists.nameRo })
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);
  if (!artist) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [bookings, blackouts] = await Promise.all([
    db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.artistId, artistId),
          inArray(bookingRequests.status, ["accepted", "confirmed_by_client"]),
        ),
      ),
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.entityType, "artist"),
          eq(calendarEvents.entityId, artistId),
          eq(calendarEvents.status, "blocked"),
        ),
      ),
  ]);

  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ePetrecere.md//Vendor Calendar//RO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`ePetrecere — ${artist.nameRo}`)}`,
    "X-WR-TIMEZONE:Europe/Chisinau",
  ];

  for (const b of bookings) {
    const uid = `booking-${b.id}@epetrecere.md`;
    const start = formatDate(b.eventDate);
    // iCal all-day DTEND is exclusive (next day)
    const endDate = new Date(b.eventDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = formatDate(endDate);
    const title =
      b.status === "confirmed_by_client"
        ? `✅ ${b.eventType ?? "Eveniment"} — ${b.clientName}`
        : `🟡 ${b.eventType ?? "Eveniment"} — ${b.clientName}`;
    const descParts = [
      `Client: ${b.clientName}`,
      b.clientPhone ? `Telefon: ${b.clientPhone}` : "",
      b.guestCount ? `Invitați: ${b.guestCount}` : "",
      b.startTime && b.endTime ? `Ora: ${b.startTime}–${b.endTime}` : "",
      b.message ? `Mesaj: ${b.message}` : "",
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

  for (const c of blackouts) {
    const uid = `blackout-${c.id}@epetrecere.md`;
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
      `SUMMARY:${escapeIcs(`⛔ Indisponibil${c.note ? ` — ${c.note}` : ""}`)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // iCal requires CRLF line endings
  const body = lines.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="epetrecere-${artistId}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
