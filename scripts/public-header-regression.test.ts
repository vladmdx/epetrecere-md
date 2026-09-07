import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isClientOrGuest } from "../src/hooks/use-user-role";

const header = readFileSync("src/components/public/header.tsx", "utf8");
const language = readFileSync("src/components/shared/language-switcher.tsx", "utf8");

const roles = {
  guest: null,
  client: { role: "user", hasVenue: false, isNewUser: false },
  artist: { role: "artist", hasVenue: false, isNewUser: false },
  venue: { role: "user", hasVenue: true, isNewUser: false },
  admin: { role: "admin", hasVenue: false, isNewUser: false },
  superAdmin: { role: "super_admin", hasVenue: false, isNewUser: false },
};

// These are the explicit Tailwind dimensions asserted below, not a substitute
// for the root agent's live browser bounding-box/touch verification.
for (const width of [320, 390, 430]) {
  for (const [role, state] of Object.entries(roles)) {
    test(`${width}px ${role}: declared header width budget fits without shrinking actions`, () => {
      const logo = width >= 430 ? 168 : width >= 375 ? 144 : 120;
      const actions = isClientOrGuest(state) ? 4 : 3;
      const actionWidth = actions * 36 + (actions - 1) * 2;
      const horizontalPadding = 24;
      const logoActionGap = 8;
      assert.ok(logo + actionWidth + horizontalPadding + logoActionGap <= width);
    });
  }
}

test("layout uses the tested mobile dimensions and keeps essential actions available", () => {
  assert.match(header, /data-header-bar[^\n]*gap-2 px-3/);
  assert.match(header, /data-header-actions[^\n]*shrink-0[^\n]*gap-0\.5/);
  assert.match(header, /w-\[120px\].*min-\[375px\]:w-\[144px\].*min-\[430px\]:w-\[168px\]/);
  assert.match(header, /h-9 w-9 rounded-full bg-gold/);
  assert.match(header, /hidden whitespace-nowrap text-sm font-semibold md:inline/);
  assert.match(header, /<LanguageSwitcher compactOnMobile\s*\/>/);
  assert.match(header, /<UserMenu\s*\/>/);
  assert.match(header, /className="h-9 w-9[^\n]*xl:hidden"/);
});

test("messages and notifications remain reachable inside the mobile menu without duplicate bell instances", () => {
  assert.match(header, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(header, /\{wideActions && <>\s*<ChatBell\s*\/><NotificationBell\s*\/><\/>\}/);
  assert.match(header, /\{!wideActions && isSignedIn && \(/);
  const mobile = header.slice(header.indexOf("data-mobile-communications"));
  assert.match(mobile, /t\("chat\.bell\.title"\)/);
  assert.match(mobile, /<ChatBell\s*\/>/);
  assert.match(mobile, /t\("notifications\.title"\)/);
  assert.match(mobile, /<NotificationBell\s*\/>/);
  assert.match(header, /100dvh-4rem/);
  assert.equal(header.match(/<ChatBell\s*\/>/g)?.length, 2);
  assert.equal(header.match(/<NotificationBell\s*\/>/g)?.length, 2);
});

test("closed mobile menu keeps bell polling mounted but cannot leak focus or fixed popovers", () => {
  assert.match(header, /data-mobile-nav/);
  assert.doesNotMatch(header, /\{mobileOpen\s*&&/);
  assert.match(header, /aria-hidden=\{!mobileOpen\}/);
  assert.match(header, /inert=\{!mobileOpen\}/);
  assert.match(header, /mobileOpen \? "visible border-t" : "invisible pointer-events-none"/);
  assert.match(header, /height: mobileOpen \? "auto" : 0/);
  // Both bell effects own their polling lifecycle, so they must remain in
  // this persistent subtree, not behind the menu's open state.
  for (const file of ["chat-bell", "notification-bell"]) {
    const source = readFileSync(`src/components/public/${file}.tsx`, "utf8");
    assert.match(source, /setInterval\(/);
    assert.match(source, /clearInterval\(/);
  }
});

test("compact language picker retains full accessible language name and dropdown options", () => {
  assert.match(language, /compactOnMobile = false/);
  assert.match(language, /compactOnMobile && "h-9 w-9 gap-0 p-0/);
  assert.match(language, /compactOnMobile && "hidden sm:inline"/);
  assert.match(language, /aria-label=\{`\$\{t\("a11y\.currentLanguage"\)\}: \$\{localeNames\[locale\]\}`\}/);
  assert.match(language, /locales\.map\(/);
});

test("signed-in account dropdown works with touch and keyboard, not hover alone", () => {
  assert.match(header, /aria-label=\{t\("header\.myAccount"\)\} aria-expanded=\{open\} aria-controls=\{menuId\}/);
  assert.match(header, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
  assert.match(header, /event\.key === "Escape"/);
  assert.match(header, /document\.addEventListener\("pointerdown", dismissOutside\)/);
  assert.match(header, /menuRef\.current\?\.contains\(event\.target as Node\)/);
});

test("actual account handlers: first desktop click opens, pointer gap does not close, second click and Escape close", () => {
  const source = ts.createSourceFile("header.tsx", header, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const userMenu = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "UserMenu");
  assert.ok(userMenu);
  const openings: ts.JsxOpeningElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node)) openings.push(node);
    ts.forEachChild(node, visit);
  }
  visit(userMenu);
  const attributes = (node: ts.JsxOpeningElement) => node.attributes.properties.filter(ts.isJsxAttribute);
  const accountRoot = openings.find((node) => attributes(node).some((attr) => attr.name.getText(source) === "ref" && attr.initializer?.getText(source) === "{menuRef}"));
  const accountButton = openings.find((node) => attributes(node).some((attr) => attr.name.getText(source) === "aria-label" && attr.initializer?.getText(source).includes("header.myAccount")));
  assert.ok(accountRoot && accountButton);
  const callback = (node: ts.JsxOpeningElement, name: string) => {
    const attr = attributes(node).find((item) => item.name.getText(source) === name);
    return attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression?.getText(source) : undefined;
  };
  assert.equal(callback(accountRoot, "onPointerEnter"), undefined);
  assert.equal(callback(accountRoot, "onPointerLeave"), undefined);
  assert.equal(callback(accountRoot, "onMouseEnter"), undefined);
  assert.equal(callback(accountRoot, "onMouseLeave"), undefined);
  let open = false;
  const setOpen = (value: boolean | ((previous: boolean) => boolean)) => { open = typeof value === "function" ? value(open) : value; };
  const click = new Function("setOpen", `return ${callback(accountButton, "onClick")};`)(setOpen) as () => void;
  const keydown = new Function("setOpen", `return ${callback(accountRoot, "onKeyDown")};`)(setOpen) as (event: { key: string }) => void;
  click();
  assert.equal(open, true);
  // No hover handler can invert this state before the first click or close
  // the menu while the pointer travels through its visual spacing.
  click();
  assert.equal(open, false);
  click();
  keydown({ key: "Tab" });
  assert.equal(open, true);
  keydown({ key: "Escape" });
  assert.equal(open, false);
});
