import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { plannerBookingTiers, plannerDurationHint } from "../src/lib/planner/artist-booking-pricing";
import { perEventOffers, resolvePriceForDuration, tierDurationMinutes, tierMode, type PricingTier } from "../src/lib/pricing/resolve";
import { t } from "../src/i18n";

const wedding: PricingTier = {
  id: 100, nameRo: "Nuntă", pricingMode: "per_event", eventType: "wedding", price: 300,
  durationHours: null, durationMinutes: 0, scope: "base", scopeDayOfWeek: null, scopeFromTime: null, isVisible: true,
};
const context = { eventDate: "2026-10-17", startTime: "14:00", eventType: "wedding" };

test("onboarding's flat wedding price survives modal loading and resolves to the original package/300 EUR", () => {
  assert.equal(tierDurationMinutes(wedding), null);
  const packages = plannerBookingTiers([wedding]);
  assert.equal(packages.length, 1);
  const offers = perEventOffers(packages, context);
  assert.deepEqual(offers, [{ price: 300, tier: wedding }]);
  const requestPricing = { agreedPrice: offers[0].price, packageId: offers[0].tier.id };
  assert.deepEqual(requestPricing, { agreedPrice: 300, packageId: 100 });
  assert.equal(resolvePriceForDuration(packages, 60, context), null);
});

test("flat prices with an average duration remain distinct from genuine hourly tiers", () => {
  const averageEvent = { ...wedding, durationHours: 6 };
  const hourly = { ...wedding, id: 101, pricingMode: "per_hour", eventType: null, durationHours: 6, price: 200 };
  const packages = plannerBookingTiers([averageEvent, hourly]);
  assert.equal(perEventOffers(packages, context)[0].price, 300);
  assert.equal(resolvePriceForDuration(packages, 360, context)?.price, 200);
  assert.equal(packages.filter(tier => tierMode(tier) === "per_hour").length, 1);
});

test("hidden, unpriced, invalid and durationless hourly rows are not booking choices", () => {
  const cases = [
    { ...wedding, isVisible: false }, { ...wedding, price: null }, { ...wedding, price: Number.NaN },
    { ...wedding, price: Number.POSITIVE_INFINITY }, { ...wedding, price: -1 },
    { ...wedding, pricingMode: "per_hour" }, { ...wedding, pricingMode: undefined },
  ];
  assert.deepEqual(plannerBookingTiers(cases), []);
  assert.equal(plannerBookingTiers([{ ...wedding, pricingMode: undefined, durationMinutes: 45 }]).length, 1);
});

test("retaining flat prices does not bypass event-type or calendar scope restrictions", () => {
  assert.deepEqual(perEventOffers(plannerBookingTiers([wedding]), { ...context, eventType: "birthday" }), []);
  assert.deepEqual(perEventOffers(plannerBookingTiers([{ ...wedding, scope: "weekday" }]), context), []);
  assert.equal(perEventOffers(plannerBookingTiers([{ ...wedding, eventType: null }]), { ...context, eventType: "birthday" }).length, 1);
});

test("loading, per-event, hourly and manual duration instructions are distinct", () => {
  const hint = (loading: boolean, durationCount: number, eventOfferCount: number, eventSelected = false) =>
    plannerDurationHint({ loading, durationCount, eventOfferCount, eventSelected });
  assert.equal(hint(true, 0, 0), "cabinet.plan.modal.loadingPackages");
  assert.equal(hint(false, 0, 1), "cabinet.plan.modal.perEventDurationHint");
  assert.equal(hint(false, 1, 1, true), "cabinet.plan.modal.perEventDurationHint");
  assert.equal(hint(false, 1, 1), "cabinet.plan.modal.durationHint");
  assert.equal(hint(false, 0, 0), "cabinet.plan.modal.noTariffs");
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: flat-event instructions exist and never claim missing artist rates`, () => {
    const flatHint = t("cabinet.plan.modal.perEventDurationHint", locale);
    assert.notEqual(flatHint, "cabinet.plan.modal.perEventDurationHint");
    assert.doesNotMatch(flatHint, /nu a definit|не указал|not defined/i);
    assert.doesNotMatch(t("cabinet.plan.modal.noTariffs", locale), /nu a definit|не указал|not defined/i);
  });
}

test("live modal wiring retains flat prices, blocks loading submissions and provides a manual interval for flat offers", () => {
  const source = readFileSync("src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx", "utf8");
  const card = source.split("function PlanArtistCard(")[1].split("function VenueDiscoveryCard(")[0];
  assert.match(card, /plannerBookingTiers\(Array\.isArray\(data\) \? data : \[\]\)/);
  assert.doesNotMatch(card, /p\.price != null && tierDurationMinutes\(p\) != null/);
  assert.match(card, /const canSubmit = !packagesLoading/);
  assert.match(card, /selectedEventOffer != null && timesValid\(\)/);
  assert.match(card, /const showDurationOptions = durationOptions\.length > 0 && selectedEventOffer == null/);
  assert.match(card, /\) : showDurationOptions \?/);
  assert.match(card, /packageId: resolvedForSelection\?\.tier\.id/);
  assert.match(card, /agreedPrice: computedPrice \?\? undefined/);
  assert.match(card, /t\(plannerDurationHint/);
});
