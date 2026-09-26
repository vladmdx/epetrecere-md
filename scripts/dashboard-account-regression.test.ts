import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { dashboardAccountLinks } from "../src/lib/dashboard-account-links";
import { localizePath } from "../src/lib/i18n/routing";

test("account settings follow client, admin, partner and explicit venue contexts in all languages", () => {
  for (const locale of ["ro", "ru", "en"] as const) {
    for (const [path, settings, profile] of [
      ["/cabinet", "/cabinet/setari", "/cabinet/profil"],
      ["/cabinet/rezervari", "/cabinet/setari", "/cabinet/profil"],
      ["/admin/cereri-inregistrare", "/admin/setari", null],
      ["/dashboard/profil", "/dashboard/setari", null],
      ["/dashboard/locatii", "/dashboard/setari", null],
      ["/dashboard/locatii/31/sali", "/dashboard/locatii/31/setari", null],
      ["/dashboard/locatii/30", "/dashboard/locatii/30/setari", null],
      ["/dashboard/sala/calendar", "/dashboard/sala/setari", null],
    ] as const) {
      assert.deepEqual(dashboardAccountLinks(localizePath(path, locale)), { settings, profile });
    }
  }
  for (const path of ["/dashboard/locatii/31fake", "/dashboard/locatii/0", "/dashboard/locatii/new"]) {
    assert.equal(dashboardAccountLinks(path).settings, "/dashboard/setari");
  }
});

test("all dashboard shells share the account menu; small screens keep a compact language switch", () => {
  for (const path of [
    "src/components/vendor/vendor-layout-chrome.tsx",
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/layout.tsx",
    "src/app/[locale]/(admin)/admin/layout.tsx",
    "src/app/[locale]/(client)/cabinet/layout.tsx",
  ]) assert.match(readFileSync(path, "utf8"), /<AdminTopbar\s*\/>/);
  const bar = readFileSync("src/components/admin/admin-topbar.tsx", "utf8");
  assert.match(bar, /<DashboardAccountMenu\s*\/>/);
  assert.match(bar, /<LanguageSwitcher compactOnMobile/);
  const menu = readFileSync("src/components/shared/dashboard-account-menu.tsx", "utf8");
  assert.match(menu, /<DashboardSignOut\s*\/>/);
  assert.match(menu, /<PopoverContent align="end"/);
  assert.match(menu, /openUserProfile\(\)/);
  assert.match(menu, /disabled=\{!isLoaded \|\| !isSignedIn\}/);
});

type Element = { type: string; props: { children?: Element | Element[]; onClick?: () => Promise<void>; disabled?: boolean; [key: string]: unknown } };
function signOutHarness(options: { loaded?: boolean; sessionId?: string | null; reject?: boolean } = {}) {
  const calls: unknown[] = [];
  const stateUpdates: unknown[] = [];
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const exports: { DashboardSignOut?: () => Element } = {};
  const compiled = ts.transpileModule(readFileSync("src/components/shared/dashboard-sign-out.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require(id: string) {
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "react") return { useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => [initial, (next: unknown) => stateUpdates.push(next)] };
    if (id === "@clerk/nextjs") return {
      useAuth: () => ({ isLoaded: options.loaded ?? true, sessionId: options.sessionId === undefined ? "session-demo" : options.sessionId }),
      useClerk: () => ({ signOut: async (args: unknown) => { calls.push(args); await pending; if (options.reject) throw new Error("offline"); } }),
    };
    if (id.endsWith("use-locale")) return { useLocale: () => ({ locale: "ru", t: (key: string) => key }) };
    if (id.endsWith("i18n/routing")) return { localizePath };
    if (id === "lucide-react") return { LogOut: "icon" };
    throw new Error(id);
  } });
  const element = exports.DashboardSignOut!();
  const button = (element.props.children as Element[])[0];
  return { click: button.props.onClick!, disabled: button.props.disabled, calls, stateUpdates, finish };
}

test("logout revokes only the current session and preserves locale; duplicate clicks ignored", async () => {
  const h = signOutHarness();
  const first = h.click();
  await h.click();
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.stringify(h.calls[0]), JSON.stringify({ sessionId: "session-demo", redirectUrl: "/ru" }));
  h.finish();
  await first;
});

test("logout remains disabled before auth loads or without a session", async () => {
  for (const options of [{ loaded: false }, { sessionId: null }]) {
    const h = signOutHarness(options);
    assert.equal(h.disabled, true);
    await h.click();
    assert.equal(h.calls.length, 0);
  }
});

test("failed logout unlocks retry and reports failure without an unhandled rejection", async () => {
  const h = signOutHarness({ reject: true });
  const first = h.click();
  h.finish();
  await first;
  assert.deepEqual(h.stateUpdates.slice(-3), [false, true, false]);
  await h.click();
  assert.equal(h.calls.length, 2);
});

test("venue registry is bounded, read-only, cancellable and distinct from pending approval", () => {
  const source = readFileSync("src/components/admin/registered-venues-overview.tsx", "utf8");
  assert.match(source, /const limit = 20/);
  assert.match(source, /\/api\/admin\/venues\?page=\$\{page\}&limit=\$\{limit\}/);
  assert.match(source, /controller.abort\(\)/);
  assert.match(source, /controller.signal.aborted/);
  assert.match(source, /role="alert"/);
  assert.match(source, /\/admin\/sali\/\$\{venue.id\}/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|DELETE)|registration-requests/);
  const queue = readFileSync("src/app/[locale]/(admin)/admin/cereri-inregistrare/page.tsx", "utf8");
  assert.match(queue, /<RegisteredVenuesOverview\s*\/>/);
});
