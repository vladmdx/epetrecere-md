import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "src/lib/db/migrations/manual/0034_notifications_calendar_security.sql";
const verifierPath = "scripts/notifications-security-migration-verify.ts";

test("0034 secures both private Data API tables and their sequences", () => {
  const source = readFileSync(migrationPath, "utf8");

  for (const object of [
    "public.notifications",
    "public.calendar_events",
    "notifications_id_seq",
    "calendar_events_id_seq",
  ]) {
    assert.ok(source.includes(object), `missing 0034 target: ${object}`);
  }
  assert.match(source, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(source, /SET LOCAL lock_timeout = '5s'/);
  assert.match(source, /LOCK TABLE public\.calendar_events, public\.notifications/);
  assert.match(source, /WITH RECURSIVE browser_role_tree/g);
  assert.match(source, /JOIN pg_auth_members AS membership/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(source, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE/);
  assert.match(source, /REVOKE ALL PRIVILEGES ON SEQUENCE/);
  assert.match(source, /FROM PUBLIC/);
  assert.match(source, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(source, /NO FORCE ROW LEVEL SECURITY/g);
  assert.match(source, /has_table_privilege/);
  assert.match(source, /has_column_privilege/);
  assert.match(source, /has_sequence_privilege/);
  assert.match(source, /0034 requires the canonical post-0033 database baseline/);
  assert.doesNotMatch(source, /\bGRANT\b/);
});

test("0034 verifier cannot connect before the guarded E2E runtime", () => {
  const source = readFileSync(verifierPath, "utf8");
  const runtimeGuard = source.indexOf('process.env.E2E_RUNTIME !== "1"');
  const configRead = source.indexOf("const config = e2eDatabaseConfig()");
  const markerCheck = source.indexOf("await verifyE2EDatabase(config)");
  const connection = source.indexOf("const sql = postgres(config.url");

  assert.ok(runtimeGuard >= 0, "missing direct-execution guard");
  assert.ok(configRead > runtimeGuard, "E2E config read must follow runtime guard");
  assert.ok(markerCheck > configRead, "marker check must follow local URL validation");
  assert.ok(connection > markerCheck, "DB connection must follow marker verification");
  assert.match(
    source,
    /0034 verification requires a genuine post-0033\/pre-0034 Supabase baseline/,
  );
  assert.match(source, /0034 second apply after ACL\/RLS drift/);
  assert.match(source, /epetrecere_0034_browser_grandparent/);
  assert.match(source, /privilegeViolations/);
});

test("0034 guarded and source-only package commands are documented", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    pkg.scripts?.["test:notifications:migration0034"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/notifications-security-migration-verify.ts",
  );
  assert.equal(
    pkg.scripts?.["test:notifications:migration0034-source"],
    "npx tsx --test scripts/notifications-security-migration-source.test.ts",
  );

  const readme = readFileSync("src/lib/db/migrations/README.md", "utf8");
  assert.match(readme, /0034_notifications_calendar_security\.sql/);
  assert.match(readme, /test:notifications:migration0034-source/);
  assert.match(readme, /test:notifications:migration0034/);
  assert.match(readme, /Preview, staging, or Production/);
});
