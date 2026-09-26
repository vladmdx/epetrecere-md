import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { venueApprovalNotice } from "../src/lib/partner/approval-notice";
import { registrationStatusEmail } from "../src/lib/email/templates/registration-status";

test("approval describes actual approved and pending hall counts", () => {
  for (const active of [true, false]) {
    const two = venueApprovalNotice(active, 2, 0);
    assert.match(two.message, /2 săli/);
    assert.doesNotMatch(two.title + two.message, /prima|în verificare/);
    assert.match(venueApprovalNotice(active, 1, 1).message, /O sală.*O altă sală/);
    assert.match(venueApprovalNotice(active, 1, 2).message, /Alte 2 săli/);
  }
  const decision = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  assert.match(decision, /venueApprovalNotice\(venueBecameActive, reviewedHallIds.length, remainingPendingHallCount\)/);
});

test("email does not invent pending halls and uses singular correctly", () => {
  const base = { name: "DEMO", type: "venue" as const, approved: true, hallDecision: true };
  assert.doesNotMatch(registrationStatusEmail({ ...base, remainingPendingHallCount: 0 }), /rămân în verificare/);
  assert.match(registrationStatusEmail({ ...base, remainingPendingHallCount: 1 }), /O altă sală rămâne/);
});

test("generic settings distinguish selection, absence and errors without guessing a venue", () => {
  const source = readFileSync("src/app/[locale]/(vendor)/dashboard/setari/page.tsx", "utf8");
  assert.match(source, /json.code === "VENUE_REQUIRED"/);
  assert.match(source, /setChooseVenue\(true\)/);
  assert.match(source, /href="\/dashboard\/locatii"/);
  assert.match(source, /router.replace\(localizePath\(`\/dashboard\/locatii\/\$\{json.venue.id\}\/setari`, locale\)\)/);
  assert.match(source, /catch \{\s*if \(!cancelled\) \{\s*setLoadError\(true\)/);
  assert.doesNotMatch(source, /venueIds\[0\]/);
});

test("mobile venue picker constrains intrinsic grid widths and stacks the status", () => {
  const source = readFileSync("src/app/[locale]/(vendor)/dashboard/locatii/page.tsx", "utf8");
  assert.match(source, /grid grid-cols-1 gap-3/);
  assert.match(source, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(source, /sm:col-start-3/);
  const settings = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/setari/client.tsx", "utf8");
  assert.match(settings, /flex flex-col items-start gap-3.*sm:flex-row/);
  assert.match(settings, /min-h-10 rounded-md/);
});

function loaderHarness() {
  const scripts: Array<{ onerror?: () => void; remove: () => void; removed?: boolean }> = [];
  const timers = new Map<number, () => void>();
  let seq = 0;
  const window: Record<string, unknown> = {
    setTimeout: (fn: () => void) => { timers.set(++seq, fn); return seq; },
    clearTimeout: (id: number) => timers.delete(id),
  };
  const exports: Record<string, unknown> = {};
  const context = vm.createContext({ window, exports, URLSearchParams, console: { error() {} },
    document: {
      createElement: () => ({ remove() { this.removed = true; }, removed: false }),
      head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
    },
  });
  vm.runInContext(ts.transpileModule(readFileSync("src/lib/geo/google-maps-loader.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { window, scripts, timers, api: exports as unknown as typeof import("../src/lib/geo/google-maps-loader") };
}

test("one script shared by concurrent loads and cleaned timeout on success", async () => {
  const h = loaderHarness();
  const first = h.api.loadGoogleMaps("test", "ro");
  assert.equal(h.api.loadGoogleMaps("test", "ro"), first);
  assert.equal(h.scripts.length, 1);
  const maps = {};
  h.window.google = { maps };
  (h.window.__epGoogleMapsReady as () => void)();
  assert.equal(await first, maps);
  assert.equal(h.timers.size, 0);
});

test("auth/billing failure after successful load still notifies renderer and future mounts", async () => {
  const h = loaderHarness();
  let notified = 0;
  let previous = 0;
  h.window.gm_authFailure = () => previous++;
  const unsubscribe = h.api.subscribeGoogleMapsFailure(() => notified++);
  const pending = h.api.loadGoogleMaps("test", "ro");
  h.window.google = { maps: {} };
  (h.window.__epGoogleMapsReady as () => void)();
  await pending;
  (h.window.gm_authFailure as () => void)();
  assert.equal(notified, 1);
  assert.equal(previous, 1);
  unsubscribe();
  (h.window.gm_authFailure as () => void)();
  assert.equal(notified, 1);
  const stop = h.api.subscribeGoogleMapsFailure(() => notified++);
  assert.equal(notified, 2);
  stop();
  await assert.rejects(h.api.loadGoogleMaps("test", "ro"), /authorization failed/);
});

test("auth failure before callback rejects pending load", async () => {
  const h = loaderHarness();
  const pending = h.api.loadGoogleMaps("test", "ro");
  (h.window.gm_authFailure as () => void)();
  await assert.rejects(pending, /authorization failed/);
  assert.equal(h.timers.size, 0);
  assert.equal(h.scripts[0].removed, true);
});

for (const failure of ["network", "timeout"]) {
  test(`${failure} failure rejects and permits a fresh load`, async () => {
    const h = loaderHarness();
    const pending = h.api.loadGoogleMaps("test", "ro");
    if (failure === "network") h.scripts[0].onerror?.();
    else [...h.timers.values()][0]();
    await assert.rejects(pending);
    assert.equal(h.scripts[0].removed, true);
    assert.equal(h.timers.size, 0);
    const retry = h.api.loadGoogleMaps("test", "ro");
    h.window.google = { maps: {} };
    (h.window.__epGoogleMapsReady as () => void)();
    await retry;
    assert.equal(h.scripts.length, 2);
  });
}

test("renderer subscribes beyond initial load and parent keeps Leaflet fallback", () => {
  const renderer = readFileSync("src/components/public/venues-map-google.tsx", "utf8");
  assert.match(renderer, /subscribeGoogleMapsFailure\(unavailable\)/);
  assert.match(renderer, /cancelled = true;\s*unsubscribe\(\)/);
  const parent = readFileSync("src/components/public/venues-map.tsx", "utf8");
  assert.match(parent, /process.env.NEXT_PUBLIC_VENUE_MAP_PROVIDER === "google"/);
  assert.match(parent, /USE_GOOGLE && GOOGLE_KEY && !googleFailed/);
  assert.match(parent, /<LeafletMap venues=\{venues\} labels=\{labels\}/);
});
