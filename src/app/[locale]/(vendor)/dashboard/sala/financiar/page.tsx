// Venue financial dashboard — spec section 8.
//
// Stats cards (month revenue, total, commission, paid/unpaid), table of
// bookings with amounts, and per-month revenue chart.
//
// The commission shown here is READ FROM THE LEDGER, not recomputed. It used
// to be `revenue × rate`, which silently printed 0 € under the configured
// tariff: venue fees are a flat amount per event decided by the guest count
// (50 € under 80 guests, 100 € from 80), so there is no rate to multiply by.
// The venue now sees exactly the rows the admin sees in Finanțe.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  bookingRequests,
  commissions,
} from "@/lib/db/schema";
import { VenueFinanciarClient } from "./client";
import { CommissionPanel } from "@/components/vendor/commission-panel";

export const dynamic = "force-dynamic";


export default async function VenueFinanciarPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/financiar");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({ id: venues.id, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Last 12 months for chart
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);

  const [confirmedBookings, totalRow, monthlyRows] = await Promise.all([
    // All confirmed/completed bookings for the venue (used for transactions + stats)
    db
      .select({
        id: bookingRequests.id,
        clientName: bookingRequests.clientName,
        eventType: bookingRequests.eventType,
        eventDate: bookingRequests.eventDate,
        agreedPrice: bookingRequests.agreedPrice,
        status: bookingRequests.status,
        paidStatus: bookingRequests.paidStatus,
        updatedAt: bookingRequests.updatedAt,
        createdAt: bookingRequests.createdAt,
      })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          inArray(bookingRequests.status, [
            "accepted",
            "confirmed_by_client",
            "completed",
          ]),
        ),
      )
      .orderBy(desc(bookingRequests.eventDate))
      .limit(200),
    // Total revenue ever
    db
      .select({
        total: sql<number>`COALESCE(SUM(${bookingRequests.agreedPrice}), 0)::int`,
      })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          inArray(bookingRequests.status, [
            "accepted",
            "confirmed_by_client",
            "completed",
          ]),
        ),
      ),
    // Monthly revenue (last 12 months)
    db
      .select({
        month: sql<string>`TO_CHAR(${bookingRequests.eventDate}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(${bookingRequests.agreedPrice}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.venueId, venue.id),
          inArray(bookingRequests.status, [
            "accepted",
            "confirmed_by_client",
            "completed",
          ]),
          gte(bookingRequests.eventDate, yearAgo.toISOString().split("T")[0]),
        ),
      )
      .groupBy(sql`TO_CHAR(${bookingRequests.eventDate}, 'YYYY-MM')`),
  ]);

  // Compute stats
  const monthStartStr = monthStart.toISOString().split("T")[0];
  const thisMonthBookings = confirmedBookings.filter(
    (b) => b.eventDate && b.eventDate >= monthStartStr,
  );
  const revenueThisMonth = thisMonthBookings.reduce(
    (sum, b) => sum + (b.agreedPrice ?? 0),
    0,
  );
  const revenueTotal = Number(totalRow[0]?.total ?? 0);

  // Real fees, per booking, straight from the commissions ledger.
  const feeRows = await db
    .select({
      bookingId: commissions.bookingRequestId,
      amount: commissions.amount,
    })
    .from(commissions)
    .where(
      and(
        eq(commissions.venueId, venue.id),
        // A cancelled or waived fee is not owed and must not be shown as if
        // it were.
        sql`${commissions.status} <> 'cancelled' and ${commissions.status} <> 'waived'`,
      ),
    );
  const commissionByBooking: Record<number, number> = {};
  for (const r of feeRows) commissionByBooking[r.bookingId] = r.amount;
  const commissionThisMonth = thisMonthBookings.reduce(
    (sum, b) => sum + (commissionByBooking[b.id] ?? 0),
    0,
  );

  const paid = confirmedBookings.filter((b) => b.paidStatus === "paid").length;
  const unpaid = confirmedBookings.filter(
    (b) => b.paidStatus !== "paid",
  ).length;

  // Fill in missing months with zeros for the chart
  const monthlyMap = new Map<string, { total: number; count: number }>();
  for (const r of monthlyRows) {
    monthlyMap.set(r.month, { total: Number(r.total), count: Number(r.count) });
  }
  const chartData: Array<{ month: string; label: string; total: number; count: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const stat = monthlyMap.get(ym) || { total: 0, count: 0 };
    const monthLabel = d.toLocaleDateString("ro-RO", { month: "short", year: "2-digit" });
    chartData.push({ month: ym, label: monthLabel, total: stat.total, count: stat.count });
  }

  return (
    <>
    <VenueFinanciarClient
      venueName={venue.nameRo}
      stats={{
        revenueThisMonth,
        revenueTotal,
        commissionThisMonth,
        paid,
        unpaid,
        bookingsThisMonth: thisMonthBookings.length,
      }}
      bookings={confirmedBookings.map((b) => ({
        ...b,
        eventDate: b.eventDate,
        updatedAt: b.updatedAt.toISOString(),
        createdAt: b.createdAt.toISOString(),
      }))}
      chartData={chartData}
      commissionByBooking={commissionByBooking}
    />
    <div className="px-6 pb-6"><CommissionPanel /></div>
    </>
  );
}
