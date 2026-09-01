/**
 * Commission persistence: read the configured rules, and create/settle the
 * per-booking fee rows.
 *
 * The fee is raised when a booking reaches "confirmed" — per Tariffs §5 the
 * obligation is born at the "Comandă confirmată" status. Settlement is manual
 * (bank transfer / card outside the platform), so an admin flips the row to
 * `paid` and we record who did it and when.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  bookingRequests,
  siteSettings,
} from "@/lib/db/schema";
import {
  COMMISSION_RULES_KEY,
  computeCommission,
  normalizeRules,
  type CommissionRules,
} from "./rules";

/** Tariffs §7 — payable within 10 calendar days unless agreed otherwise. */
const PAYMENT_TERM_DAYS = 10;

/** Booking statuses that mean "the order is confirmed" and the fee is due. */
export const FEE_TRIGGER_STATUSES = ["confirmed_by_client", "completed"] as const;

export async function getCommissionRules(): Promise<CommissionRules> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, COMMISSION_RULES_KEY))
    .limit(1);
  return normalizeRules(row?.value);
}

export async function saveCommissionRules(rules: CommissionRules): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: COMMISSION_RULES_KEY, value: rules })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: rules },
    });
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ensure a commission row exists for a confirmed booking. Idempotent: the
 * unique index on booking_request_id means repeated calls (re-confirmation,
 * status bouncing) never double-charge.
 *
 * Returns the commission id, or null when no fee applies — unpriced booking,
 * or a venue tier the admin hasn't configured yet.
 */
export async function ensureCommissionForBooking(
  bookingRequestId: number,
): Promise<number | null> {
  const [b] = await db
    .select({
      id: bookingRequests.id,
      artistId: bookingRequests.artistId,
      venueId: bookingRequests.venueId,
      status: bookingRequests.status,
      agreedPrice: bookingRequests.agreedPrice,
      guestCount: bookingRequests.guestCount,
      // The agreement prices a venue by event type as well as by size, so the
      // fee cannot be worked out without it. It was not selected before,
      // because until now the venue tiers were a single global threshold.
      eventType: bookingRequests.eventType,
      source: bookingRequests.source,
    })
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .limit(1);

  if (!b) return null;
  if (!FEE_TRIGGER_STATUSES.includes(b.status as (typeof FEE_TRIGGER_STATUSES)[number])) {
    return null;
  }
  // A vendor blocking their own calendar is not a marketplace transaction —
  // the client name on those rows is literally "Rezervare manuală". Charging
  // a fee on one would bill an artist for their own bookkeeping.
  if (b.source === "manual") return null;

  const [existing] = await db
    .select({ id: commissions.id })
    .from(commissions)
    .where(eq(commissions.bookingRequestId, bookingRequestId))
    .limit(1);
  if (existing) return existing.id;

  // Exactly one vendor per booking is the data-model invariant. If both ids
  // are somehow set the fee is ambiguous — which side owes what, at which
  // rate — so refuse rather than silently bill the artist rate to a venue.
  if (b.artistId && b.venueId) {
    console.error(
      "[commissions] booking",
      bookingRequestId,
      "names both an artist and a venue; no fee raised",
    );
    return null;
  }
  const vendorType: "artist" | "venue" | null = b.artistId
    ? "artist"
    : b.venueId
      ? "venue"
      : null;
  if (!vendorType) return null;

  // The order value is the negotiated price. Without one there is nothing to
  // charge a percentage of — Tariffs §3 requires the partner to state it.
  const baseAmount = b.agreedPrice ?? 0;
  const rules = await getCommissionRules();
  const result = computeCommission(
    {
      vendorType,
      baseAmount,
      guestCount: b.guestCount,
      eventType: b.eventType,
    },
    rules,
  );
  if (!result) return null;

  const [created] = await db
    .insert(commissions)
    .values({
      bookingRequestId,
      vendorType,
      artistId: b.artistId ?? null,
      venueId: b.venueId ?? null,
      baseAmount,
      currency: result.currency,
      rateBps: result.rateBps,
      amount: result.amount,
      guestCount: b.guestCount ?? null,
      tier: result.tier,
      dueDate: addDays(PAYMENT_TERM_DAYS),
    })
    .onConflictDoNothing({ target: commissions.bookingRequestId })
    .returning({ id: commissions.id });

  return created?.id ?? null;
}

/** Admin records a manual settlement. */
export async function markCommissionPaid(
  commissionId: number,
  adminUserId: string,
  opts: { method?: string; note?: string } = {},
): Promise<void> {
  await db
    .update(commissions)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidBy: adminUserId,
      paymentMethod: opts.method ?? null,
      paymentNote: opts.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));
}

/** Admin reverts a settlement or writes the fee off. */
export async function setCommissionStatus(
  commissionId: number,
  status: "pending" | "invoiced" | "cancelled" | "waived",
  note?: string,
): Promise<void> {
  await db
    .update(commissions)
    .set({
      status,
      paidAt: null,
      paidBy: null,
      paymentNote: note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));
}

/**
 * Cancel the fee attached to a booking, if one was raised.
 *
 * Tariffs §10: the obligation dies with the event. Without this a venue kept
 * owing 100 € for a wedding that was called off — the status change moved the
 * booking but left the ledger row sitting at `pending`.
 *
 * A fee already marked `paid` is left alone: money that changed hands is a
 * refund conversation, not a status flip.
 */
export async function cancelCommissionForBooking(
  bookingRequestId: number,
  note: string,
): Promise<void> {
  await db
    .update(commissions)
    .set({
      status: "cancelled",
      paymentNote: note,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(commissions.bookingRequestId, bookingRequestId),
        sql`${commissions.status} in ('pending','invoiced')`,
      ),
    );
}

export interface CommissionTotals {
  pending: number;
  paid: number;
  overdue: number;
  count: number;
}

/** Totals for a dashboard header. Scope with artistId/venueId, or omit for all. */
export async function getCommissionTotals(scope?: {
  artistId?: number;
  venueId?: number;
}): Promise<CommissionTotals> {
  const where = scope?.artistId
    ? eq(commissions.artistId, scope.artistId)
    : scope?.venueId
      ? eq(commissions.venueId, scope.venueId)
      : undefined;

  const [row] = await db
    .select({
      pending: sql<number>`coalesce(sum(case when ${commissions.status} in ('pending','invoiced') then ${commissions.amount} else 0 end),0)::int`,
      paid: sql<number>`coalesce(sum(case when ${commissions.status} = 'paid' then ${commissions.amount} else 0 end),0)::int`,
      overdue: sql<number>`coalesce(sum(case when ${commissions.status} in ('pending','invoiced') and ${commissions.dueDate} < current_date then ${commissions.amount} else 0 end),0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissions)
    .where(where);

  return row ?? { pending: 0, paid: 0, overdue: 0, count: 0 };
}

/** Backfill: raise fees for already-confirmed bookings that predate this feature. */
export async function backfillCommissions(): Promise<{ created: number; skipped: number }> {
  const rows = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(
      // No agreed-price filter: a venue's flat fee is owed on a confirmed
      // event whatever the price was, and computeCommission decides whether a
      // row is due. Filtering here used to hide those bookings entirely.
      and(
        sql`${bookingRequests.status} in ('confirmed_by_client','completed')`,
        sql`${bookingRequests.source} <> 'manual'`,
      ),
    );
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const id = await ensureCommissionForBooking(r.id);
    if (id) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}
