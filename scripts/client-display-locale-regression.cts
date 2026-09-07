/** Actual initial React renders, including Base UI selected values before opening.
 * Source-only test harness exposes private home components in memory, not in Next exports. */
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { GuestsView } = require("../src/components/planner/guests-view");
const { LocaleProvider } = require("../src/hooks/use-locale");
const { t } = require("../src/i18n");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const root = path.resolve(__dirname, "..");
const homePath = path.join(root, "src/app/[locale]/(client)/cabinet/page.tsx");
const homeSource = readFileSync(homePath, "utf8");
const compiled = new Module(homePath, module);
compiled.filename = homePath;
compiled.paths = Module._nodeModulePaths(path.dirname(homePath));
compiled._compile(ts.transpileModule(homeSource + "\nexport { HeroCard as TestHeroCard, BottomRow as TestBottomRow };", {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, homePath);
const { TestHeroCard, TestBottomRow } = compiled.exports;
const planPath = path.join(root, "src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx");
const planSource = readFileSync(planPath, "utf8");
const planCompiled = new Module(planPath, module);
planCompiled.filename = planPath;
planCompiled.paths = Module._nodeModulePaths(path.dirname(planPath));
const categoryFixture = [
  { id: 1, type: "artist", nameRo: "Formații / Grupuri", nameRu: "Группы / Ансамбли", nameEn: "Bands / Groups" },
  { id: 2, type: "artist", nameRo: "Cântăreți de Estradă", nameRu: "Эстрадные певцы", nameEn: "Pop singers" },
  { id: 3, type: "service", nameRo: "Foto & Video", nameRu: "Фото и видео", nameEn: "Photo & Video" },
];
const oldLoad = Module._load;
// Mimic the completed categories GET in SettingsTab without running effects or
// requests. Its other state values are non-empty/scalars in the fixture.
Module._load = function(request, parent, isMain) {
  if (request === "react" && parent?.filename === planPath) return { ...React,
    useState(initial) { return React.useState(Array.isArray(initial) && initial.length === 0 ? categoryFixture : initial); },
  };
  return oldLoad.call(this, request, parent, isMain);
};
try {
  planCompiled._compile(ts.transpileModule(planSource + "\nexport { VenuesTab, DiscoverySection, BookingListCard, MyBookingsTab, SettingsTab, AllCategoriesBookedPanel, eventRateLabel };", {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, planPath);
} finally { Module._load = oldLoad; }
const calendarPath = path.join(root, "src/components/public/custom-calendar.tsx");
const calendarCompiled = new Module(calendarPath, module);
calendarCompiled.filename = calendarPath;
calendarCompiled.paths = Module._nodeModulePaths(path.dirname(calendarPath));
Module._load = function(request, parent, isMain) {
  if (request === "react" && parent?.filename === calendarPath) return { ...React,
    useState(initial) { return React.useState(initial === false ? true : initial); },
  };
  return oldLoad.call(this, request, parent, isMain);
};
try {
  calendarCompiled._compile(ts.transpileModule(readFileSync(calendarPath, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, calendarPath);
} finally { Module._load = oldLoad; }
const statuses = ["pending", "accepted", "declined", "maybe"];
const keys = ["rsvpPending", "rsvpAccepted", "rsvpDeclined", "rsvpMaybe"];
const guestData = statuses.map((rsvp, index) => ({
  id: index + 1, fullName: `QA ${index}`, phone: null, email: null, group: null,
  guestType: "single", partySize: 1, kidsCount: 0, plusOnes: 0, dietary: null, rsvp, notes: null,
}));
const plan = { id: 99, title: "QA event", eventType: "wedding", eventDate: "2026-09-20", location: "Bălți", guestCountTarget: 60, guestsEnabled: true, momentsEnabled: false, selectedCategories: [1] };
const noMutation = () => assert.fail("Rendering must not navigate or mutate");
function render(locale, component) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, {
    value: { push: noMutation, replace: noMutation, refresh: noMutation, back: noMutation, forward: noMutation, prefetch: noMutation },
    children: React.createElement(LocaleProvider, { initialLocale: locale, children: component }),
  }));
}
test.before(() => { global.React = React; });
test.after(() => { delete global.React; });
for (const locale of ["ro", "ru", "en"]) {
  test(`${locale}: guest RSVP values are translated on initial render with the popup closed`, () => {
    const snapshot = JSON.stringify(guestData);
    const html = render(locale, React.createElement(GuestsView, { planId: 99, guestCountTarget: 60, guests: guestData, onChange: () => assert.fail("Render must not mutate guests") }));
    const values = [...html.matchAll(/data-slot="select-value"[^>]*>(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(values.slice(-4), keys.map(key => t(`cabinet.guests.${key}`, locale)));
    for (const status of statuses) assert.ok(!values.includes(status), `${status} raw value not shown`);
    assert.equal(JSON.stringify(guestData), snapshot);
  });
  test(`${locale}: home event date uses active language while preserving the calendar day`, () => {
    const html = render(locale, React.createElement(TestHeroCard, { plan, venueName: null, venueImage: "/test-image.webp", progressPct: 50, progressPrefix: "", progressSuffix: "" }));
    const expected = { ro: "20 septembrie 2026", ru: "20 сентября 2026", en: "20 September 2026" }[locale];
    assert.ok(html.includes(expected), expected);
    if (locale !== "ro") assert.ok(!html.includes("septembrie"));
    const withoutDate = render(locale, React.createElement(TestHeroCard, { plan: { ...plan, eventDate: null }, venueName: null, venueImage: "/test-image.webp", progressPct: 0, progressPrefix: "", progressSuffix: "" }));
    assert.ok(!withoutDate.includes("Invalid Date"));
    assert.equal(plan.eventDate, "2026-09-20");
  });
  test(`${locale}: older home messages use the same active date locale`, () => {
    const iso = "2025-05-15T12:00:00Z";
    const html = render(locale, React.createElement(TestBottomRow, { plan, conversations: [{ id: 1, vendorName: "QA vendor", lastMessageAt: iso, lastMessagePreview: "QA message", clientUnread: 0 }] }));
    const tag = { ro: "ro-MD", ru: "ru-RU", en: "en-GB" }[locale];
    assert.ok(html.includes(new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short" })));
  });
  test(`${locale}: plan venue/artist headings and booking dates use selected locale`, () => {
    const tag = { ro: "ro-MD", ru: "ru-RU", en: "en-GB" }[locale];
    const date = new Date("2026-09-20T00:00:00");
    const expectedLong = date.toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" });
    const venue = render(locale, React.createElement(planCompiled.exports.VenuesTab, { plan, bookings: [], onRefresh: noMutation }));
    assert.ok(venue.includes(expectedLong)); assert.ok(venue.includes("Bălți")); assert.ok(venue.includes("60"));
    const discovery = render(locale, React.createElement(planCompiled.exports.DiscoverySection, {
      plan, byCategory: [], loading: true, bookingByArtistId: new Map(), bookingsPerCategory: new Map(), blockedArtistIds: new Set(), categoryBlocker: new Map(), clientName: "QA", clientPhone: "", onRefresh: noMutation,
    }));
    assert.ok(discovery.includes(expectedLong));
    const booking = { id: 257, status: "declined", artistName: "QA artist", eventDate: "2026-09-20", categoryNames: [], artistId: 561 };
    const card = render(locale, React.createElement(planCompiled.exports.BookingListCard, { booking, onRefresh: noMutation }));
    assert.ok(card.includes(date.toLocaleDateString(tag)));
    const list = render(locale, React.createElement(planCompiled.exports.MyBookingsTab, { bookings: [{ ...booking, status: "confirmed_by_client" }] }));
    assert.ok(list.includes(date.toLocaleDateString(tag, { day: "numeric", month: "long" })));
  });
  test(`${locale}: Settings event type and server-provided category names are localized without changing IDs`, () => {
    const snapshot = JSON.stringify({ plan, categoryFixture });
    const html = render(locale, React.createElement(planCompiled.exports.SettingsTab, { plan, onUpdate: noMutation, onDelete: noMutation }));
    const values = [...html.matchAll(/data-slot="select-value"[^>]*>(.*?)<\/span>/g)].map(match => match[1]);
    assert.ok(values.includes(t("event_types.wedding", locale)));
    assert.ok(!values.includes("wedding"));
    for (const category of categoryFixture) {
      const name = locale === "ro" ? category.nameRo : locale === "ru" ? category.nameRu : category.nameEn;
      assert.ok(html.includes(name.replaceAll("&", "&amp;")), name);
      if (locale !== "ro") assert.ok(!html.includes(category.nameRo.replaceAll("&", "&amp;")));
    }
    assert.equal(JSON.stringify({ plan, categoryFixture }), snapshot);
  });
  test(`${locale}: opened calendar weekday abbreviations are already localized and protected from auto translation`, () => {
    const html = render(locale, React.createElement(calendarCompiled.exports.CustomCalendar, { value: new Date("2026-09-20T00:00:00"), onChange: noMutation }));
    const protectedDays = html.match(/<div class="grid grid-cols-7 mb-1" data-no-auto-translate="" translate="no">(.*?)<\/div><div class="grid grid-cols-7 gap-0\.5">/);
    assert.ok(protectedDays, "weekday grid excludes legacy/browser translation");
    for (let index = 0; index < 7; index++) assert.ok(protectedDays[1].includes(t(`calendar.days.${index}`, locale)));
    assert.ok(!protectedDays[1].includes(">You<"));
  });
  test(`${locale}: additional-partner buttons use current-language category fields after a pending request`, () => {
    const extraPlan = { ...plan, selectedCategories: [99] };
    const html = render(locale, React.createElement(planCompiled.exports.AllCategoriesBookedPanel, { plan: extraPlan, bookings: [{ id: 1, status: "pending" }] }));
    for (const category of categoryFixture) {
      const label = locale === "ro" ? category.nameRo : locale === "ru" ? category.nameRu : category.nameEn;
      assert.ok(html.includes(`+ ${label.replaceAll("&", "&amp;")}`), label);
      if (locale !== "ro") assert.ok(!html.includes(category.nameRo.replaceAll("&", "&amp;")));
    }
    assert.deepEqual(extraPlan.selectedCategories, [99]);
  });
  test(`${locale}: default event price labels translate but vendor custom package names remain literal`, () => {
    const tier = { pricingMode: "per_event", eventType: "wedding", nameRo: "Nuntă" };
    const expected = { ro: "Nuntă", ru: "Свадьба", en: "Wedding" }[locale];
    assert.equal(planCompiled.exports.eventRateLabel(tier, locale, "Per event"), expected);
    assert.equal(planCompiled.exports.eventRateLabel({ ...tier, nameRo: "Nuntă Premium · Signature 2026" }, locale, "Per event"), "Nuntă Premium · Signature 2026");
    assert.equal(planCompiled.exports.eventRateLabel({ ...tier, eventType: "corporate" }, locale, "Per event"), "Nuntă", "only defaults matching this tier's event type translate");
    assert.equal(planCompiled.exports.eventRateLabel({ ...tier, pricingMode: "per_hour" }, locale, "Per event"), "Nuntă");
    const { eventTypeLabel } = require("../src/lib/events/normalize");
    for (const [eventType, nameRo] of [["kids_birthday", "Zi de naștere pentru copii"], ["corporate", "Eveniment corporativ"], ["other", "Alt eveniment"]]) {
      assert.equal(planCompiled.exports.eventRateLabel({ ...tier, eventType, nameRo }, locale, "Per event"), eventTypeLabel(eventType, locale));
    }
    assert.equal(tier.nameRo, "Nuntă");
  });
}
test("display-only change keeps RSVP mutation values as database enums", () => {
  const source = readFileSync(path.join(root, "src/components/planner/guests-view.tsx"), "utf8");
  assert.match(source, /value=\{g\.rsvp\}/);
  assert.match(source, /onValueChange=\{\(v\) => updateRsvp\(g, v as Guest\["rsvp"\]\)\}/);
  assert.match(source, /body: JSON\.stringify\(\{ rsvp \}\)/);
  assert.match(homeSource, /DATE_LOCALES\[locale\]/);
  assert.doesNotMatch(planSource, /toLocaleDateString\(\s*"ro-(?:MD|RO)"/);
  assert.equal((planSource.match(/DATE_LOCALES\[locale\]/g) || []).length, 7);
  assert.match(planSource, /selectedCategories: selectedCategoryIds/);
  assert.match(planSource, /eventType: eventType \|\| null/);
  assert.match(planSource, /eventRateLabel\(resolvedForSelection\?\.tier, locale, t\("cabinet\.plan\.modal\.perEventPrice"\)\)/);
  assert.match(planSource, /eventRateLabel\(offer\.tier, locale, t\("cabinet\.plan\.modal\.perEventPrice"\)\)/);
  const legacy = readFileSync(path.join(root, "src/i18n/legacy-dom-translator.ts"), "utf8");
  assert.match(legacy, /element\.closest\("\[data-no-auto-translate\], \[translate='no'\]/);
});
