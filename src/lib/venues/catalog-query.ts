import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  calendarEvents,
  reviews,
  venueHallConflictGroupMembers,
  venueHallConflictGroups,
  venueHalls,
  venueHallSeatingOptions,
  venueImages,
  venueScheduleBlocks,
  venues,
} from "@/lib/db/schema";
import {
  hallOccupancyAvailable,
  hallCapacityFits,
  parseCatalogInterval,
  type BulkBooking,
  type BulkBlock,
  type BulkConflictMember,
  type BulkHall,
  type BulkLegacyEvent,
  type BulkSeating,
  type BulkVenue,
} from "@/lib/booking/venue-availability-bulk";
import { localDatesIntersecting } from "@/lib/booking/zoned-interval";
import {
  catalogSortForPrices,
  parseCatalogFilters,
  type AvailabilityStatus,
  type CatalogSort,
  type ParsedCatalogFilters,
} from "./catalog-filters";
import {
  allowlistedVenueCard,
  hallPriceFields,
  stripVenuePrices,
  type PublicHallCard,
  type PublicVenueCard,
} from "./catalog-dto";
import {
  hallEffectivePrice,
  minComparablePrice,
  minPerPersonUnitPrice,
} from "./effective-price";
import { publishedVenuePredicateSql } from "./public-publication";
import type { WorkingHours } from "@/components/vendor/working-hours-editor";

export type MultiHallVenueFilters = {
  capacityMin?: number;
  capacityMax?: number;
  priceMax?: number;
  city?: string;
  cityKeywords?: string[];
  featured?: boolean;
  availableDate?: string;
  startTime?: string;
  endTime?: string;
  guestCount?: number;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
  revealPrices?: boolean;
};

type VenueRow = typeof venues.$inferSelect;
type HallMeta = {
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  pricingModel: string;
  basePrice: number | null;
  minimumOrder: number | null;
  currency: string;
  sortOrder: number;
  descriptionRo?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  facilities?: string[] | null;
  bookingTermsRo?: string | null;
  bookingTermsRu?: string | null;
  bookingTermsEn?: string | null;
};

const BLOCKING_STATUSES = ["pending", "accepted", "confirmed_by_client", "completed"] as const;
const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function shiftIsoDate(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function withAdjacentIsoDates(dates: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const date of dates) {
    expanded.add(shiftIsoDate(date, -1));
    expanded.add(date);
    expanded.add(shiftIsoDate(date, 1));
  }
  return [...expanded];
}

function normalizeWorkingHours(value: unknown): WorkingHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(WEEK_DAYS.map((day) => {
    const hours = source[day];
    if (!hours || typeof hours !== "object" || Array.isArray(hours)) return [day, null];
    const record = hours as Record<string, unknown>;
    return [day, typeof record.open === "string" && typeof record.close === "string"
      ? { open: record.open, close: record.close }
      : null];
  })) as WorkingHours;
}

function cityCondition(filters: ParsedCatalogFilters) {
  const needles = [
    ...(filters.cityKeywords ?? []),
    ...(filters.city ? [filters.city] : []),
  ].map((item) => item.trim()).filter(Boolean);
  const unique = Array.from(new Set(needles));
  if (!unique.length) return undefined;
  return sql`(${sql.join(
    unique.map((needle) => sql`${venues.city} ILIKE ${"%" + needle + "%"}`),
    sql` OR `,
  )})`;
}

async function loadCovers(ids: number[]): Promise<Map<number, string>> {
  const coverMap = new Map<number, string>();
  if (!ids.length) return coverMap;
  const covers = await db
    .select({
      venueId: venueImages.venueId,
      url: venueImages.url,
      isCover: venueImages.isCover,
      sortOrder: venueImages.sortOrder,
    })
    .from(venueImages)
    .innerJoin(venues, eq(venues.id, venueImages.venueId))
    .where(and(
      sql`${venueImages.venueId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
      isNull(venueImages.hallId),
      eq(venues.isActive, true),
    ))
    .orderBy(desc(venueImages.isCover), asc(venueImages.sortOrder));
  for (const image of covers) {
    if (!coverMap.has(image.venueId)) coverMap.set(image.venueId, image.url);
  }
  return coverMap;
}

async function loadOccupancy(
  venueIds: number[],
  dates: string[],
  bounds?: { startsAt: Date; endsAt: Date },
) {
  const empty = {
    halls: [] as BulkHall[],
    seating: [] as BulkSeating[],
    blocks: [] as BulkBlock[],
    bookings: [] as BulkBooking[],
    conflictMembers: [] as BulkConflictMember[],
    legacyEvents: [] as BulkLegacyEvent[],
  };
  if (!venueIds.length) return empty;
  const [halls, blocks, bookings, conflictMembers, legacyEvents] = await Promise.all([
    db
      .select({
        id: venueHalls.id,
        venueId: venueHalls.venueId,
        status: venueHalls.status,
        capacityMin: venueHalls.capacityMin,
        capacityMax: venueHalls.capacityMax,
        workingHours: venueHalls.workingHours,
        bufferMinutes: venueHalls.bufferMinutes,
      })
      .from(venueHalls)
      .where(inArray(venueHalls.venueId, venueIds)),
    db
      .select({
        venueId: venueScheduleBlocks.venueId,
        hallId: venueScheduleBlocks.hallId,
        startsAt: venueScheduleBlocks.startsAt,
        endsAt: venueScheduleBlocks.endsAt,
      })
      .from(venueScheduleBlocks)
      .where(and(
        inArray(venueScheduleBlocks.venueId, venueIds),
        bounds ? lt(venueScheduleBlocks.startsAt, bounds.endsAt) : undefined,
        bounds ? gt(venueScheduleBlocks.endsAt, bounds.startsAt) : undefined,
      )),
    db
      .select({
        id: bookingRequests.id,
        venueId: bookingRequests.venueId,
        hallId: bookingRequests.hallId,
        reservationScope: bookingRequests.reservationScope,
        status: bookingRequests.status,
        eventDate: bookingRequests.eventDate,
        startTime: bookingRequests.startTime,
        endTime: bookingRequests.endTime,
        timezone: bookingRequests.timezone,
        startsAt: bookingRequests.startsAt,
        endsAt: bookingRequests.endsAt,
      })
      .from(bookingRequests)
      .where(and(
        inArray(bookingRequests.venueId, venueIds),
        inArray(bookingRequests.status, [...BLOCKING_STATUSES]),
        bounds ? or(
          and(
            isNotNull(bookingRequests.startsAt),
            isNotNull(bookingRequests.endsAt),
            lt(bookingRequests.startsAt, bounds.endsAt),
            gt(bookingRequests.endsAt, bounds.startsAt),
          ),
          and(
            or(isNull(bookingRequests.startsAt), isNull(bookingRequests.endsAt)),
            inArray(bookingRequests.eventDate, dates),
          ),
        ) : undefined,
      )),
    db
      .select({
        venueId: venueHallConflictGroups.venueId,
        groupId: venueHallConflictGroupMembers.groupId,
        hallId: venueHallConflictGroupMembers.hallId,
      })
      .from(venueHallConflictGroupMembers)
      .innerJoin(
        venueHallConflictGroups,
        eq(venueHallConflictGroups.id, venueHallConflictGroupMembers.groupId),
      )
      .where(inArray(venueHallConflictGroups.venueId, venueIds)),
    dates.length
      ? db
        .select({
          venueId: calendarEvents.entityId,
          hallId: calendarEvents.hallId,
          date: calendarEvents.date,
          status: calendarEvents.status,
          source: calendarEvents.source,
          startTime: calendarEvents.startTime,
          endTime: calendarEvents.endTime,
        })
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.entityType, "venue"),
          inArray(calendarEvents.entityId, venueIds),
          inArray(calendarEvents.status, ["blocked", "booked"]),
          inArray(calendarEvents.date, dates),
          ne(calendarEvents.source, "booking"),
        ))
      : Promise.resolve([]),
  ]);
  const hallIds = halls.map((hall) => hall.id);
  const seating = hallIds.length
    ? await db
      .select({
        hallId: venueHallSeatingOptions.hallId,
        capacityMin: venueHallSeatingOptions.capacityMin,
        capacityMax: venueHallSeatingOptions.capacityMax,
      })
      .from(venueHallSeatingOptions)
      .where(inArray(venueHallSeatingOptions.hallId, hallIds))
    : [];
  return {
    halls: halls as BulkHall[],
    seating: seating as BulkSeating[],
    blocks: blocks as BulkBlock[],
    bookings: bookings as BulkBooking[],
    conflictMembers: conflictMembers as BulkConflictMember[],
    legacyEvents: legacyEvents as BulkLegacyEvent[],
  };
}

type LoadedOccupancy = Awaited<ReturnType<typeof loadOccupancy>>;

function indexRowsByNumber<T>(
  rows: readonly T[],
  keyOf: (row: T) => number | undefined,
): Map<number, T[]> {
  const index = new Map<number, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

function indexOccupancyByVenue(
  occupancy: LoadedOccupancy,
): Map<number, LoadedOccupancy> {
  const index = new Map<number, LoadedOccupancy>();
  const ensure = (venueId: number) => {
    const existing = index.get(venueId);
    if (existing) return existing;
    const created: LoadedOccupancy = {
      halls: [],
      seating: [],
      blocks: [],
      bookings: [],
      conflictMembers: [],
      legacyEvents: [],
    };
    index.set(venueId, created);
    return created;
  };

  const hallVenueIds = new Map<number, number>();
  for (const hall of occupancy.halls) {
    hallVenueIds.set(hall.id, hall.venueId);
    ensure(hall.venueId).halls.push(hall);
  }
  for (const row of occupancy.seating) {
    const venueId = hallVenueIds.get(row.hallId);
    if (venueId != null) ensure(venueId).seating.push(row);
  }
  for (const row of occupancy.blocks) ensure(row.venueId).blocks.push(row);
  for (const row of occupancy.bookings) ensure(row.venueId).bookings.push(row);
  for (const row of occupancy.conflictMembers) ensure(row.venueId).conflictMembers.push(row);
  for (const row of occupancy.legacyEvents) ensure(row.venueId).legacyEvents.push(row);

  return index;
}

function compareCards(a: PublicVenueCard, b: PublicVenueCard, sort: CatalogSort): number {
  let cmp = 0;
  switch (sort) {
    case "price_asc": {
      const aMissing = a.minEffectivePrice == null;
      const bMissing = b.minEffectivePrice == null;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      cmp = aMissing ? 0 : a.minEffectivePrice! - b.minEffectivePrice!;
      break;
    }
    case "price_desc": {
      const aMissing = a.minEffectivePrice == null;
      const bMissing = b.minEffectivePrice == null;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      cmp = aMissing ? 0 : b.minEffectivePrice! - a.minEffectivePrice!;
      break;
    }
    case "rating":
      cmp = (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1);
      break;
    case "capacity":
      cmp = (b.capacityMax ?? -1) - (a.capacityMax ?? -1);
      break;
    default:
      cmp = Number(b.isFeatured) - Number(a.isFeatured);
  }
  return cmp !== 0 ? cmp : a.id - b.id;
}

function buildCard(opts: {
  venue: VenueRow;
  halls: BulkHall[];
  hallMeta: Map<number, HallMeta>;
  seatingByHall: Map<number, BulkSeating[]>;
  occupancy?: LoadedOccupancy;
  filters: ParsedCatalogFilters;
  revealPrices: boolean;
  coverImageUrl: string | null;
  dropWhenUnsuitable: boolean;
}): PublicVenueCard | null {
  const publicHalls = opts.halls
    .filter((hall) => hall.status === "active")
    .sort((a, b) => {
      const metaA = opts.hallMeta.get(a.id)?.sortOrder ?? 0;
      const metaB = opts.hallMeta.get(b.id)?.sortOrder ?? 0;
      return metaA - metaB || a.id - b.id;
    });
  if (!publicHalls.length) return null;

  const bulkVenue: BulkVenue = {
    id: opts.venue.id,
    timezone: opts.venue.timezone,
    bufferMinutes: opts.venue.bufferMinutes,
    workingHours: opts.venue.workingHours,
  };
  const interval = opts.filters.intervalComplete && opts.filters.date && opts.filters.startTime && opts.filters.endTime
    ? parseCatalogInterval({
      eventDate: opts.filters.date,
      startTime: opts.filters.startTime,
      endTime: opts.filters.endTime,
      timezone: opts.venue.timezone,
    })
    : null;

  const hallCards: PublicHallCard[] = [];
  const prices = [];
  for (const hall of publicHalls) {
    const seating = opts.seatingByHall.get(hall.id) ?? [];
    const suitable = hallCapacityFits(hall, seating, opts.filters.guestCount)
      && (opts.filters.capacityMax == null
        || hall.capacityMin == null
        || hall.capacityMin <= opts.filters.capacityMax);
    let available: boolean | null = null;
    if (opts.filters.intervalComplete) {
      available = Boolean(interval) && suitable && hallOccupancyAvailable({
        venue: bulkVenue,
        hall,
        halls: opts.halls,
        guestCount: opts.filters.guestCount,
        interval: interval!,
        startTime: opts.filters.startTime!,
        endTime: opts.filters.endTime!,
        seating,
        blocks: opts.occupancy?.blocks ?? [],
        bookings: opts.occupancy?.bookings ?? [],
        conflictMembers: opts.occupancy?.conflictMembers ?? [],
        legacyEvents: opts.occupancy?.legacyEvents ?? [],
      });
    }
    const meta = opts.hallMeta.get(hall.id);
    const price = hallEffectivePrice({
      pricingModel: meta?.pricingModel,
      basePrice: meta?.basePrice ?? null,
      minimumOrder: meta?.minimumOrder ?? null,
      currency: meta?.currency ?? "EUR",
    }, opts.filters.guestCount);
    const eligible = suitable && (!opts.filters.intervalComplete || available === true);
    if (eligible) prices.push(price);
    hallCards.push({
      id: hall.id,
      slug: meta?.slug ?? String(hall.id),
      nameRo: meta?.nameRo ?? "",
      nameRu: meta?.nameRu ?? null,
      nameEn: meta?.nameEn ?? null,
      capacityMin: hall.capacityMin,
      capacityMax: hall.capacityMax,
      suitable,
      available,
      descriptionRo: meta?.descriptionRo,
      descriptionRu: meta?.descriptionRu,
      descriptionEn: meta?.descriptionEn,
      facilities: meta?.facilities,
      workingHours: normalizeWorkingHours(hall.workingHours) ?? opts.venue.workingHours,
      bookingTermsRo: meta?.bookingTermsRo,
      bookingTermsRu: meta?.bookingTermsRu,
      bookingTermsEn: meta?.bookingTermsEn,
      seatingOptions: seating.map((option) => ({
        type: option.type,
        labelRo: option.labelRo,
        labelRu: option.labelRu,
        labelEn: option.labelEn,
        capacityMin: option.capacityMin,
        capacityMax: option.capacityMax,
        notesRo: option.notesRo,
        notesRu: option.notesRu,
        notesEn: option.notesEn,
      })),
      ...hallPriceFields(opts.revealPrices, price),
    });
  }

  const suitableHalls = hallCards.filter((hall) => hall.suitable);
  if (opts.dropWhenUnsuitable && opts.filters.guestCount != null && suitableHalls.length === 0) {
    return null;
  }
  if (opts.dropWhenUnsuitable && opts.filters.intervalComplete) {
    const availableCount = suitableHalls.filter((hall) => hall.available).length;
    if (availableCount === 0) return null;
  }

  const minPrice = opts.revealPrices ? minComparablePrice(prices) : null;
  const minUnitPrice = opts.revealPrices ? minPerPersonUnitPrice(prices) : null;

  if (opts.dropWhenUnsuitable && opts.revealPrices && opts.filters.priceMax != null) {
    if (minPrice == null || minPrice.amount > opts.filters.priceMax) return null;
  }

  const capMaxes = suitableHalls
    .map((hall) => hall.capacityMax)
    .filter((value): value is number => value != null);
  const capMins = suitableHalls
    .map((hall) => hall.capacityMin)
    .filter((value): value is number => value != null);
  const suitableCapMax = capMaxes.length ? Math.max(...capMaxes) : null;
  const suitableCapMin = capMins.length ? Math.min(...capMins) : null;

  const availableHallCount = opts.filters.intervalComplete
    ? suitableHalls.filter((hall) => hall.available === true).length
    : null;
  const availabilityStatus: AvailabilityStatus = opts.filters.intervalComplete
    ? availableHallCount! > 0 ? "available" : "unavailable"
    : opts.filters.availabilityStatus;

  const card: PublicVenueCard = {
    id: opts.venue.id,
    slug: opts.venue.slug,
    nameRo: opts.venue.nameRo,
    nameRu: opts.venue.nameRu,
    nameEn: opts.venue.nameEn,
    address: opts.venue.address,
    city: opts.venue.city,
    lat: opts.venue.lat,
    lng: opts.venue.lng,
    capacityMin: suitableCapMin ?? opts.venue.capacityMin,
    capacityMax: suitableCapMax ?? opts.venue.capacityMax,
    ratingAvg: opts.venue.ratingAvg,
    ratingCount: opts.venue.ratingCount,
    isFeatured: opts.venue.isFeatured,
    coverImageUrl: opts.coverImageUrl,
    totalHallCount: hallCards.length,
    suitableHallCount: suitableHalls.length,
    availableHallCount,
    availabilityStatus,
    eligibleHallIds: suitableHalls
      .filter((hall) => !opts.filters.intervalComplete || hall.available)
      .map((hall) => hall.id),
    halls: hallCards,
    pricePerPerson: opts.revealPrices ? (minPrice?.amount ?? null) : null,
    minEffectivePrice: opts.revealPrices ? (minPrice?.amount ?? null) : null,
    minUnitPrice: opts.revealPrices ? (minUnitPrice?.amount ?? null) : null,
    currency: opts.revealPrices ? (minPrice?.currency ?? minUnitPrice?.currency ?? null) : null,
  };
  return allowlistedVenueCard(opts.revealPrices ? card : stripVenuePrices(card));
}

export async function getVenuesMultiHall(raw: MultiHallVenueFilters = {}) {
  const revealPrices = raw.revealPrices === true;
  const parsed = parseCatalogFilters({
    ...raw,
    guestCount: raw.guestCount ?? raw.capacityMin,
    availableDate: raw.availableDate,
  });
  if (parsed.invalidFields.length) {
    return { items: [], total: 0, page: parsed.page, totalPages: 0 };
  }
  const sort = catalogSortForPrices(parsed.sort, revealPrices);
  const conditions = [publishedVenuePredicateSql()];
  const city = cityCondition(parsed);
  if (city) conditions.push(city);
  if (parsed.featured) conditions.push(eq(venues.isFeatured, true));

  const venueRows = await db
    .select()
    .from(venues)
    .where(and(...conditions));

  const venueIds = venueRows.map((row) => row.id);
  const hallRows = venueIds.length
    ? await db
      .select({
        id: venueHalls.id,
        venueId: venueHalls.venueId,
        slug: venueHalls.slug,
        nameRo: venueHalls.nameRo,
        nameRu: venueHalls.nameRu,
        nameEn: venueHalls.nameEn,
        status: venueHalls.status,
        capacityMin: venueHalls.capacityMin,
        capacityMax: venueHalls.capacityMax,
        workingHours: venueHalls.workingHours,
        bufferMinutes: venueHalls.bufferMinutes,
        pricingModel: venueHalls.pricingModel,
        basePrice: venueHalls.basePrice,
        minimumOrder: venueHalls.minimumOrder,
        currency: venueHalls.currency,
        sortOrder: venueHalls.sortOrder,
      })
      .from(venueHalls)
      .where(inArray(venueHalls.venueId, venueIds))
    : [];

  const hallMeta = new Map(hallRows.map((row) => [row.id, {
    slug: row.slug,
    nameRo: row.nameRo,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    pricingModel: row.pricingModel,
    basePrice: row.basePrice,
    minimumOrder: row.minimumOrder,
    currency: row.currency,
    sortOrder: row.sortOrder,
  }]));
  const bulkHalls: BulkHall[] = hallRows.map((row) => ({
    id: row.id,
    venueId: row.venueId,
    status: row.status,
    capacityMin: row.capacityMin,
    capacityMax: row.capacityMax,
    workingHours: row.workingHours,
    bufferMinutes: row.bufferMinutes,
  }));

  const hallIds = hallRows.map((row) => row.id);
  const seating = hallIds.length
    ? await db
      .select({
        hallId: venueHallSeatingOptions.hallId,
        capacityMin: venueHallSeatingOptions.capacityMin,
        capacityMax: venueHallSeatingOptions.capacityMax,
      })
      .from(venueHallSeatingOptions)
      .where(inArray(venueHallSeatingOptions.hallId, hallIds))
    : [];
  const hallsByVenue = indexRowsByNumber(bulkHalls, (hall) => hall.venueId);
  const seatingByHall = indexRowsByNumber(seating as BulkSeating[], (row) => row.hallId);

  let occupancy: Awaited<ReturnType<typeof loadOccupancy>> | undefined;
  if (parsed.intervalComplete && venueIds.length) {
    const dateSet = new Set<string>();
    let earliestStart = Number.POSITIVE_INFINITY;
    let latestEnd = Number.NEGATIVE_INFINITY;
    for (const venue of venueRows) {
      const interval = parseCatalogInterval({
        eventDate: parsed.date!,
        startTime: parsed.startTime!,
        endTime: parsed.endTime!,
        timezone: venue.timezone,
      });
      if (interval) {
        earliestStart = Math.min(earliestStart, interval.startsAt.getTime());
        latestEnd = Math.max(latestEnd, interval.endsAt.getTime());
        for (const date of withAdjacentIsoDates(localDatesIntersecting(interval))) dateSet.add(date);
      }
    }
    if (Number.isFinite(earliestStart) && Number.isFinite(latestEnd)) {
      const safetyWindowMs = 24 * 60 * 60 * 1000;
      occupancy = await loadOccupancy(venueIds, [...dateSet], {
        startsAt: new Date(earliestStart - safetyWindowMs),
        endsAt: new Date(latestEnd + safetyWindowMs),
      });
    }
  }

  const occupancyByVenue = occupancy ? indexOccupancyByVenue(occupancy) : undefined;

  const cards: PublicVenueCard[] = [];
  for (const venue of venueRows) {
    const card = buildCard({
      venue,
      halls: hallsByVenue.get(venue.id) ?? [],
      hallMeta,
      seatingByHall,
      occupancy: occupancyByVenue?.get(venue.id),
      filters: parsed,
      revealPrices,
      coverImageUrl: null,
      dropWhenUnsuitable: true,
    });
    if (card) cards.push(card);
  }
  cards.sort((a, b) => compareCards(a, b, sort));
  const total = cards.length;
  const offset = (parsed.page - 1) * parsed.limit;
  const pageItems = cards.slice(offset, offset + parsed.limit);
  const covers = await loadCovers(pageItems.map((item) => item.id));
  const items = pageItems.map((item) => ({
    ...item,
    coverImageUrl: covers.get(item.id) ?? null,
  }));
  return {
    items,
    total,
    page: parsed.page,
    totalPages: Math.ceil(total / parsed.limit) || 0,
  };
}

export async function getFeaturedVenuesMultiHall(limit = 6, revealPrices = false) {
  const result = await getVenuesMultiHall({
    featured: true,
    limit,
    page: 1,
    sort: "popular",
    revealPrices,
  });
  return result.items;
}

export type PublicVenueDetail = PublicVenueCard & {
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  facilities: string[] | null;
  workingHours: VenueRow["workingHours"];
  calendarEnabled: boolean;
  images: Array<{
    id: number;
    venueId: number;
    hallId: number | null;
    url: string;
    altRo: string | null;
    altRu: string | null;
    altEn: string | null;
    sortOrder: number;
    isCover: boolean;
  }>;
  hallImages: Array<{
    id: number;
    hallId: number;
    url: string;
    altRo: string | null;
    sortOrder: number;
    isCover: boolean;
  }>;
  reviews: Array<{
    id: number;
    authorName: string;
    rating: number;
    text: string | null;
    reply: string | null;
    isApproved: boolean;
    photos: string[];
    createdAt: Date;
  }>;
  seoTitleRo: string | null;
  seoTitleRu: string | null;
  seoTitleEn: string | null;
  seoDescRo: string | null;
  seoDescRu: string | null;
  seoDescEn: string | null;
  ogImageUrl: string | null;
  isActive: true;
};

export async function getVenueBySlugMultiHall(
  slug: string,
  raw: MultiHallVenueFilters = {},
): Promise<PublicVenueDetail | null> {
  const revealPrices = raw.revealPrices === true;
  const parsed = parseCatalogFilters({
    ...raw,
    guestCount: raw.guestCount ?? raw.capacityMin,
    availableDate: raw.availableDate,
  });
  const [venue] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), publishedVenuePredicateSql()))
    .limit(1);
  if (!venue) return null;

  const occupancyHalls = await db
    .select({
      id: venueHalls.id,
      venueId: venueHalls.venueId,
      slug: venueHalls.slug,
      nameRo: venueHalls.nameRo,
      nameRu: venueHalls.nameRu,
      nameEn: venueHalls.nameEn,
      descriptionRo: venueHalls.descriptionRo,
      descriptionRu: venueHalls.descriptionRu,
      descriptionEn: venueHalls.descriptionEn,
      facilities: venueHalls.facilities,
      bookingTermsRo: venueHalls.bookingTermsRo,
      bookingTermsRu: venueHalls.bookingTermsRu,
      bookingTermsEn: venueHalls.bookingTermsEn,
      status: venueHalls.status,
      capacityMin: venueHalls.capacityMin,
      capacityMax: venueHalls.capacityMax,
      workingHours: venueHalls.workingHours,
      bufferMinutes: venueHalls.bufferMinutes,
      pricingModel: venueHalls.pricingModel,
      basePrice: venueHalls.basePrice,
      minimumOrder: venueHalls.minimumOrder,
      currency: venueHalls.currency,
      sortOrder: venueHalls.sortOrder,
    })
    .from(venueHalls)
    .where(eq(venueHalls.venueId, venue.id));
  const hallMeta = new Map(occupancyHalls.map((row) => [row.id, {
    slug: row.slug,
    nameRo: row.nameRo,
    nameRu: row.nameRu,
    nameEn: row.nameEn,
    descriptionRo: row.descriptionRo,
    descriptionRu: row.descriptionRu,
    descriptionEn: row.descriptionEn,
    facilities: row.facilities,
    bookingTermsRo: row.bookingTermsRo,
    bookingTermsRu: row.bookingTermsRu,
    bookingTermsEn: row.bookingTermsEn,
    pricingModel: row.pricingModel,
    basePrice: row.basePrice,
    minimumOrder: row.minimumOrder,
    currency: row.currency,
    sortOrder: row.sortOrder,
  }]));
  const bulkHalls: BulkHall[] = occupancyHalls.map((row) => ({
    id: row.id,
    venueId: row.venueId,
    status: row.status,
    capacityMin: row.capacityMin,
    capacityMax: row.capacityMax,
    workingHours: row.workingHours,
    bufferMinutes: row.bufferMinutes,
  }));
  const hallIds = occupancyHalls.map((row) => row.id);
  const seating = hallIds.length
    ? await db
      .select({
        hallId: venueHallSeatingOptions.hallId,
        type: venueHallSeatingOptions.type,
        labelRo: venueHallSeatingOptions.labelRo,
        labelRu: venueHallSeatingOptions.labelRu,
        labelEn: venueHallSeatingOptions.labelEn,
        capacityMin: venueHallSeatingOptions.capacityMin,
        capacityMax: venueHallSeatingOptions.capacityMax,
        notesRo: venueHallSeatingOptions.notesRo,
        notesRu: venueHallSeatingOptions.notesRu,
        notesEn: venueHallSeatingOptions.notesEn,
        sortOrder: venueHallSeatingOptions.sortOrder,
      })
      .from(venueHallSeatingOptions)
      .where(inArray(venueHallSeatingOptions.hallId, hallIds))
      .orderBy(asc(venueHallSeatingOptions.sortOrder), asc(venueHallSeatingOptions.id))
    : [];
  const seatingByHall = indexRowsByNumber(seating as BulkSeating[], (row) => row.hallId);
  let occupancy: Awaited<ReturnType<typeof loadOccupancy>> | undefined;
  if (parsed.intervalComplete) {
    const interval = parseCatalogInterval({
      eventDate: parsed.date!,
      startTime: parsed.startTime!,
      endTime: parsed.endTime!,
      timezone: venue.timezone,
    });
    occupancy = await loadOccupancy(
      [venue.id],
      interval
        ? withAdjacentIsoDates(localDatesIntersecting(interval))
        : withAdjacentIsoDates([parsed.date!]),
      interval ? {
        startsAt: new Date(interval.startsAt.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(interval.endsAt.getTime() + 24 * 60 * 60 * 1000),
      } : undefined,
    );
  }
  const occupancyByVenue = occupancy ? indexOccupancyByVenue(occupancy) : undefined;
  const covers = await loadCovers([venue.id]);
  const card = buildCard({
    venue,
    halls: bulkHalls,
    hallMeta,
    seatingByHall,
    occupancy: occupancyByVenue?.get(venue.id),
    filters: parsed,
    revealPrices,
    coverImageUrl: covers.get(venue.id) ?? null,
    dropWhenUnsuitable: false,
  });
  if (!card) return null;

  const [images, venueReviews, hallImageRows] = await Promise.all([
    db
      .select({
        id: venueImages.id,
        venueId: venueImages.venueId,
        hallId: venueImages.hallId,
        url: venueImages.url,
        altRo: venueImages.altRo,
        altRu: venueImages.altRu,
        altEn: venueImages.altEn,
        sortOrder: venueImages.sortOrder,
        isCover: venueImages.isCover,
      })
      .from(venueImages)
      .innerJoin(venues, eq(venues.id, venueImages.venueId))
      .where(and(
        eq(venueImages.venueId, venue.id),
        isNull(venueImages.hallId),
        eq(venues.isActive, true),
      ))
      .orderBy(asc(venueImages.sortOrder)),
    db
      .select({
        id: reviews.id,
        authorName: reviews.authorName,
        rating: reviews.rating,
        text: reviews.text,
        reply: reviews.reply,
        isApproved: reviews.isApproved,
        photos: reviews.photos,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(and(eq(reviews.venueId, venue.id), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    db
      .select({
        id: venueImages.id,
        hallId: venueImages.hallId,
        url: venueImages.url,
        altRo: venueImages.altRo,
        sortOrder: venueImages.sortOrder,
        isCover: venueImages.isCover,
      })
      .from(venueImages)
      .where(and(
        eq(venueImages.venueId, venue.id),
        sql`${venueImages.hallId} IS NOT NULL`,
      ))
      .orderBy(asc(venueImages.sortOrder)),
  ]);

  return {
    ...card,
    descriptionRo: venue.descriptionRo,
    descriptionRu: venue.descriptionRu,
    descriptionEn: venue.descriptionEn,
    facilities: venue.facilities,
    workingHours: venue.workingHours,
    calendarEnabled: venue.calendarEnabled,
    images: images.map((image) => ({ ...image, sortOrder: image.sortOrder ?? 0 })),
    hallImages: hallImageRows
      .filter((image): image is typeof image & { hallId: number } => image.hallId != null)
      .filter((image) => card.halls.some((hall) => hall.id === image.hallId))
      .map((image) => ({ ...image, sortOrder: image.sortOrder ?? 0 })),
    reviews: venueReviews,
    seoTitleRo: venue.seoTitleRo,
    seoTitleRu: venue.seoTitleRu,
    seoTitleEn: venue.seoTitleEn,
    seoDescRo: venue.seoDescRo,
    seoDescRu: venue.seoDescRu,
    seoDescEn: venue.seoDescEn,
    ogImageUrl: venue.ogImageUrl,
    isActive: true,
  };
}
