/**
 * The numbers behind /admin/statistici.
 *
 * Before this module the admin surface held three different definitions of
 * "a real booking" and priced revenue off `artists.price_from` — the vendor's
 * advertised starting price, not the amount anyone agreed to — while joining
 * on artists, which silently dropped every venue booking. Three cards on two
 * pages therefore disagreed with each other and with the commissions ledger.
 *
 * The definitions used here, once:
 *   REQUEST  — any row in booking_requests: a client asked a vendor.
 *   ORDER    — status in ('confirmed_by_client','completed'). Same set as
 *              FEE_TRIGGER_STATUSES, so an order is exactly what raises a fee.
 *   GMV      — sum(agreed_price) over orders. Rows with no agreed price
 *              contribute 0 rather than a list-price guess.
 *   PLATFORM — the commissions ledger: `billed` is what was raised,
 *              `collected` is what an admin has marked paid.
 *
 * Manual rows (source='manual') are a vendor's own calendar blocks, not
 * marketplace transactions, and are excluded everywhere.
 *
 * neon-http does one HTTP round trip per query and has no transactions, so
 * every figure is a single grouped query and the page fans them out with
 * Promise.all rather than looping.
 */

import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  categories,
  commissions,
  users,
  venues,
} from "@/lib/db/schema";
import { normalizeEventType } from "@/lib/events/normalize";

/** Statuses that mean the deal is real. Mirrors FEE_TRIGGER_STATUSES. */
export const ORDER_STATUSES = ["confirmed_by_client", "completed"] as const;

export type VendorFilter = "all" | "artist" | "venue";
/** Which date puts a booking inside the window. */
export type DateBasis = "created" | "event";

export interface StatsFilter {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
  vendor: VendorFilter;
  /** An artist service category (categories.id), or null for all. */
  categoryId: number | null;
  basis: DateBasis;
}

export interface Bucket {
  /** YYYY-MM-DD (day granularity) or YYYY-MM-01 (month granularity). */
  date: string;
  requests: number;
  orders: number;
  gmv: number;
}

export interface NamedCount {
  key: string;
  label: string;
  count: number;
  gmv: number;
}

export interface VendorRow {
  id: number;
  type: "artist" | "venue";
  name: string;
  slug: string;
  requests: number;
  orders: number;
  gmv: number;
  /** Fees raised against this vendor inside the window. */
  commissionBilled: number;
  commissionPaid: number;
}

export interface AdminStats {
  supply: {
    usersTotal: number;
    usersByRole: { role: string; count: number }[];
    usersNew: number;
    artistsTotal: number;
    artistsActive: number;
    venuesTotal: number;
    venuesActive: number;
  };
  demand: {
    requests: number;
    requestsArtist: number;
    requestsVenue: number;
    orders: number;
    gmv: number;
    conversionPct: number;
  };
  platform: {
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    rows: number;
  };
  series: Bucket[];
  granularity: "day" | "month";
  byStatus: { status: string; count: number }[];
  byEventType: NamedCount[];
  byCategory: NamedCount[];
  vendors: VendorRow[];
}

/* ── window helpers ─────────────────────────────────────────────── */

/**
 * `event_date` is a DATE column and `created_at` a timestamp, so the window
 * is expressed against whichever the caller picked. Dates are compared as
 * 'YYYY-MM-DD' strings for the date column, and as half-open timestamps for
 * created_at so the last day is included in full.
 */
function bookingWindow(f: StatsFilter): SQL {
  if (f.basis === "event") {
    return and(
      gte(bookingRequests.eventDate, f.from),
      lte(bookingRequests.eventDate, f.to),
    )!;
  }
  return and(
    gte(bookingRequests.createdAt, new Date(`${f.from}T00:00:00.000Z`)),
    sql`${bookingRequests.createdAt} < ${new Date(`${f.to}T00:00:00.000Z`).toISOString()}::timestamp + interval '1 day'`,
  )!;
}

function vendorScope(f: StatsFilter): SQL | undefined {
  if (f.vendor === "artist") return sql`${bookingRequests.artistId} is not null`;
  if (f.vendor === "venue") return sql`${bookingRequests.venueId} is not null`;
  return undefined;
}

/**
 * A category filter only means something for artists — the venues table has
 * no category column at all. Picking a category therefore also narrows the
 * report to artist bookings, which is stated in the UI.
 */
function categoryScope(f: StatsFilter): SQL | undefined {
  if (f.categoryId == null) return undefined;
  return sql`${bookingRequests.artistId} in (
    select ${artists.id} from ${artists}
    where ${artists.categoryIds} && array[${f.categoryId}]::integer[]
  )`;
}

/** Vendor calendar blocks are not marketplace demand. */
const MARKETPLACE = sql`${bookingRequests.source} <> 'manual'`;

function bookingWhere(f: StatsFilter): SQL {
  return and(
    bookingWindow(f),
    MARKETPLACE,
    vendorScope(f),
    categoryScope(f),
  )!;
}

const isOrder = sql`${bookingRequests.status} in ('confirmed_by_client','completed')`;

/** Day buckets for short ranges, month buckets for long ones. */
function granularityFor(from: string, to: string): "day" | "month" {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days <= 92 ? "day" : "month";
}

/* ── the report ─────────────────────────────────────────────────── */

/** Longest range the page will render. Two years of months is already 24
 *  buckets; beyond that the chart says nothing the table does not. */
const MAX_RANGE_DAYS = 1096;

/**
 * Put the window in a state the SQL and the bucket loop can both trust:
 * ordered, real dates, and no longer than MAX_RANGE_DAYS. A hand-edited URL
 * used to reach fillGaps' 800-iteration guard and silently truncate the
 * series instead of saying the range was too wide.
 */
function sanitize(f: StatsFilter): StatsFilter {
  let { from, to } = f;
  if (Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) {
    [from, to] = [to, from];
  }
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (span > MAX_RANGE_DAYS) {
    const start = new Date(`${to}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - MAX_RANGE_DAYS);
    from = start.toISOString().slice(0, 10);
  }
  return { ...f, from, to };
}

export async function getAdminStats(input: StatsFilter): Promise<AdminStats> {
  const f = sanitize(input);
  const where = bookingWhere(f);
  const granularity = granularityFor(f.from, f.to);
  const basisCol =
    f.basis === "event"
      ? sql`${bookingRequests.eventDate}::date`
      : sql`${bookingRequests.createdAt}::date`;
  // date_trunc's first argument must be a literal — passed as a bind
  // parameter Postgres cannot resolve the overload. `granularity` is an
  // internal union of two words, never user input.
  const trunc = sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${basisCol})`;

  const [
    userRoleRows,
    newUserRow,
    artistSupplyRow,
    venueSupplyRow,
    demandRow,
    seriesRows,
    statusRows,
    eventTypeRows,
    categoryRows,
    artistVendorRows,
    venueVendorRows,
    commissionRow,
    commissionByVendor,
  ] = await Promise.all([
    db
      .select({ role: users.role, count: sql<number>`count(*)::int` })
      .from(users)
      .groupBy(users.role),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          gte(users.createdAt, new Date(`${f.from}T00:00:00.000Z`)),
          sql`${users.createdAt} < ${new Date(`${f.to}T00:00:00.000Z`).toISOString()}::timestamp + interval '1 day'`,
        ),
      ),

    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${artists.isActive})::int`,
      })
      .from(artists),

    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${venues.isActive})::int`,
      })
      .from(venues),

    db
      .select({
        requests: sql<number>`count(*)::int`,
        requestsArtist: sql<number>`count(*) filter (where ${bookingRequests.artistId} is not null)::int`,
        requestsVenue: sql<number>`count(*) filter (where ${bookingRequests.venueId} is not null)::int`,
        orders: sql<number>`count(*) filter (where ${isOrder})::int`,
        gmv: sql<number>`coalesce(sum(${bookingRequests.agreedPrice}) filter (where ${isOrder}), 0)::int`,
      })
      .from(bookingRequests)
      .where(where),

    db
      .select({
        date: sql<string>`to_char(${trunc}, 'YYYY-MM-DD')`,
        requests: sql<number>`count(*)::int`,
        orders: sql<number>`count(*) filter (where ${isOrder})::int`,
        gmv: sql<number>`coalesce(sum(${bookingRequests.agreedPrice}) filter (where ${isOrder}), 0)::int`,
      })
      .from(bookingRequests)
      .where(where)
      .groupBy(trunc)
      .orderBy(trunc),

    db
      .select({
        status: sql<string>`${bookingRequests.status}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookingRequests)
      .where(where)
      .groupBy(bookingRequests.status),

    db
      .select({
        raw: sql<string | null>`${bookingRequests.eventType}`,
        count: sql<number>`count(*)::int`,
        gmv: sql<number>`coalesce(sum(${bookingRequests.agreedPrice}) filter (where ${isOrder}), 0)::int`,
      })
      .from(bookingRequests)
      .where(where)
      .groupBy(bookingRequests.eventType),

    // Artists carry an integer[] of category ids, so one booking can land in
    // several categories. unnest() spreads them; the counts are therefore
    // "bookings touching this category", not a partition of the total.
    db
      .select({
        id: sql<number>`c.id`,
        label: sql<string>`c.name_ro`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookingRequests)
      .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
      .innerJoin(
        sql`lateral unnest(coalesce(${artists.categoryIds}, '{}')) as cat_id`,
        sql`true`,
      )
      .innerJoin(sql`${categories} c`, sql`c.id = cat_id`)
      .where(where)
      .groupBy(sql`c.id, c.name_ro`)
      .orderBy(sql`count(*) desc`)
      .limit(12),

    db
      .select({
        id: artists.id,
        name: artists.nameRo,
        slug: artists.slug,
        requests: sql<number>`count(*)::int`,
        orders: sql<number>`count(*) filter (where ${isOrder})::int`,
        gmv: sql<number>`coalesce(sum(${bookingRequests.agreedPrice}) filter (where ${isOrder}), 0)::int`,
      })
      .from(bookingRequests)
      .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
      .where(where)
      .groupBy(artists.id, artists.nameRo, artists.slug),

    db
      .select({
        id: venues.id,
        name: venues.nameRo,
        slug: venues.slug,
        requests: sql<number>`count(*)::int`,
        orders: sql<number>`count(*) filter (where ${isOrder})::int`,
        gmv: sql<number>`coalesce(sum(${bookingRequests.agreedPrice}) filter (where ${isOrder}), 0)::int`,
      })
      .from(bookingRequests)
      .innerJoin(venues, eq(bookingRequests.venueId, venues.id))
      .where(where)
      .groupBy(venues.id, venues.nameRo, venues.slug),

    // The fee ledger follows the booking, so it is scoped by the same window
    // through a subquery rather than by commissions.created_at — a fee raised
    // late still belongs to the booking that earned it.
    db
      .select({
        // Cancelled (the event did not happen) and waived (deliberately not
        // charged) fees are not revenue. Counting them made "Venit platformă"
        // larger than anything that could ever be collected.
        billed: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} <> 'cancelled' and ${commissions.status} <> 'waived'), 0)::float8`,
        collected: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} = 'paid'), 0)::float8`,
        outstanding: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} in ('pending','invoiced')), 0)::float8`,
        overdue: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} in ('pending','invoiced') and ${commissions.dueDate} < current_date), 0)::float8`,
        rows: sql<number>`count(*)::int`,
      })
      .from(commissions)
      .innerJoin(
        bookingRequests,
        eq(commissions.bookingRequestId, bookingRequests.id),
      )
      .where(where),

    db
      .select({
        vendorType: sql<string>`${commissions.vendorType}`,
        artistId: commissions.artistId,
        venueId: commissions.venueId,
        billed: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} <> 'cancelled' and ${commissions.status} <> 'waived'), 0)::float8`,
        paid: sql<number>`coalesce(sum(${commissions.amount}) filter (where ${commissions.status} = 'paid'), 0)::float8`,
      })
      .from(commissions)
      .innerJoin(
        bookingRequests,
        eq(commissions.bookingRequestId, bookingRequests.id),
      )
      .where(where)
      .groupBy(commissions.vendorType, commissions.artistId, commissions.venueId),
  ]);

  const usersTotal = userRoleRows.reduce((s, r) => s + r.count, 0);
  const artistSupply = artistSupplyRow[0] ?? { total: 0, active: 0 };
  const venueSupply = venueSupplyRow[0] ?? { total: 0, active: 0 };
  const demand = demandRow[0] ?? {
    requests: 0,
    requestsArtist: 0,
    requestsVenue: 0,
    orders: 0,
    gmv: 0,
  };
  const platform = commissionRow[0] ?? {
    billed: 0,
    collected: 0,
    outstanding: 0,
    overdue: 0,
    rows: 0,
  };

  // Fold the raw event_type spellings into the canonical set.
  const eventBuckets = new Map<string, NamedCount>();
  for (const row of eventTypeRows) {
    const k = normalizeEventType(row.raw);
    const id: string = k ?? "unknown";
    const existing = eventBuckets.get(id);
    if (existing) {
      existing.count += row.count;
      existing.gmv += row.gmv;
    } else {
      eventBuckets.set(id, { key: id, label: id, count: row.count, gmv: row.gmv });
    }
  }

  const feeByArtist = new Map<number, { billed: number; paid: number }>();
  const feeByVenue = new Map<number, { billed: number; paid: number }>();
  for (const c of commissionByVendor) {
    if (c.artistId != null) feeByArtist.set(c.artistId, { billed: c.billed, paid: c.paid });
    else if (c.venueId != null) feeByVenue.set(c.venueId, { billed: c.billed, paid: c.paid });
  }

  const vendors: VendorRow[] = [
    ...artistVendorRows.map((r) => ({
      ...r,
      type: "artist" as const,
      commissionBilled: feeByArtist.get(r.id)?.billed ?? 0,
      commissionPaid: feeByArtist.get(r.id)?.paid ?? 0,
    })),
    ...venueVendorRows.map((r) => ({
      ...r,
      type: "venue" as const,
      commissionBilled: feeByVenue.get(r.id)?.billed ?? 0,
      commissionPaid: feeByVenue.get(r.id)?.paid ?? 0,
    })),
  ].sort((a, b) => b.gmv - a.gmv || b.orders - a.orders);

  return {
    supply: {
      usersTotal,
      usersByRole: userRoleRows.map((r) => ({ role: String(r.role), count: r.count })),
      usersNew: newUserRow[0]?.count ?? 0,
      artistsTotal: artistSupply.total,
      artistsActive: artistSupply.active,
      venuesTotal: venueSupply.total,
      venuesActive: venueSupply.active,
    },
    demand: {
      ...demand,
      conversionPct: demand.requests > 0 ? (demand.orders / demand.requests) * 100 : 0,
    },
    platform,
    series: fillGaps(seriesRows, f.from, f.to, granularity),
    granularity,
    byStatus: statusRows,
    byEventType: [...eventBuckets.values()].sort((a, b) => b.count - a.count),
    byCategory: categoryRows.map((r) => ({
      key: String(r.id),
      label: r.label,
      count: r.count,
      // No GMV here on purpose: an artist can be tagged with several
      // categories, so the unnest repeats each booking once per category.
      // Counting bookings that way is a defensible "touches this category";
      // summing money that way would invent revenue.
      gmv: 0,
    })),
    vendors,
  };
}

/**
 * Postgres only returns buckets that have rows. A line with a gap where a
 * quiet week was reads as "no data collected", so empty buckets are filled
 * with explicit zeros.
 */
function fillGaps(
  rows: Bucket[],
  from: string,
  to: string,
  granularity: "day" | "month",
): Bucket[] {
  const found = new Map(rows.map((r) => [r.date, r]));
  const out: Bucket[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (granularity === "month") cursor.setUTCDate(1);

  // A wide "day" range would be a huge array; granularityFor caps it at 92.
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push(found.get(iso) ?? { date: iso, requests: 0, orders: 0, gmv: 0 });
    if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Artist service categories, for the filter dropdown. */
export async function getArtistCategories(): Promise<
  { id: number; name: string }[]
> {
  const rows = await db
    .select({ id: categories.id, name: categories.nameRo })
    .from(categories)
    .where(eq(categories.type, "artist"))
    .orderBy(categories.sortOrder, categories.nameRo);
  return rows;
}
