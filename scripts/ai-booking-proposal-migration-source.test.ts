import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "src/lib/db/migrations/manual/0036_ai_booking_proposals.sql";
const verifierPath = "scripts/ai-booking-proposal-migration-verify.ts";
const sql = readFileSync(migrationPath, "utf8");

test("0036 installs exact payload-bound tuple and strict catalog shape", () => {
  for (const column of [
    "token_hash text NOT NULL",
    "payload_hash text NOT NULL",
    "user_id uuid NOT NULL",
    "event_plan_id integer NOT NULL",
    "artist_id integer NOT NULL",
    "category_id integer NOT NULL",
    "expires_at timestamptz NOT NULL",
    "consumed_action_id uuid",
  ]) {
    assert.ok(sql.includes(column), column);
  }
  assert.match(sql, /ai_booking_proposals_consumption_shape_chk/);
  assert.match(
    sql,
    /LOCK TABLE public\.ai_booking_proposals IN ACCESS EXCLUSIVE MODE/,
  );
  assert.match(sql, /expected_columns text\[\]/);
  assert.match(sql, /actual_columns IS DISTINCT FROM expected_columns/);
  assert.match(sql, /attribute\.attisdropped/);
  assert.match(sql, /default_count <> 2/);
  assert.match(sql, /pg_get_serial_sequence/);
  assert.match(sql, /serial_dependency_count <> 1/);
  assert.match(sql, /exactly one canonical primary key on id/);
  assert.match(sql, /canonical btree primary index on id/);
  assert.match(sql, /requires exactly four proposal foreign keys/);
  assert.match(sql, /confrelid = target\.target_table::regclass/);
  assert.match(sql, /failed to install the canonical consumption CHECK/);
  assert.match(
    sql,
    /DROP INDEX IF EXISTS public\.ai_booking_proposals_token_hash_uidx/,
  );
  assert.match(sql, /CREATE UNIQUE INDEX ai_booking_proposals_token_hash_uidx/);
  assert.match(sql, /index_catalog\.indisunique = expected\.is_unique/);
  assert.match(sql, /NOT index_catalog\.indisclustered/);
  assert.match(sql, /NOT index_catalog\.indisreplident/);
  assert.match(sql, /NOT index_catalog\.indnullsnotdistinct/);
  assert.match(sql, /operator_class\.opcdefault/);
  assert.match(sql, /index_catalog\.indcollation\[key_position\.position\]/);
});

test("0036 is transactional, owner-compatible and closed to Data API roles", () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /requires the Supabase anon and authenticated roles/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /NO FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE public\.ai_booking_proposals FORCE ROW LEVEL SECURITY/,
  );
  assert.match(sql, /DROP POLICY %I ON public\.ai_booking_proposals/);
  assert.match(sql, /found a policy on the server-only proposal table/);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\.ai_booking_proposals FROM PUBLIC/,
  );
  assert.match(sql, /WITH RECURSIVE browser_role_tree/);
  assert.match(sql, /has_table_privilege/);
  assert.match(sql, /has_column_privilege/);
  assert.match(sql, /has_sequence_privilege/);
  assert.match(sql, /pg_catalog\.aclexplode/);
  assert.match(sql, /pg_catalog\.acldefault\('r'/);
  assert.match(sql, /pg_catalog\.acldefault\('s'/);
  assert.doesNotMatch(sql, /^\s*GRANT\b/im);
});

test("0036 refuses lookalikes but repairs only safe CHECK/index/RLS/ACL drift", () => {
  assert.match(sql, /ordinary table; relkind=/);
  assert.match(sql, /non-canonical ai_booking_proposals column shape/);
  assert.match(sql, /refuses unexpected proposal CHECK constraints/);
  assert.match(sql, /refuses non-canonical named index object/);
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS ai_booking_proposals_consumption_shape_chk/,
  );
  assert.match(
    sql,
    /DROP INDEX IF EXISTS public\.ai_booking_proposals_expiry_idx/,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.ai_booking_proposals/,
  );
});

test("0036 verifier cannot connect before the guarded local marker check", () => {
  const source = readFileSync(verifierPath, "utf8");
  const runtimeGuard = source.indexOf('process.env.E2E_RUNTIME !== "1"');
  const configRead = source.indexOf("const config = e2eDatabaseConfig()");
  const markerCheck = source.indexOf("await verifyE2EDatabase(config)");
  const connection = source.indexOf("const sql = postgres(config.url");

  assert.ok(runtimeGuard >= 0, "missing direct-execution guard");
  assert.ok(
    configRead > runtimeGuard,
    "E2E config read must follow runtime guard",
  );
  assert.ok(
    markerCheck > configRead,
    "marker check must follow local URL validation",
  );
  assert.ok(
    connection > markerCheck,
    "DB connection must follow marker verification",
  );
  assert.match(source, /exact post-0035\/pre-0036 baseline/);
  assert.match(source, /0036 second apply after safe catalog drift/);
  assert.match(source, /epetrecere_0036_browser_grandparent/);
  assert.match(source, /privilegeViolations/);
  assert.match(source, /extra-column lookalike/);
});

test("0036 guarded and source-only commands are documented", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    pkg.scripts?.["test:ai-booking-proposal:migration0036"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/ai-booking-proposal-migration-verify.ts",
  );
  assert.equal(
    pkg.scripts?.["test:ai-booking-proposal:migration0036-source"],
    "npx tsx --test scripts/ai-booking-proposal-migration-source.test.ts",
  );

  const readme = readFileSync("src/lib/db/migrations/README.md", "utf8");
  assert.match(readme, /0036_ai_booking_proposals\.sql/);
  assert.match(readme, /test:ai-booking-proposal:migration0036-source/);
  assert.match(readme, /test:ai-booking-proposal:migration0036/);
  assert.match(readme, /Preview, staging, or Production/);
});
