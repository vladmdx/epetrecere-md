// M3 — Shared calculation logic for all event planning calculators.
//
// These are PURE functions — no React, no DB. They can be imported from
// server components, client components, API routes, and tests alike.
// All currency values are in EUR.

export type EventType =
  | "wedding"
  | "baptism"
  | "cumatrie"
  | "birthday"
  | "corporate"
  | "concert"
  | "other";

// ══════════════════════════════════════════════════════════════
// BUDGET CALCULATOR
// ══════════════════════════════════════════════════════════════
//
// Estimates total event cost based on guest count, venue type, and selected
// service categories. Prices are Moldova-specific market averages (EUR) as
// of 2025 research — tune in BUDGET_RATES below.

export interface BudgetLineItem {
  key: string;
  label: string;
  amount: number;
  /** "percent" of total — for pie-chart rendering */
  percent: number;
}

export interface BudgetInput {
  eventType: EventType;
  guestCount: number;
  /** Cost per plate at the venue (EUR). If 0 → "I already have a venue / no food cost". */
  pricePerPerson: number;
  /** Selected service categories (slugs). */
  services: string[];
  /** Optional venue rental flat fee (EUR), added on top of per-plate. */
  venueRentalFee?: number;
}

export interface BudgetResult {
  total: number;
  items: BudgetLineItem[];
  /** Low/high range for the total estimate (±20%) */
  totalLow: number;
  totalHigh: number;
}

// Per-guest multipliers (some services scale with headcount).
// Flat services use a fixed base price regardless of guest count.
type ServiceRate =
  | { kind: "flat"; price: number; label: string }
  | { kind: "per_guest"; price: number; label: string };

export const BUDGET_SERVICE_RATES: Record<string, ServiceRate> = {
  // Performers — flat rates for a typical 5-6 hour event.
  singer: { kind: "flat", price: 600, label: "Cântăreț" },
  band: { kind: "flat", price: 1200, label: "Formație / Band" },
  dj: { kind: "flat", price: 450, label: "DJ" },
  mc: { kind: "flat", price: 500, label: "Moderator / MC" },
  show: { kind: "flat", price: 400, label: "Show program / Dansatori" },

  // Media
  photographer: { kind: "flat", price: 500, label: "Fotograf" },
  videographer: { kind: "flat", price: 700, label: "Videograf" },

  // Aesthetics (scale moderately with guests for scope)
  decor: { kind: "flat", price: 800, label: "Decor / Floristică" },
  candy_bar: { kind: "per_guest", price: 8, label: "Candy Bar / Tort" },
  fireworks: { kind: "flat", price: 350, label: "Foc de artificii" },

  // Extras
  animators: { kind: "flat", price: 300, label: "Animatori (copii)" },
  equipment: { kind: "flat", price: 400, label: "Echipament tehnic" },
  transport: { kind: "flat", price: 250, label: "Transport invitați" },
  invitations: { kind: "per_guest", price: 3, label: "Invitații & tipar" },
};

// Event-type multipliers applied to the final total — weddings cost more to
// run than a casual birthday at the same headcount due to extras, outfits,
// ceremony, etc.
const EVENT_TYPE_MULTIPLIER: Record<EventType, number> = {
  wedding: 1.15,
  baptism: 0.9,
  cumatrie: 0.85,
  birthday: 0.8,
  corporate: 1.0,
  concert: 1.05,
  other: 1.0,
};

export function calculateBudget(input: BudgetInput): BudgetResult {
  const { eventType, guestCount, pricePerPerson, services, venueRentalFee = 0 } = input;
  const multiplier = EVENT_TYPE_MULTIPLIER[eventType] ?? 1;

  const lineItems: Omit<BudgetLineItem, "percent">[] = [];

  // 1. Venue / catering (dominant line for most events)
  if (pricePerPerson > 0) {
    lineItems.push({
      key: "catering",
      label: "Meniu & servire (sală/restaurant)",
      amount: Math.round(pricePerPerson * guestCount),
    });
  }
  if (venueRentalFee > 0) {
    lineItems.push({
      key: "venue_rental",
      label: "Chirie sală",
      amount: Math.round(venueRentalFee),
    });
  }

  // 2. Services
  for (const slug of services) {
    const rate = BUDGET_SERVICE_RATES[slug];
    if (!rate) continue;
    const amount =
      rate.kind === "flat" ? rate.price : Math.round(rate.price * guestCount);
    lineItems.push({ key: slug, label: rate.label, amount });
  }

  // 3. Apply event-type multiplier on non-venue extras (not on the venue
  // line, which is already precise per plate)
  const adjustedItems = lineItems.map((item) => {
    if (item.key === "catering" || item.key === "venue_rental") return item;
    return { ...item, amount: Math.round(item.amount * multiplier) };
  });

  const total = adjustedItems.reduce((sum, i) => sum + i.amount, 0);

  const items: BudgetLineItem[] = adjustedItems.map((i) => ({
    ...i,
    percent: total > 0 ? Math.round((i.amount / total) * 1000) / 10 : 0,
  }));

  return {
    total,
    items,
    totalLow: Math.round(total * 0.8),
    totalHigh: Math.round(total * 1.2),
  };
}

// ══════════════════════════════════════════════════════════════
// GUEST / TABLE CALCULATOR
// ══════════════════════════════════════════════════════════════

export interface GuestInput {
  guestCount: number;
  /** Typical 8, 10 or 12 per table in Moldovan restaurants. */
  seatsPerTable: number;
  /** Optional expected no-show rate (0..1). Default 0.1 = 10%. */
  noShowRate?: number;
  /** Head table for bride&groom etc. — reserves this many seats outside the grid. */
  headTableSeats?: number;
}

export interface GuestResult {
  /** Expected actual attendance after no-shows. */
  expectedAttendance: number;
  /** Tables required including head table when present. */
  tablesNeeded: number;
  /** Remaining empty seats at the last table (to help decide trimming). */
  emptySeatsLastTable: number;
  /** Recommended bathroom count — Moldova sanitary norm ~1 per 50 guests. */
  bathroomsNeeded: number;
  /** Recommended waiting staff — 1 waiter per ~15 guests at a seated dinner. */
  waitersNeeded: number;
  /** Recommended parking spaces — 1 per 3 guests assuming ride-sharing. */
  parkingNeeded: number;
}

export function calculateGuests(input: GuestInput): GuestResult {
  const { guestCount, seatsPerTable, headTableSeats = 0 } = input;
  const noShowRate = input.noShowRate ?? 0.1;

  const expectedAttendance = Math.round(guestCount * (1 - noShowRate));

  // Subtract head table from regular seating pool
  const seatsToPlace = Math.max(0, expectedAttendance - headTableSeats);
  const regularTables = Math.ceil(seatsToPlace / seatsPerTable);
  const tablesNeeded = regularTables + (headTableSeats > 0 ? 1 : 0);
  const emptySeatsLastTable =
    regularTables * seatsPerTable - seatsToPlace;

  return {
    expectedAttendance,
    tablesNeeded,
    emptySeatsLastTable,
    bathroomsNeeded: Math.max(2, Math.ceil(expectedAttendance / 50)),
    waitersNeeded: Math.max(2, Math.ceil(expectedAttendance / 15)),
    parkingNeeded: Math.ceil(expectedAttendance / 3),
  };
}

// ══════════════════════════════════════════════════════════════
// ALCOHOL & DRINKS CALCULATOR
// ══════════════════════════════════════════════════════════════
//
// Moldova-specific defaults: wine country + strong tradition of hard alcohol
// at weddings. Quantities in milliliters → converted to bottles.
//
// Rule of thumb for a 5-6h wedding:
//   - Vin: 500 ml per adult
//   - Vodka/cognac: 200 ml per adult
//   - Șampanie: 150 ml per adult (1 toast)
//   - Apă: 1000 ml per adult
//   - Suc: 500 ml per adult
// Reduced defaults for non-wedding events (birthday etc.) below.

export interface DrinkInput {
  eventType: EventType;
  guestCount: number;
  /** % of guests who drink alcohol (0..1). Default 0.8 = 80%. */
  drinkersRatio?: number;
  /** Hours of event. Default 6. Scales consumption linearly from baseline 6h. */
  durationHours?: number;
}

export interface DrinkLine {
  key: string;
  label: string;
  /** ml per drinker at baseline (6h, wedding). */
  mlPerDrinker: number;
  /** Standard bottle volume in ml. */
  bottleMl: number;
  /** Computed total ml after multipliers. */
  totalMl: number;
  /** Bottles needed (rounded up). */
  bottles: number;
  /** Estimated cost per bottle in EUR (Moldova average retail). */
  pricePerBottle: number;
  /** totalCost = bottles * pricePerBottle */
  totalCost: number;
}

export interface DrinkResult {
  lines: DrinkLine[];
  totalCost: number;
  totalBottles: number;
}

// [mlPerDrinker (adult) at wedding 6h, bottleMl, pricePerBottleEUR, label]
const DRINK_DEFAULTS = [
  { key: "wine_red",    label: "Vin roșu",          mlPerDrinker: 300, bottleMl: 750,  pricePerBottle: 6 },
  { key: "wine_white",  label: "Vin alb",           mlPerDrinker: 200, bottleMl: 750,  pricePerBottle: 6 },
  { key: "vodka",       label: "Vodkă",             mlPerDrinker: 120, bottleMl: 700,  pricePerBottle: 10 },
  { key: "cognac",      label: "Coniac",            mlPerDrinker: 80,  bottleMl: 700,  pricePerBottle: 15 },
  { key: "champagne",   label: "Șampanie",          mlPerDrinker: 150, bottleMl: 750,  pricePerBottle: 9 },
  { key: "beer",        label: "Bere",              mlPerDrinker: 400, bottleMl: 500,  pricePerBottle: 2 },
  { key: "water",       label: "Apă plată+minerală",mlPerDrinker: 1000,bottleMl: 1500, pricePerBottle: 1 },
  { key: "juice",       label: "Suc / băuturi dulci",mlPerDrinker: 500,bottleMl: 1000, pricePerBottle: 2 },
] as const;

// Event-type drink multipliers — corporate drinks less hard alcohol, concert
// drinks mostly beer, etc.
const EVENT_DRINK_WEIGHT: Record<EventType, Partial<Record<string, number>>> = {
  wedding:   { wine_red: 1.0, wine_white: 1.0, vodka: 1.0, cognac: 1.0, champagne: 1.0, beer: 0.5, water: 1.0, juice: 1.0 },
  baptism:   { wine_red: 0.9, wine_white: 0.9, vodka: 0.7, cognac: 0.7, champagne: 1.0, beer: 0.4, water: 1.0, juice: 1.2 },
  cumatrie:  { wine_red: 1.0, wine_white: 0.9, vodka: 0.8, cognac: 0.7, champagne: 0.8, beer: 0.5, water: 1.0, juice: 1.0 },
  birthday:  { wine_red: 0.6, wine_white: 0.7, vodka: 0.6, cognac: 0.4, champagne: 0.5, beer: 1.0, water: 1.0, juice: 1.2 },
  corporate: { wine_red: 0.7, wine_white: 0.8, vodka: 0.4, cognac: 0.3, champagne: 0.8, beer: 0.8, water: 1.0, juice: 1.5 },
  concert:   { wine_red: 0.3, wine_white: 0.3, vodka: 0.4, cognac: 0.2, champagne: 0.2, beer: 1.5, water: 1.0, juice: 1.0 },
  other:     { wine_red: 0.8, wine_white: 0.8, vodka: 0.6, cognac: 0.5, champagne: 0.6, beer: 0.8, water: 1.0, juice: 1.0 },
};

export function calculateDrinks(input: DrinkInput): DrinkResult {
  const { eventType, guestCount } = input;
  const drinkersRatio = input.drinkersRatio ?? 0.8;
  const duration = input.durationHours ?? 6;
  const timeScale = duration / 6;
  const drinkers = Math.round(guestCount * drinkersRatio);
  const weights = EVENT_DRINK_WEIGHT[eventType] ?? EVENT_DRINK_WEIGHT.other;

  const lines: DrinkLine[] = DRINK_DEFAULTS.map((d) => {
    const isAlcohol = !["water", "juice"].includes(d.key);
    // Water/juice scale with TOTAL guests (kids drink them too)
    const drinkingPool = isAlcohol ? drinkers : guestCount;
    const weight = weights[d.key] ?? 1;
    const totalMl = Math.round(
      d.mlPerDrinker * drinkingPool * weight * timeScale,
    );
    const bottles = Math.ceil(totalMl / d.bottleMl);
    return {
      key: d.key,
      label: d.label,
      mlPerDrinker: d.mlPerDrinker,
      bottleMl: d.bottleMl,
      totalMl,
      bottles,
      pricePerBottle: d.pricePerBottle,
      totalCost: bottles * d.pricePerBottle,
    };
  });

  const totalCost = lines.reduce((s, l) => s + l.totalCost, 0);
  const totalBottles = lines.reduce((s, l) => s + l.bottles, 0);

  return { lines, totalCost, totalBottles };
}

// ══════════════════════════════════════════════════════════════
// MENU / FOOD CALCULATOR
// ══════════════════════════════════════════════════════════════
//
// Moldovan banquet menu norms: cold apps (răcituri), hot apps, main course,
// salads, bread, dessert, fruits. Quantities in grams per guest then
// multiplied → kilograms needed.

export interface MenuInput {
  eventType: EventType;
  guestCount: number;
  /** Whether to include the traditional Moldovan wedding zeama (soup). */
  includeSoup?: boolean;
  /** Whether to include a late-night snack station (kebabs etc.). */
  includeLateNight?: boolean;
}

export interface MenuLine {
  key: string;
  label: string;
  /** Grams per guest */
  gramsPerGuest: number;
  /** Total kg needed */
  totalKg: number;
  /** Indicative bulk price per kg (EUR, Moldova 2025). */
  pricePerKg: number;
  /** bulk cost = pricePerKg * totalKg */
  totalCost: number;
}

export interface MenuResult {
  lines: MenuLine[];
  totalKg: number;
  totalCost: number;
}

const MENU_DEFAULTS = [
  { key: "cold_apps",  label: "Aperitive reci (răcituri, mezeluri)", grams: 250, pricePerKg: 9 },
  { key: "salads",     label: "Salate",                              grams: 250, pricePerKg: 6 },
  { key: "hot_apps",   label: "Aperitive calde",                     grams: 150, pricePerKg: 10 },
  { key: "main",       label: "Fel principal (carne + garnitură)",   grams: 400, pricePerKg: 11 },
  { key: "bread",      label: "Pâine",                               grams: 150, pricePerKg: 2 },
  { key: "fruits",     label: "Fructe",                              grams: 200, pricePerKg: 3.5 },
  { key: "dessert",    label: "Tort / desert",                       grams: 150, pricePerKg: 12 },
];

const MENU_EVENT_SCALE: Record<EventType, number> = {
  wedding: 1.0,
  baptism: 0.9,
  cumatrie: 0.95,
  birthday: 0.85,
  corporate: 0.8,
  concert: 0.6,
  other: 0.9,
};

export function calculateMenu(input: MenuInput): MenuResult {
  const { eventType, guestCount, includeSoup = false, includeLateNight = false } = input;
  const scale = MENU_EVENT_SCALE[eventType] ?? 1;

  const base = MENU_DEFAULTS.map((m) => {
    const totalKg = Math.round((m.grams * guestCount * scale) / 100) / 10;
    return {
      key: m.key,
      label: m.label,
      gramsPerGuest: Math.round(m.grams * scale),
      totalKg,
      pricePerKg: m.pricePerKg,
      totalCost: Math.round(totalKg * m.pricePerKg),
    };
  });

  const extras: MenuLine[] = [];
  if (includeSoup) {
    const grams = 350;
    const totalKg = Math.round((grams * guestCount * scale) / 100) / 10;
    extras.push({
      key: "soup",
      label: "Zeamă / supă",
      gramsPerGuest: grams,
      totalKg,
      pricePerKg: 4,
      totalCost: Math.round(totalKg * 4),
    });
  }
  if (includeLateNight) {
    const grams = 200;
    const totalKg = Math.round((grams * guestCount * scale) / 100) / 10;
    extras.push({
      key: "late_night",
      label: "Gustare de noapte (kebab, frigărui)",
      gramsPerGuest: grams,
      totalKg,
      pricePerKg: 13,
      totalCost: Math.round(totalKg * 13),
    });
  }

  const lines = [...base, ...extras];
  return {
    lines,
    totalKg: Math.round(lines.reduce((s, l) => s + l.totalKg, 0) * 10) / 10,
    totalCost: lines.reduce((s, l) => s + l.totalCost, 0),
  };
}

// ══════════════════════════════════════════════════════════════
// Helpers used across calculator UIs
// ══════════════════════════════════════════════════════════════

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Aniversare",
  corporate: "Corporate",
  concert: "Concert / Petrecere",
  other: "Alt tip",
};

export function formatEUR(amount: number): string {
  return `${amount.toLocaleString("ro-MD")} €`;
}
