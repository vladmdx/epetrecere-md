import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { bookingEffectDeliveries, bookingEffectOutbox } from "@/lib/db/schema";
import {
  acknowledgeBookingEffectDeadLetter,
  requeueBookingEffectDeadLetter,
} from "@/lib/booking/effect-outbox";

const actionSchema = z.object({
  effectId: z.number().int().positive(),
  action: z.enum(["acknowledge", "requeue"]),
  note: z.string().trim().min(3).max(2_000),
});

/** Inspect unresolved terminal effects without making scheduler health sticky. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const effects = await db
    .select()
    .from(bookingEffectOutbox)
    .where(eq(bookingEffectOutbox.status, "dead_letter"))
    .orderBy(desc(bookingEffectOutbox.updatedAt))
    .limit(100);
  const ids = effects.map(({ id }) => id);
  const deliveries = ids.length > 0
    ? await db
        .select()
        .from(bookingEffectDeliveries)
        .where(inArray(bookingEffectDeliveries.effectId, ids))
        .orderBy(desc(bookingEffectDeliveries.updatedAt))
    : [];
  return NextResponse.json(
    { effects, deliveries },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Explicit operator acknowledgement or safe retry of one terminal effect. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { effectId, action, note } = parsed.data;
  const updated = action === "requeue"
    ? await requeueBookingEffectDeadLetter(effectId, note)
    : await acknowledgeBookingEffectDeadLetter(effectId, note);
  if (!updated) {
    return NextResponse.json({ error: "Dead letter not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, effectId, action });
}
