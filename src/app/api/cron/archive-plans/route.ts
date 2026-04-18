// Nightly cron: event_plans whose event_date is more than 7 days in the
// past get flipped from "active" → "completed" and stamped archivedAt.
// This feeds the sidebar's conditional "Arhivă" link so finished events
// move out of the Evenimentele Mele section automatically.
//
// Scheduled via vercel.json at 03:00 UTC daily. Protected by
// CRON_SECRET — Vercel automatically sends `Authorization: Bearer <secret>`
// if the env var is configured.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { and, eq, lt, isNotNull } from "drizzle-orm";

export const runtime = "nodejs";
// Opt out of caching so each cron tick hits the DB.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // AuthZ — on Vercel, crons send the Authorization header automatically
  // when CRON_SECRET is set in env. Refuse otherwise so the endpoint isn't
  // externally invokable.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const toArchive = await db
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.status, "active"),
        isNotNull(eventPlans.eventDate),
        lt(eventPlans.eventDate, cutoffIso),
      ),
    );

  if (toArchive.length === 0) {
    return NextResponse.json({ archived: 0, cutoff: cutoffIso });
  }

  const now = new Date();
  await db
    .update(eventPlans)
    .set({ status: "completed", archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(eventPlans.status, "active"),
        isNotNull(eventPlans.eventDate),
        lt(eventPlans.eventDate, cutoffIso),
      ),
    );

  return NextResponse.json({
    archived: toArchive.length,
    cutoff: cutoffIso,
    ids: toArchive.map((r) => r.id),
  });
}
