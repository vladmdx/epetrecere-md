import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { beginWizardSubmission, clearWizardSubmission, hasPendingWizardSubmission, submitPendingWizard, wizardSubmissionKeys } from "../src/lib/wizard/submission";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const draft = { name: "QA Test Nuntă Bălți", eventType: "wedding", eventDate: "2026-09-20", startTime: "14:00", durationHours: 10, guestCount: 60, services: ["foto-video"] };
const response = (id: number) => new Response(JSON.stringify({ plan: { id } }), { status: 201 });

test("legacy wizard data and a completed cached plan do not constitute submit intent on sign-in", async () => {
  const s = storage();
  s.setItem("wizard-data", JSON.stringify(draft));
  s.setItem("wizard-plan-id", "99");
  assert.equal(hasPendingWizardSubmission("client", false, s), false);
  assert.equal(await submitPendingWizard("client", false, s, (async () => { throw new Error("must not POST"); }) as typeof fetch), null);
  assert.equal(s.getItem("wizard-data"), JSON.stringify(draft), "unsubmitted draft remains recoverable");
});

test("StrictMode and parallel auth/results effects share one in-flight POST", async () => {
  const s = storage();
  beginWizardSubmission(draft, null, false, s);
  let calls = 0;
  const fetcher = (async () => { calls++; await Promise.resolve(); return response(99); }) as typeof fetch;
  const ids = await Promise.all([submitPendingWizard("client", false, s, fetcher), submitPendingWizard("client", false, s, fetcher)]);
  assert.deepEqual(ids, [99, 99]);
  assert.equal(calls, 1);
  assert.equal(s.getItem("wizard-data"), null);
  assert.equal(s.getItem("wizard-plan-id"), "99");
  assert.equal(hasPendingWizardSubmission("client", false, s), false, "relogin will not replay a completed submission");
  assert.equal(await submitPendingWizard("client", false, s, fetcher), 99);
  assert.equal(calls, 1);
});

test("a lost response retains the stable idempotency key for a safe server replay", async () => {
  const s = storage();
  const original = beginWizardSubmission(draft, "client", false, s);
  const keys: string[] = [];
  let attempts = 0;
  const fetcher = (async (_url, init) => {
    keys.push(JSON.parse(String(init?.body)).submissionId);
    if (++attempts === 1) throw new Error("network lost after server commit");
    return response(99);
  }) as typeof fetch;
  await assert.rejects(submitPendingWizard("client", false, s, fetcher));
  assert.equal(hasPendingWizardSubmission("client", false, s), true);
  assert.equal(s.getItem("wizard-data"), JSON.stringify(draft));
  assert.equal(beginWizardSubmission(draft, "client", false, s).id, original.id);
  assert.equal(await submitPendingWizard("client", false, s, fetcher), 99);
  assert.deepEqual(keys, [original.id, original.id]);
});

test("rate limits and malformed responses do not erase the intended draft", async () => {
  for (const res of [new Response("{}", { status: 429 }), new Response("{}", { status: 200 })]) {
    const s = storage();
    beginWizardSubmission(draft, "client", false, s);
    await assert.rejects(submitPendingWizard("client", false, s, (async () => res) as typeof fetch));
    assert.equal(hasPendingWizardSubmission("client", false, s), true);
    assert.equal(s.getItem("wizard-data"), JSON.stringify(draft));
  }
});

test("switching accounts cannot consume another client's pending submission", async () => {
  const s = storage();
  beginWizardSubmission(draft, "client-a", false, s);
  assert.equal(hasPendingWizardSubmission("client-b", false, s), false);
  assert.equal(await submitPendingWizard("client-b", false, s, (async () => { throw new Error("must not POST"); }) as typeof fetch), null);
  assert.equal(hasPendingWizardSubmission("client-a", false, s), true);
});

test("completing an older request does not erase a newer edited draft", async () => {
  const s = storage();
  beginWizardSubmission(draft, "client", false, s);
  let finish!: (value: Response) => void;
  const pending = submitPendingWizard("client", false, s, (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch);
  const changed = { ...draft, name: "A different explicit event" };
  const newer = beginWizardSubmission(changed, "client", false, s);
  finish(response(99));
  await pending;
  assert.equal(s.getItem("wizard-data"), JSON.stringify(changed));
  assert.equal(JSON.parse(s.getItem("wizard-submission")!).id, newer.id);
  assert.equal(hasPendingWizardSubmission("client", false, s), true);
});

test("starting a new event creates new intent, while admin and client submissions stay separate", () => {
  const s = storage();
  const first = beginWizardSubmission(draft, "client", false, s);
  const admin = beginWizardSubmission(draft, "admin", true, s);
  assert.notEqual(first.id, admin.id);
  clearWizardSubmission(false, s);
  assert.equal(hasPendingWizardSubmission("admin", true, s), true);
  assert.notEqual(beginWizardSubmission(draft, "client", false, s).id, first.id);
  assert.equal(wizardSubmissionKeys(true).submission, "admin-wizard-submission");
});

test("admin results keep their questionnaire but replay the same completed plan", async () => {
  const s = storage();
  beginWizardSubmission(draft, "admin", true, s);
  let calls = 0;
  const fetcher = (async () => { calls++; return response(99); }) as typeof fetch;
  assert.equal(await submitPendingWizard("admin", true, s, fetcher), 99);
  assert.equal(s.getItem("admin-wizard-data"), JSON.stringify(draft));
  assert.equal(await submitPendingWizard("admin", true, s, fetcher), 99);
  assert.equal(calls, 1);
});

test("all materialization callers use the shared explicit submission protocol", () => {
  const auth = readFileSync("src/app/[locale]/(auth)/auth-redirect/page.tsx", "utf8");
  assert.match(auth, /if \(!hasPendingWizardSubmission\(ownerId\)\) return null/);
  assert.doesNotMatch(auth, /fetch\("\/api\/event-plans\/from-wizard"/);
  const wizard = readFileSync("src/app/[locale]/(public)/planifica/client.tsx", "utf8");
  assert.match(wizard, /beginWizardSubmission\(data, user\?\.id \?\? null, adminMode\)/);
  assert.match(wizard, /if \(!draftRestored\) return/);
  const results = readFileSync("src/app/[locale]/(public)/planifica/rezultate/client.tsx", "utf8");
  assert.match(results, /submitPendingWizard\(user\.id, adminMode\)/);
  assert.doesNotMatch(results, /fetch\("\/api\/event-plans\/from-wizard"/);
});

test("server replay is owner-scoped, hash-checked and transactional before the weekly limit", () => {
  const route = readFileSync("src/app/api/event-plans/from-wizard/route.ts", "utf8");
  assert.match(route, /return db\.transaction\(async \(tx\) =>/);
  assert.match(route, /where\(eq\(users\.id, auth\.userId\)\)\.for\("update"\)/);
  assert.match(route, /eq\(eventPlans\.userId, auth\.userId\), eq\(eventPlans\.wizardSubmissionId, submissionId\)/);
  assert.match(route, /existing\.wizardSubmissionHash !== submissionHash/);
  assert.ok(route.indexOf("if (existing)") < route.indexOf("const sevenDaysAgo"));
  assert.match(route, /await tx\.insert\(checklistItems\)/);
  const sql = readFileSync("supabase/migrations/20260907161706_wizard_submission_idempotency.sql", "utf8");
  assert.match(sql, /create unique index if not exists event_plans_user_wizard_submission_uidx/);
  assert.match(sql, /\(user_id, wizard_submission_id\)/);
  assert.doesNotMatch(sql, /drop|delete|update\s/i);
});
