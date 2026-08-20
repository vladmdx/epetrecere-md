/**
 * Commissions API.
 *
 * GET  — list fees. Admins see everything; a vendor sees only their own rows
 *        (their artist profile and/or their venue). Never cross-scoped.
 * PATCH— admin-only settlement: mark paid / revert / waive. Payment happens
 *        off-platform (bank transfer, card), so this is a manual record.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  bookingRequests,
  artists,
  venues,
  users,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import {
  markCommissionPaid,
  setCommissionStatus,
} from "@/lib/commissions/service";

export const dynamic = "force-dynamic";

/** Resolve the signed-in user's vendor scope (artist and/or venue they own). */
async function getVendorScope() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [u] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return null;
  const [a] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, u.id))
    .limit(1);
  const [v] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, u.id))
    .limit(1);
  return { user: u, artistId: a?.id ?? null, venueId: v?.id ?? null };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const isAdmin = admin.ok;

  let scopeWhere;
  if (!isAdmin) {
    const scope = await getVendorScope();
    if (!scope) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parts = [];
    if (scope.artistId) parts.push(eq(commissions.artistId, scope.artistId));
    if (scope.venueId) parts.push(eq(commissions.venueId, scope.venueId));
    // A user with neither profile has no fees to see.
    if (parts.length === 0) {
      return NextResponse.json({ items: [], totals: emptyTotals() });
    }
    scopeWhere = parts.length === 1 ? parts[0] : or(...parts);
  }

  const status = req.nextUrl.searchParams.get("status");
  const statusWhere =
    status && status !== "all"
      ? inArray(commissions.status, status.split(",") as never[])
      : undefined;

  const where =
    scopeWhere && statusWhere
      ? and(scopeWhere, statusWhere)
      : (scopeWhere ?? statusWhere);

  const items = await db
    .select({
      id: commissions.id,
      bookingRequestId: commissions.bookingRequestId,
      vendorType: commissions.vendorType,
      artistId: commissions.artistId,
      venueId: commissions.venueId,
      baseAmount: commissions.baseAmount,
      currency: commissions.currency,
      rateBps: commissions.rateBps,
      amount: commissions.amount,
      guestCount: commissions.guestCount,
      tier: commissions.tier,
      status: commissions.status,
      dueDate: commissions.dueDate,
      paidAt: commissions.paidAt,
      paymentMethod: commissions.paymentMethod,
      paymentNote: commissions.paymentNote,
      createdAt: commissions.createdAt,
      // Context so the table reads without extra lookups.
      clientName: bookingRequests.clientName,
      clientEmail: bookingRequests.clientEmail,
      eventDate: bookingRequests.eventDate,
      bookingStatus: bookingRequests.status,
      artistName: artists.nameRo,
      venueName: venues.nameRo,
    })
    .from(commissions)
    .leftJoin(bookingRequests, eq(bookingRequests.id, commissions.bookingRequestId))
    .leftJoin(artists, eq(artists.id, commissions.artistId))
    .leftJoin(venues, eq(venues.id, commissions.venueId))
    .where(where)
    .orderBy(desc(commissions.createdAt))
    .limit(500);

  const [totals] = await db
    .select({
      pending: sql<number>`coalesce(sum(case when ${commissions.status} in ('pending','invoiced') then ${commissions.amount} else 0 end),0)::int`,
      paid: sql<number>`coalesce(sum(case when ${commissions.status} = 'paid' then ${commissions.amount} else 0 end),0)::int`,
      overdue: sql<number>`coalesce(sum(case when ${commissions.status} in ('pending','invoiced') and ${commissions.dueDate} < current_date then ${commissions.amount} else 0 end),0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissions)
    .where(scopeWhere);

  return NextResponse.json({ items, totals: totals ?? emptyTotals(), isAdmin });
}

function emptyTotals() {
  return { pending: 0, paid: 0, overdue: 0, count: 0 };
}

/**
 * POST /api/commissions — admin-only reconciliation.
 *
 * Fees are raised by a fire-and-forget hook when a booking is confirmed, so a
 * transient DB blip can drop one with nothing but a console line to show for
 * it. This is the recovery path: it walks every confirmed order and creates
 * the rows that are missing. Idempotent — the unique index on
 * booking_request_id means running it twice changes nothing.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const { backfillCommissions } = await import("@/lib/commissions/service");
  const result = await backfillCommissions();
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: number;
    status?: string;
    method?: string;
    note?: string;
  };
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body.status === "paid") {
    await markCommissionPaid(id, admin.userId, {
      method: body.method,
      note: body.note,
    });
  } else if (
    body.status === "pending" ||
    body.status === "invoiced" ||
    body.status === "cancelled" ||
    body.status === "waived"
  ) {
    await setCommissionStatus(id, body.status, body.note);
  } else {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
