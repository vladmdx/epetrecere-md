// Hourly cron: booking_requests stuck in status "pending" for more than
// 24h get flipped to "expired" so the client's category slot frees up
// and the artist's inbox stays clean. Mirrors the Inngest function in
// src/lib/inngest/functions.ts (expire-pending-bookings-24h) but runs
// on Vercel cron — redundant by design so a missed Inngest tick can't
// leave stale "Așteaptă răspunsul…" blockers in the discovery UI.
//
// Scheduled via vercel.json. Protected by CRON_SECRET — Vercel attaches
// `Authorization: Bearer <secret>` automatically when the env var is set.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookingRequests, users, artists, venues } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/expire-bookings] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Snapshot what we're about to expire so we can notify the clients
  // by email + bell. Pull artist/venue names so the message reads
  // naturally ("Igor Nedoseikin nu a răspuns…").
  const stale = await db
    .select({
      id: bookingRequests.id,
      clientUserId: bookingRequests.clientUserId,
      clientEmail: bookingRequests.clientEmail,
      clientName: bookingRequests.clientName,
      eventDate: bookingRequests.eventDate,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.status, "pending"),
        sql`${bookingRequests.createdAt} < NOW() - INTERVAL '24 hours'`,
      ),
    );

  if (stale.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  // Single UPDATE so the writer runs in one statement.
  await db
    .update(bookingRequests)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(bookingRequests.status, "pending"),
        sql`${bookingRequests.createdAt} < NOW() - INTERVAL '24 hours'`,
      ),
    );

  // Notify each affected client. Best-effort — failures are logged but
  // never block the cron, and the row is already flipped.
  void (async () => {
    for (const b of stale) {
      try {
        let vendorName = "partenerul";
        if (b.artistId) {
          const [a] = await db
            .select({ name: artists.nameRo })
            .from(artists)
            .where(eq(artists.id, b.artistId))
            .limit(1);
          if (a) vendorName = a.name;
        } else if (b.venueId) {
          const [v] = await db
            .select({ name: venues.nameRo })
            .from(venues)
            .where(eq(venues.id, b.venueId))
            .limit(1);
          if (v) vendorName = v.name;
        }
        if (b.clientUserId) {
          const [u] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, b.clientUserId))
            .limit(1);
          await dispatchNotification({
            userId: b.clientUserId,
            type: "booking_status_changed",
            title: `Cererea către ${vendorName} a expirat`,
            message: `Nu a răspuns în 24h. Poți încerca alt ${b.artistId ? "artist" : "partener"} pentru data ${b.eventDate}.`,
            actionUrl: "/cabinet/rezervari",
            email: u?.email ?? undefined,
            emailSubject: `Cererea ta către ${vendorName} a expirat`,
          });
        }
      } catch (err) {
        console.error(`[cron/expire-bookings] notify failed for #${b.id}:`, err);
      }
    }
  })();

  return NextResponse.json({
    expired: stale.length,
    ids: stale.map((b) => b.id),
  });
}
