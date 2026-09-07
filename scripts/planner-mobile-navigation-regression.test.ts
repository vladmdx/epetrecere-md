import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import ro from "../src/i18n/ro.json";
import ru from "../src/i18n/ru.json";
import en from "../src/i18n/en.json";

const path = "src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx";
const text = readFileSync(path, "utf8");
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(source);
function initializer(name: string) {
  const declaration = nodes.find((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === name);
  assert.ok(declaration?.initializer);
  return declaration.initializer.getText(source);
}
const mobile = nodes.find((node): node is ts.JsxElement => ts.isJsxElement(node)
  && node.openingElement.attributes.getText(source).includes("md:hidden fixed bottom-0"));
assert.ok(mobile);

// Evaluate the production JSX and filtering expression with isolated React
// elements. No browser, network, accounts or database operations are needed.
function evaluate(expression: string, scope: Record<string, unknown>): unknown {
  const js = ts.transpileModule(`const result = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}; return result;`)(...Object.values(scope));
}
const icon = () => React.createElement("svg", { "aria-hidden": true });
const NAV_ITEMS = evaluate(initializer("NAV_ITEMS"), {
  LayoutDashboard: icon, MapPin: icon, BookOpen: icon, ClipboardList: icon,
  Users: icon, UtensilsCrossed: icon, Settings: icon,
});
type Button = React.ReactElement<{ onClick: () => void; "aria-current"?: string }>;
function render(locale: "ro" | "ru" | "en", flags = {
  venueNeeded: true, checklistEnabled: true, guestsEnabled: true, seatingEnabled: true,
}) {
  const visibleNavItems = evaluate(initializer("visibleNavItems"), { NAV_ITEMS, plan: flags });
  const clicked: string[] = [];
  const dictionary = { ro, ru, en }[locale];
  const t = (key: string) => key.split(".").reduce<unknown>((value, part) =>
    (value as Record<string, unknown>)?.[part], dictionary);
  const element = evaluate(mobile!.getText(source), {
    React, visibleNavItems, t, activeTab: "seating",
    setActiveTab: (tab: string) => clicked.push(tab),
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
  }) as React.ReactElement<{ children: React.ReactNode }>;
  return { element, clicked, buttons: React.Children.toArray(element.props.children) as Button[] };
}

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: every enabled planner tool remains reachable in the mobile navigation`, () => {
    const { element, clicked, buttons } = render(locale);
    assert.equal(buttons.length, 8);
    for (const button of buttons) button.props.onClick();
    assert.deepEqual(clicked, ["overview", "venues", "bookings", "my-bookings", "checklist", "guests", "seating", "settings"]);
    assert.deepEqual(buttons.filter(button => button.props["aria-current"] === "page"), [buttons[6]]);
    const html = renderToStaticMarkup(element);
    assert.ok(html.includes({ ro, ru, en }[locale].cabinet.plan.nav.seating));
    assert.ok(html.includes({ ro, ru, en }[locale].cabinet.plan.nav.settings));
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /md:hidden/);
    assert.doesNotMatch(html, /tabindex="-1"|disabled/);
  });
}

test("mobile tool visibility still respects the plan opt-ins and venue requirement", () => {
  const { buttons, clicked } = render("en", {
    venueNeeded: false, checklistEnabled: false, guestsEnabled: false, seatingEnabled: true,
  });
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(clicked, ["overview", "bookings", "my-bookings", "settings"]);
  assert.equal(buttons.length, 4);
  assert.match(text, /className="hidden md:flex w-48 shrink-0/);
  assert.doesNotMatch(mobile!.getText(source), /visibleNavItems\.slice/);
});
