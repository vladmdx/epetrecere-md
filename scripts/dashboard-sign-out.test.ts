import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { t } from "../src/i18n";
import { localizePath } from "../src/lib/i18n/routing";

const require = createRequire(import.meta.url);
const source = readFileSync("src/components/shared/dashboard-sign-out.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Element = { type: string; props: Record<string, any> };
function setup({ locale = "ro", loaded = true, sessionId = "session-demo", signOut = async (_options: unknown) => {} } = {}) {
  const states: unknown[] = [];
  let cursor = 0;
  const ref = { current: false };
  const exports: { DashboardSignOut?: () => Element } = {};
  const mocks: Record<string, unknown> = {
    "react": {
      useRef: () => ref,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => { states[index] = value; }];
      },
    },
    "@clerk/nextjs": { useClerk: () => ({ signOut }), useAuth: () => ({ isLoaded: loaded, sessionId }) },
    "lucide-react": { LogOut: () => null },
    "@/hooks/use-locale": { useLocale: () => ({ locale, t: (key: string) => t(key, locale as "ro" | "ru" | "en") }) },
    "@/lib/i18n/routing": { localizePath },
  };
  new Function("require", "exports", compiled)((id: string) => id in mocks ? mocks[id] : require(id), exports);
  return () => {
    cursor = 0;
    const tree = exports.DashboardSignOut!();
    const [button, alert] = tree.props.children as [Element, Element | false];
    return { button, alert };
  };
}

for (const locale of ["ro", "ru", "en"]) {
  test(`${locale}: logout ends only the active session and redirects to the localized homepage`, async () => {
    const calls: unknown[] = [];
    const render = setup({ locale, signOut: async (options) => { calls.push(options); } });
    const { button } = render();
    assert.equal(button.props.type, "button");
    assert.equal(button.props.disabled, false);
    assert.equal(button.props.children[1].props.children, t("header.signOut", locale as "ro" | "ru" | "en"));
    await button.props.onClick();
    assert.deepEqual(calls, [{ sessionId: "session-demo", redirectUrl: locale === "ro" ? "/" : `/${locale}` }]);
    assert.equal(render().alert, false);
  });
}

test("not loaded or missing session disables logout and never calls Clerk", async () => {
  for (const options of [{ loaded: false }, { sessionId: "" }]) {
    const { button } = setup({ ...options, signOut: async () => assert.fail("must not call signOut") })();
    assert.equal(button.props.disabled, true);
    await button.props.onClick();
  }
});

test("pending logout is disabled, concurrent clicks dedupe, failure is announced and retry works", async () => {
  let calls = 0;
  let reject!: (reason: Error) => void;
  const render = setup({ signOut: async () => {
    calls++;
    if (calls === 1) await new Promise<void>((_resolve, fail) => { reject = fail; });
  } });
  const first = render().button.props.onClick();
  assert.equal(render().button.props.disabled, true);
  assert.equal(render().button.props["aria-busy"], true);
  await render().button.props.onClick();
  assert.equal(calls, 1);
  reject(new Error("network failure"));
  await first;
  const after = render();
  assert.equal(after.button.props.disabled, false);
  assert.ok(after.alert);
  assert.equal(after.alert.props.role, "alert");
  await after.button.props.onClick();
  assert.equal(calls, 2);
  assert.equal(render().alert, false);
});

test("partner and venue sidebars expose logout in both desktop and mobile footers", () => {
  for (const name of ["vendor", "venue"]) {
    const sidebar = readFileSync(`src/components/vendor/${name}-sidebar.tsx`, "utf8");
    const [desktop, mobile] = sidebar.split("{/* Mobile drawer */}");
    for (const section of [desktop, mobile]) {
      assert.equal((section.match(/<DashboardSignOut \/>/g) ?? []).length, 1);
      assert.match(section, /className="shrink-0 border-t/);
    }
  }
});
