import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hallEffectivePrice,
  minComparablePrice,
  minPerPersonUnitPrice,
} from "../src/lib/venues/effective-price";
import { parseCatalogFilters } from "../src/lib/venues/catalog-filters";
import { resolveSelectedHall } from "../src/lib/venues/hall-selection";
import {
  hallCapacityFits,
  hallOccupancyAvailable,
  parseCatalogInterval,
} from "../src/lib/booking/venue-availability-bulk";
import {
  VENUE_DST_FOLD_POLICY,
  VenueIntervalValidationError,
  canonicalVenueIntervalStrict,
} from "../src/lib/booking/zoned-interval";
import { venueJsonLd } from "../src/lib/seo/jsonld";

describe("catalog price resolver", () => {
  test("per_person totals only with guestCount; zero is comparable", () => {
    const missingGuests = hallEffectivePrice({
      pricingModel: "per_person",
      basePrice: 10,
      minimumOrder: null,
      currency: "EUR",
    });
    assert.deepEqual(missingGuests, {
      comparable: false,
      reason: "missing_guest_count",
      unitAmount: 10,
      currency: "EUR",
      model: "per_person",
    });
    const total = hallEffectivePrice({
      pricingModel: "per_person",
      basePrice: 10,
      minimumOrder: null,
      currency: "EUR",
    }, 8);
    assert.deepEqual(total, {
      comparable: true,
      amount: 80,
      currency: "EUR",
      model: "per_person",
      unitAmount: 10,
    });
    assert.deepEqual(minPerPersonUnitPrice([missingGuests, total]), {
      amount: 10,
      currency: "EUR",
    });
    const zero = hallEffectivePrice({
      pricingModel: "fixed",
      basePrice: 0,
      minimumOrder: null,
      currency: "EUR",
    });
    assert.deepEqual(zero, { comparable: true, amount: 0, currency: "EUR", model: "fixed" });
  });

  test("minimum_order, quote and non-EUR are explicit", () => {
    assert.equal(
      hallEffectivePrice({
        pricingModel: "minimum_order",
        basePrice: 20,
        minimumOrder: 400,
        currency: "EUR",
      }).comparable,
      true,
    );
    assert.deepEqual(
      hallEffectivePrice({
        pricingModel: "quote",
        basePrice: 10,
        minimumOrder: null,
        currency: "EUR",
      }),
      { comparable: false, reason: "quote" },
    );
    assert.deepEqual(
      hallEffectivePrice({
        pricingModel: "fixed",
        basePrice: 10,
        minimumOrder: null,
        currency: "MDL",
      }),
      { comparable: false, reason: "non_eur" },
    );
    assert.equal(minComparablePrice([
      { comparable: false, reason: "quote" },
      { comparable: true, amount: 50, currency: "EUR", model: "fixed" },
      { comparable: true, amount: 20, currency: "EUR", model: "fixed" },
    ])?.amount, 20);
    assert.deepEqual(
      hallEffectivePrice({
        pricingModel: "fixed",
        basePrice: -1,
        minimumOrder: null,
        currency: "EUR",
      }),
      { comparable: false, reason: "missing_amount" },
    );
  });
});

describe("catalog filters", () => {
  test("incomplete interval is needs_interval with null availability count contract", () => {
    const parsed = parseCatalogFilters({ date: "2026-10-10", start: "18:00" });
    assert.equal(parsed.intervalComplete, false);
    assert.equal(parsed.availabilityStatus, "needs_interval");
    const complete = parseCatalogFilters({ date: "2026-10-10", start: "18:00", end: "23:00" });
    assert.equal(complete.intervalComplete, true);
    assert.equal(complete.availabilityStatus, "available");
    const aliases = parseCatalogFilters({
      capacity_min: 80,
      cities: "ignored",
      guest_count: "12",
      price_max: "200",
      sort: "price_asc",
      page: "2",
      limit: "8",
    });
    assert.equal(aliases.guestCount, 12);
    assert.equal(aliases.priceMax, 200);
    assert.equal(aliases.sort, "price_asc");
    assert.equal(aliases.page, 2);
    assert.equal(aliases.limit, 8);
  });

  test("malformed criteria fail closed instead of widening the catalog", () => {
    const parsed = parseCatalogFilters({
      guest_count: "three",
      price_max: "-1",
      date: "2026-02-31",
      start: "25:00",
      end: "noon",
    });
    assert.deepEqual(parsed.invalidFields, [
      "guest_count",
      "price_max",
      "date",
      "start",
      "end",
    ]);
    assert.equal(parsed.guestCount, undefined);
    assert.equal(parsed.priceMax, undefined);
    assert.equal(parsed.intervalComplete, false);
    assert.equal(parsed.availabilityStatus, "invalid_interval");
  });
});

describe("hall selection", () => {
  const halls = [
    { id: 1, slug: "grand", suitable: true, available: true },
    { id: 2, slug: "garden", suitable: false, available: true },
    { id: 3, slug: "vip", suitable: false, available: true },
  ];

  test("Grand 250 / Garden 120 / VIP 40 at 150 guests keeps only Grand eligible", () => {
    const grand = { id: 1, venueId: 9, status: "active", capacityMin: 80, capacityMax: 250, workingHours: null, bufferMinutes: null };
    const garden = { id: 2, venueId: 9, status: "active", capacityMin: 40, capacityMax: 120, workingHours: null, bufferMinutes: null };
    const vip = { id: 3, venueId: 9, status: "active", capacityMin: 10, capacityMax: 40, workingHours: null, bufferMinutes: null };
    assert.equal(hallCapacityFits(grand, [], 150), true);
    assert.equal(hallCapacityFits(garden, [], 150), false);
    assert.equal(hallCapacityFits(vip, [], 150), false);
    const selected = resolveSelectedHall({ halls, intervalComplete: false });
    assert.equal(selected.preselected, true);
    assert.equal(selected.slug, "grand");
  });

  test("invalid slug is ignored without disclosure; explicit choice survives guest invalidation", () => {
    const ignored = resolveSelectedHall({
      halls,
      requestedSlug: "secret-inactive",
      intervalComplete: false,
    });
    assert.equal(ignored.slug, "grand");
    const kept = resolveSelectedHall({
      halls: halls.map((hall) => hall.slug === "garden" ? { ...hall, suitable: false } : hall),
      requestedSlug: "garden",
      intervalComplete: false,
    });
    assert.equal(kept.slug, "garden");
    assert.equal(kept.preselected, false);
  });
});

describe("strict venue interval", () => {
  test("overnight end<=start lands on the next local day; instant end is after start", () => {
    const interval = canonicalVenueIntervalStrict({
      eventDate: "2026-10-10",
      startTime: "22:00",
      endTime: "02:00",
      timezone: "Europe/Chisinau",
    });
    assert.equal(interval.endsAt.getTime() > interval.startsAt.getTime(), true);
    assert.equal(interval.eventDate, "2026-10-10");
  });

  test("DST gap is rejected and fold uses the earlier instant", () => {
    assert.equal(VENUE_DST_FOLD_POLICY, "earlier");
    assert.throws(
      () => canonicalVenueIntervalStrict({
        eventDate: "2026-03-29",
        startTime: "03:30",
        endTime: "04:00",
        timezone: "Europe/Chisinau",
      }),
      VenueIntervalValidationError,
    );
    const folded = canonicalVenueIntervalStrict({
      eventDate: "2026-10-25",
      startTime: "03:30",
      endTime: "04:00",
      timezone: "Europe/Chisinau",
    });
    assert.equal(folded.startsAt.toISOString(), "2026-10-25T00:30:00.000Z");
    assert.equal(parseCatalogInterval({
      eventDate: "2026-03-29",
      startTime: "03:30",
      endTime: "04:00",
      timezone: "Europe/Chisinau",
    }), null);
  });

  test("30-minute fold also follows the earlier-instant policy", () => {
    const folded = canonicalVenueIntervalStrict({
      eventDate: "2026-04-05",
      startTime: "01:30",
      endTime: "02:30",
      timezone: "Australia/Lord_Howe",
    });
    assert.equal(folded.startsAt.toISOString(), "2026-04-04T14:30:00.000Z");
  });
});

describe("bulk hall occupancy", () => {
  test("a legacy booking without hallId remains a whole-venue conflict", () => {
    const interval = canonicalVenueIntervalStrict({
      eventDate: "2026-10-10",
      startTime: "18:00",
      endTime: "23:00",
      timezone: "Europe/Chisinau",
    });
    const hall = {
      id: 11,
      venueId: 7,
      status: "active",
      capacityMin: 1,
      capacityMax: 200,
      workingHours: null,
      bufferMinutes: 30,
    };
    assert.equal(hallOccupancyAvailable({
      venue: { id: 7, timezone: "Europe/Chisinau", bufferMinutes: 30, workingHours: null },
      hall,
      halls: [hall],
      guestCount: 100,
      interval,
      startTime: "18:00",
      endTime: "23:00",
      seating: [],
      blocks: [],
      conflictMembers: [],
      legacyEvents: [],
      bookings: [{
        id: 99,
        venueId: 7,
        hallId: null,
        reservationScope: null,
        status: "accepted",
        eventDate: "2026-10-10",
        startTime: "20:00",
        endTime: "22:00",
        timezone: "Europe/Chisinau",
        startsAt: null,
        endsAt: null,
      }],
    }), false);
  });
});

describe("JSON-LD", () => {
  test("one LocalBusiness, halls only as containsPlace fragment ids, no price", () => {
    const json = venueJsonLd({
      name: "Casa",
      description: "Sala",
      slug: "casa",
      locale: "ro",
      halls: [{ slug: "grand", name: "Grand" }],
    });
    const encoded = JSON.stringify(json);
    assert.match(String(json.url), /\/sali\/casa$/);
    assert.equal(json["@type"], "LocalBusiness");
    assert.deepEqual(json.containsPlace, [{
      "@type": "Place",
      name: "Grand",
      "@id": `${json.url}#hall-grand`,
    }]);
    assert.equal(/price|offers/i.test(encoded), false);
  });
});
