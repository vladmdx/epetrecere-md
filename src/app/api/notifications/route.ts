import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/planner/ownership";

// M5 — GET /api/notifications
//
// Lists the signed-in user's notifications (newest first) plus an unread
// count. Powers the header bell. Limit is capped so a malicious client
// can't ask for unbounded rows.

export async function GET(req: NextRequest) {
  const gate = await requireAppUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 20),
    50,
  );

  const where = unreadOnly
    ? and(eq(notifications.userId, gate.userId), eq(notifications.isRead, false))
    : eq(notifications.userId, gate.userId);

  const [items, unreadRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, gate.userId),
          eq(notifications.isRead, false),
        ),
      ),
  ]);

  return NextResponse.json({
    notifications: items,
    unreadCount: unreadRows[0]?.count ?? 0,
  });
}

// POST /api/notifications — mark all as read (no body required)
export async function POST() {
  const gate = await requireAppUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, gate.userId),
        eq(notifications.isRead, false),
      ),
    );

  return NextResponse.json({ ok: true });
}
