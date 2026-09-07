import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getPlannerTemplate, CATEGORY_LABELS } from "../src/lib/planner/templates";
import { CHECKLIST_TITLE_COPY, CHECKLIST_CATEGORY_COPY, checklistCategoryLabel, checklistDisplayTitle } from "../src/lib/planner/checklist-copy";
import { createChecklistWriteLock, optimisticChecklistChange, saveChecklistChange } from "../src/lib/planner/checklist-mutations";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecklistView } from "../src/components/planner/checklist-view";
import { LocaleProvider } from "../src/hooks/use-locale";
import { t } from "../src/i18n";

const eventTypes = ["wedding", "proposal", "cununie", "baptism", "cumatrie", "birthday", "kids_birthday", "corporate", "other"];

test("every canonical checklist title has complete RU/EN display copy and preserves RO", () => {
  const expected = new Set(eventTypes.flatMap(type => getPlannerTemplate(type).map(item => item.title)));
  assert.equal(expected.size, 87);
  assert.equal(CHECKLIST_TITLE_COPY.length, expected.size);
  assert.deepEqual(new Set(CHECKLIST_TITLE_COPY.map(copy => copy[0])), expected);
  for (const eventType of [...eventTypes, "concert", "unknown", null]) {
    getPlannerTemplate(eventType).forEach((template, sortOrder) => {
      const item = { ...template, sortOrder };
      assert.equal(checklistDisplayTitle(item, eventType, "ro"), template.title);
      for (const locale of ["ru", "en"]) {
        const translated = checklistDisplayTitle(item, eventType, locale);
        assert.notEqual(translated, template.title);
        assert.ok(translated.length > 3);
        assert.doesNotMatch(translated, /—/);
        if (locale === "ru") assert.match(translated, /[А-Яа-я]/);
      }
    });
  }
});

test("all category headings and options cover RO/RU/EN, unknown custom category stays literal", () => {
  for (const [category, ro] of Object.entries(CATEGORY_LABELS)) {
    assert.equal(checklistCategoryLabel(category, "ro"), ro);
    for (const locale of ["ru", "en"]) {
      assert.equal(checklistCategoryLabel(category, locale), CHECKLIST_CATEGORY_COPY[category][locale as "ru" | "en"]);
      assert.doesNotMatch(checklistCategoryLabel(category, locale), /—/);
    }
  }
  assert.equal(checklistCategoryLabel("other", "en"), "Other");
  assert.equal(checklistCategoryLabel("My custom category", "ru"), "My custom category");
  assert.equal(checklistCategoryLabel("constructor", "en"), "constructor");
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: actual initial checklist renders translated selected category and priority before popup options mount`, (context) => {
    // tsx uses classic JSX for the existing app modules; Next uses automatic
    // JSX. Supply only the test runtime binding, without changing app code.
    const runtime = globalThis as typeof globalThis & { React?: typeof React };
    const previous = runtime.React;
    runtime.React = React;
    context.after(() => { if (previous) runtime.React = previous; else Reflect.deleteProperty(runtime, "React"); });
    const html = renderToStaticMarkup(React.createElement(LocaleProvider, {
      initialLocale: locale,
      children: React.createElement(ChecklistView, { planId: 99, eventDate: null, eventType: "wedding", items: [], onChange: () => {} }),
    }));
    const visibleValues = [...html.matchAll(/data-slot="select-value"[^>]*>(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(visibleValues, [checklistCategoryLabel("logistics", locale), t("planner.checklist.priorityMedium", locale)]);
    assert.ok(!visibleValues.includes("logistics"));
    assert.ok(!visibleValues.includes("medium"));
  });
}

test("exact title/category/date/priority/sort identity is required; custom or edited tasks stay untouched", () => {
  const original = { ...getPlannerTemplate("wedding")[0], sortOrder: 0 };
  const custom = [
    { ...original, title: "My own wedding task" },
    { ...original, title: original.title + " " },
    { ...original, dueDaysBefore: null },
    { ...original, dueDaysBefore: 15 },
    { ...original, category: "other" },
    { ...original, priority: "low" as const },
    { ...original, sortOrder: 1 },
    { ...original, sortOrder: null },
    { ...original, sortOrder: -1 },
    { ...original, sortOrder: 0.5 },
  ];
  for (const item of custom) for (const locale of ["ro", "ru", "en"]) {
    assert.equal(checklistDisplayTitle(item, "wedding", locale), item.title);
  }
  assert.equal(checklistDisplayTitle(original, "birthday", "en"), original.title);
  const snapshot = JSON.stringify(original);
  checklistDisplayTitle(original, "wedding", "ru");
  assert.equal(JSON.stringify(original), snapshot);
});

test("ChecklistView and overview localize only presentation; CRUD retains raw custom titles", () => {
  const view = readFileSync("src/components/planner/checklist-view.tsx", "utf8");
  const overview = readFileSync("src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx", "utf8");
  assert.match(view, /checklistDisplayTitle\(item, eventType, locale\)/);
  assert.match(view, /eventTypeLabel\(eventTypeKey, locale\)/);
  assert.match(view, /checklistCategoryLabel\(category, locale\)/);
  assert.match(view, /checklistCategoryLabel\(k, locale\)/);
  assert.match(view, /\[items, locale\]/);
  assert.match(view, /byCategory: Record<string, ChecklistItem\[\]> = Object\.create\(null\)/);
  assert.match(view, /title: newTitle\.trim\(\)/);
  assert.match(overview, /checklistDisplayTitle\(item, plan\.eventType, locale\)/);
  const copy = readFileSync("src/lib/planner/checklist-copy.ts", "utf8");
  assert.doesNotMatch(copy, /fetch\(|@\/lib\/db|\.update\(|\.insert\(/);
  for (const path of ["src/app/api/event-plans/from-wizard/route.ts", "src/app/api/event-plans/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /title: item\.title/);
    assert.doesNotMatch(source, /checklistDisplayTitle/);
  }
});

test("checklist optimistic toggles/deletes roll back on HTTP errors and thrown network failures", async () => {
  const previous = [{ id: 1, done: false }, { id: 2, done: false }];
  for (const method of ["PATCH", "DELETE"] as const) {
    for (const request of [
      async () => new Response(null, { status: 500 }),
      async () => { throw new TypeError("Network unavailable"); },
    ]) {
      const next = method === "PATCH" ? [{ id: 1, done: true }, previous[1]] : [previous[1]];
      const values: typeof previous[] = [];
      let failures = 0;
      const ok = await optimisticChecklistChange(previous, next,
        () => saveChecklistChange("/api/event-plans/99/checklist/1", method, method === "PATCH" ? { done: true } : undefined, request as typeof fetch),
        value => values.push(value), () => { failures++; });
      assert.equal(ok, false);
      assert.deepEqual(values, [next, previous]);
      assert.equal(failures, 1);
    }
  }
});

test("successful optimistic save stays applied and sends only the intended mutation", async () => {
  const calls: unknown[] = [];
  const states: string[] = [];
  const request = async (url: unknown, options: unknown) => { calls.push({ url, options }); return new Response(null, { status: 204 }); };
  assert.equal(await optimisticChecklistChange("before", "after",
    () => saveChecklistChange("/api/event-plans/99/checklist/1", "PATCH", { done: true }, request as typeof fetch),
    value => states.push(value), () => assert.fail("Unexpected failure")), true);
  assert.deepEqual(states, ["after"]);
  assert.deepEqual(calls, [{ url: "/api/event-plans/99/checklist/1", options: { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"done":true}' } }]);
});

test("one synchronous write lock prevents duplicate/conflicting writes and all UI handlers release it", () => {
  const lock = createChecklistWriteLock();
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);
  lock.release();
  assert.equal(lock.acquire(), true);
  lock.release();
  const view = readFileSync("src/components/planner/checklist-view.tsx", "utf8");
  assert.equal((view.match(/if \(!writeLock\.current\.acquire\(\)\) return/g) ?? []).length, 4);
  assert.equal((view.match(/writeLock\.current\.release\(\)/g) ?? []).length, 4);
  assert.match(view, /catch \{\s*toast\.error\(t\("planner\.checklist\.addError"\)\)/);
  assert.match(view, /checked=\{item\.done\}\s*disabled=\{busy\}/);
  assert.match(view, /onClick=\{\(\) => deleteItem\(item\)\}\s*disabled=\{busy\}/);
});
