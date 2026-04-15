// M5 — Vendor financial overview wired to real data.
//
// Computes aggregates from confirmed booking_requests for the signed-in
// artist. Since we don't yet store a per-booking negotiated price, the
// vendor's public priceFrom is used as the estimate per event. When we
// add a real `quotedPrice` column this becomes a trivial swap.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  CalendarDays,
} from "lucide-react";
import { db } from "@/lib/db";
import { artists, bookingRequests, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const ROMANIAN_MONTHS = [
  "Ian",
  "Feb",
  "Mar",
  "Apr",
  "Mai",
  "Iun",
  "Iul",
  "Aug",
  "Sep",
  "Oct",
  "Noi",
  "Dec",
];

export default async function VendorFinancialPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/sign-in");

  const [artist] = await db
    .select({
      id: artists.id,
      nameRo: artists.nameRo,
      priceFrom: artists.priceFrom,
      priceCurrency: artists.priceCurrency,
    })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  if (!artist) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold">Financiar</h1>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nu ești înregistrat ca artist încă.
          </CardContent>
        </Card>
      </div>
    );
  }

  const priceFrom = artist.priceFrom ?? 0;
  const currency = artist.priceCurrency ?? "€";

  // Pull every booking for this artist that is in an "earning" state
  const rows = await db
    .select({
      id: bookingRequests.id,
      clientName: bookingRequests.clientName,
      eventDate: bookingRequests.eventDate,
      eventType: bookingRequests.eventType,
      status: bookingRequests.status,
      createdAt: bookingRequests.createdAt,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.artistId, artist.id),
        inArray(bookingRequests.status, [
          "accepted",
          "confirmed_by_client",
          "pending",
        ]),
      ),
    );

  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // Aggregate
  let totalYear = 0;
  let monthRevenue = 0;
  let pendingRevenue = 0;
  let confirmedRevenue = 0;
  const monthly = new Array(12).fill(0) as number[];

  for (const b of rows) {
    const d = new Date(b.eventDate);
    if (d.getFullYear() !== year) continue;
    const isConfirmed = b.status === "confirmed_by_client";
    const isPending = b.status === "pending" || b.status === "accepted";

    if (isConfirmed) confirmedRevenue += priceFrom;
    if (isPending) pendingRevenue += priceFrom;

    totalYear += priceFrom;
    if (d.getMonth() === currentMonth) monthRevenue += priceFrom;
    monthly[d.getMonth()] += priceFrom;
  }

  const maxMonth = Math.max(...monthly, 1);

  // Upcoming transactions sorted by date
  const sorted = [...rows].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const upcoming = sorted.filter((b) => b.eventDate >= today).slice(0, 10);
  const past = sorted.filter((b) => b.eventDate < today).slice(-10).reverse();

  const stats = [
    {
      label: "Venituri luna asta",
      value: `${monthRevenue}${currency}`,
      icon: DollarSign,
      color: "text-gold",
    },
    {
      label: `Total ${year}`,
      value: `${totalYear}${currency}`,
      icon: TrendingUp,
      color: "text-success",
    },
    {
      label: "Plăți în așteptare",
      value: `${pendingRevenue}${currency}`,
      icon: Clock,
      color: "text-warning",
    },
    {
      label: "Plăți confirmate",
      value: `${confirmedRevenue}${currency}`,
      icon: CheckCircle,
      color: "text-success",
    },
  ];

  const noBookings = rows.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Financiar</h1>
          <p className="text-xs text-muted-foreground">
            Estimat pe baza prețului tău public ({priceFrom}
            {currency} / eveniment).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {noBookings ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <CalendarDays className="mb-3 h-10 w-10" />
            <p>Nu ai rezervări pentru {year}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue chart */}
          <Card>
            <CardHeader>
              <CardTitle>Venituri estimate {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-1">
                {monthly.map((v, i) => (
                  <div
                    key={i}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-medium text-gold">
                      {v || ""}
                    </span>
                    <div
                      className="w-full rounded-t bg-gold/20"
                      style={{ height: `${Math.max(4, (v / maxMonth) * 100)}%` }}
                    >
                      <div
                        className="h-full rounded-t bg-gold"
                        style={{ opacity: v ? 1 : 0.2 }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {ROMANIAN_MONTHS[i]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Rezervări</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcoming.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Viitoare
                    </p>
                    <div className="space-y-3">
                      {upcoming.map((t) => (
                        <TransactionRow
                          key={t.id}
                          row={t}
                          amount={priceFrom}
                          currency={currency}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <p className="mb-2 mt-2 text-xs font-semibold uppercase text-muted-foreground">
                      Trecute
                    </p>
                    <div className="space-y-3">
                      {past.map((t) => (
                        <TransactionRow
                          key={t.id}
                          row={t}
                          amount={priceFrom}
                          currency={currency}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

interface TransactionRowProps {
  row: {
    clientName: string;
    eventDate: string;
    eventType: string | null;
    status: "pending" | "accepted" | "confirmed_by_client" | "rejected" | "cancelled" | "completed";
  };
  amount: number;
  currency: string;
}

function TransactionRow({ row, amount, currency }: TransactionRowProps) {
  const isConfirmed = row.status === "confirmed_by_client";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {row.eventType ?? "Eveniment"} — {row.clientName}
        </p>
        <p className="text-xs text-muted-foreground">{row.eventDate}</p>
      </div>
      <div className="text-right">
        <p className="font-accent font-semibold text-gold">
          {amount}
          {currency}
        </p>
        <Badge
          variant="outline"
          className={
            isConfirmed
              ? "border-success/30 text-success text-xs"
              : "border-warning/30 text-warning text-xs"
          }
        >
          {isConfirmed ? "Confirmat" : "În așteptare"}
        </Badge>
      </div>
    </div>
  );
}
