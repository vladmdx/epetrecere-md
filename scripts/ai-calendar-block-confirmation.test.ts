import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasExplicitAiCalendarBlockConfirmation } from "../src/lib/booking/ai-calendar-confirmation";

const range = { fromDate: "2026-10-01", toDate: "2026-10-03" };

const proposals = {
  ro: "Vrei să blochez calendarul în intervalul 2026-10-01–2026-10-03? Confirmi?",
  en: "Should I block the calendar from 2026-10-01 through 2026-10-03? Please confirm.",
  ru: "Подтвердите: можно заблокировать календарь с 2026-10-01 по 2026-10-03?",
} as const;

test("accepts standalone RO, EN and RU confirmation for the adjacent exact range", () => {
  for (const [language, proposal, approval] of [
    ["ro", proposals.ro, "Da, confirm"],
    ["en", proposals.en, "Yes, block those dates"],
    ["ru", proposals.ru, "Да, подтверждаю"],
  ] as const) {
    assert.equal(
      hasExplicitAiCalendarBlockConfirmation([
        { role: "assistant", content: proposal },
        { role: "user", content: approval },
      ], range),
      true,
      language,
    );
  }
});

test("rejects negative, ambiguous and compound answers in RO, EN and RU", () => {
  for (const approval of [
    "Nu bloca",
    "Da, dar nu încă",
    "Poate",
    "Yes, but use another date",
    "Yes, do not block it",
    "Maybe",
    "Нет, не блокируй",
    "Да, но сначала измени даты",
    "Возможно",
  ]) {
    assert.equal(
      hasExplicitAiCalendarBlockConfirmation([
        { role: "assistant", content: proposals.ro },
        { role: "user", content: approval },
      ], range),
      false,
      approval,
    );
  }
});

test("rejects stale, non-adjacent and range-mismatched approvals", () => {
  assert.equal(
    hasExplicitAiCalendarBlockConfirmation([
      { role: "assistant", content: proposals.ro },
      { role: "user", content: "Da" },
      { role: "assistant", content: "Mai verific ceva." },
      { role: "user", content: "Confirm" },
    ], range),
    false,
  );
  assert.equal(
    hasExplicitAiCalendarBlockConfirmation([
      { role: "assistant", content: proposals.ro },
      { role: "user", content: "Da" },
    ], { fromDate: "2026-10-01", toDate: "2026-10-04" }),
    false,
  );
  assert.equal(
    hasExplicitAiCalendarBlockConfirmation([
      { role: "user", content: "Blochează 2026-10-01–2026-10-03" },
      { role: "user", content: "Da" },
    ], range),
    false,
  );
});

test("rejects unblock proposals in RO, EN and RU even when they contain block substrings", () => {
  for (const proposal of [
    "Vrei să deblochez calendarul în intervalul 2026-10-01–2026-10-03? Confirmi?",
    "Should I unblock the calendar from 2026-10-01 through 2026-10-03? Please confirm.",
    "Подтвердите: можно разблокировать календарь с 2026-10-01 по 2026-10-03?",
  ]) {
    assert.equal(
      hasExplicitAiCalendarBlockConfirmation([
        { role: "assistant", content: proposal },
        { role: "user", content: "Confirm" },
      ], range),
      false,
      proposal,
    );
  }
});

test("rejects any additional or alternative ISO date in RO, EN and RU", () => {
  for (const proposal of [
    "Vrei să blochez 2026-10-01–2026-10-03 sau 2026-10-04? Confirmi?",
    "Should I block 2026-10-01 through 2026-10-03 (instead of 2026-10-02)? Confirm?",
    "Подтвердите блокировку 2026-10-01–2026-10-03; альтернатива 2026-10-05.",
  ]) {
    assert.equal(
      hasExplicitAiCalendarBlockConfirmation([
        { role: "assistant", content: proposal },
        { role: "user", content: "Confirm" },
      ], range),
      false,
      proposal,
    );
  }
});

test("requires one canonical date for a same-day block and valid ordered dates", () => {
  const sameDay = { fromDate: "2026-10-01", toDate: "2026-10-01" };
  assert.equal(hasExplicitAiCalendarBlockConfirmation([
    {
      role: "assistant",
      content: "Vrei să blochez calendarul pe 2026-10-01? Confirmi?",
    },
    { role: "user", content: "Da, confirm" },
  ], sameDay), true);
  assert.equal(hasExplicitAiCalendarBlockConfirmation([
    {
      role: "assistant",
      content: "Vrei să blochez de la 2026-10-01 la 2026-10-01? Confirmi?",
    },
    { role: "user", content: "Da, confirm" },
  ], sameDay), false);
  assert.equal(hasExplicitAiCalendarBlockConfirmation([
    { role: "assistant", content: proposals.ro },
    { role: "user", content: "Da" },
  ], { fromDate: "2026-02-30", toDate: "2026-03-01" }), false);
  assert.equal(hasExplicitAiCalendarBlockConfirmation([
    { role: "assistant", content: proposals.ro },
    { role: "user", content: "Da" },
  ], { fromDate: "2026-10-03", toDate: "2026-10-01" }), false);
});

test("venue assistant checks the server guard before the calendar writer", () => {
  const route = readFileSync(
    new URL("../src/app/api/ai/venue-assistant/route.ts", import.meta.url),
    "utf8",
  );
  const toolStart = route.indexOf('toolUse.name === "block_calendar_days"');
  const nextTool = route.indexOf('toolUse.name === "recent_reviews"', toolStart);
  const body = route.slice(toolStart, nextTool);
  const guard = body.indexOf("hasExplicitAiCalendarBlockConfirmation");
  const write = body.indexOf("bulkSetCalendarEvents");
  assert.ok(guard >= 0 && guard < write);
  assert.match(body, /EXPLICIT_CONFIRMATION_REQUIRED/);
});
