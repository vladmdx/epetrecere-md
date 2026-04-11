import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/planner/ownership";

// M5 — PATCH / DELETE /api/notifications/[id]
//
// Per-row mark-as-read and delete for the bell. Ownership is enforced via
// a WHERE clause tying the notification to the signed-in user.

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAppUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notifId),
        eq(notifications.userId, gate.userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ notification: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAppUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const notifId = Number(id);
  if (!Number.isFinite(notifId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, notifId),
        eq(notifications.userId, gate.userId),
      ),
    );

  return NextResponse.json({ ok: true });
}
