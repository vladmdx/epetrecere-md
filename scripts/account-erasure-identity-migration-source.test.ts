import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "src/lib/db/migrations/manual/0035_account_erasure_identity_outbox.sql";
const verifierPath = "scripts/account-erasure-identity-migration-verify.ts";
const sql = readFileSync(migrationPath, "utf8");

test("0035 installs the exact durable identity tombstone queue without a sequence", () => {
  for (const column of [
    "identity_hash text PRIMARY KEY",
    "clerk_id text",
    "status text NOT NULL DEFAULT 'pending'",
    "attempts integer NOT NULL DEFAULT 0",
    "next_attempt_at timestamptz NOT NULL DEFAULT now()",
    "lease_token uuid",
    "lease_until timestamptz",
    "last_error text",
    "completed_at timestamptz",
    "created_at timestamptz NOT NULL DEFAULT now()",
    "updated_at timestamptz NOT NULL DEFAULT now()",
  ]) {
    assert.ok(sql.includes(column), column);
  }

  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(
    sql,
    /LOCK TABLE public\.account_erasure_identity_outbox IN ACCESS EXCLUSIVE MODE/,
  );
  assert.match(sql, /expected_columns text\[\]/);
  assert.match(sql, /actual_columns IS DISTINCT FROM expected_columns/);
  assert.match(sql, /relation_persistence IS DISTINCT FROM 'p'::"char"/);
  assert.match(sql, /relation_is_partition IS DISTINCT FROM false/);
  assert.match(sql, /FROM pg_inherits/);
  assert.match(sql, /attribute\.attisdropped/);
  assert.match(sql, /attribute\.attidentity <> ''/);
  assert.match(sql, /attribute\.attgenerated <> ''/);
  assert.match(sql, /attribute\.attinhcount <> 0/);
  assert.match(sql, /NOT attribute\.attislocal/);
  assert.match(
    sql,
    /refuses dropped\/identity\/generated\/typmod\/inherited tombstone column drift/,
  );
  assert.match(sql, /exactly one validated primary key on identity_hash/);
  assert.match(sql, /account_erasure_identity_hash_chk/);
  assert.match(sql, /account_erasure_identity_attempts_chk/);
  assert.match(sql, /account_erasure_identity_state_chk/);
  assert.match(sql, /found unexpected\/unvalidated tombstone constraints/);
  assert.match(sql, /CREATE INDEX account_erasure_identity_due_idx/);
  assert.match(sql, /CREATE INDEX account_erasure_identity_expired_lease_idx/);
  assert.match(sql, /found non-canonical tombstone indexes/);

  assert.doesNotMatch(sql, /\bCREATE\s+SEQUENCE\b/i);
  assert.doesNotMatch(sql, /\bnextval\s*\(/i);
  assert.doesNotMatch(sql, /has_sequence_privilege/i);
});

test("0035 is self-healing only for safe CHECK, index, RLS, policy, and ACL drift", () => {
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS account_erasure_identity_hash_chk/,
  );
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS account_erasure_identity_attempts_chk/,
  );
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS account_erasure_identity_state_chk/,
  );
  assert.match(sql, /refuses non-canonical named index object public\.%I/);
  assert.match(
    sql,
    /DROP INDEX IF EXISTS public\.account_erasure_identity_due_idx/,
  );
  assert.match(
    sql,
    /DROP INDEX IF EXISTS public\.account_erasure_identity_expired_lease_idx/,
  );
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /NO FORCE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /DROP POLICY %I ON public\.account_erasure_identity_outbox/,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\.account_erasure_identity_outbox FROM PUBLIC/,
  );
  assert.match(sql, /WITH RECURSIVE browser_role_tree/);
  assert.match(sql, /JOIN pg_auth_members membership/);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.account_erasure_identity_outbox FROM %I/,
  );
  assert.match(sql, /has_table_privilege/);
  assert.match(sql, /has_column_privilege/);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE public\.account_erasure_identity_outbox FORCE ROW LEVEL SECURITY/,
  );
  assert.doesNotMatch(sql, /^\s*GRANT\b/im);
});

test("0035 verifier cannot connect before the guarded local marker check", () => {
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
  assert.match(source, /exact post-0034\/pre-0035 baseline/);
  assert.match(source, /0035 first apply/);
  assert.match(source, /0035 second apply after safe catalog drift/);
  assert.match(source, /epetrecere_0035_browser_parent/);
  assert.match(source, /epetrecere_0035_browser_grandparent/);
  assert.match(source, /0035 memberships after reapply/);
  assert.match(source, /did not converge to the first catalog shape/);
  assert.match(source, /0035 extra-index lookalike/);
  assert.match(source, /0035 extra-constraint lookalike/);
  assert.match(source, /0035 foreign named-index lookalike/);
  assert.match(source, /0035 unlogged-relation lookalike/);
  assert.match(source, /0035 inherited-relation lookalike/);
  assert.match(source, /0035 extra-column lookalike/);
  assert.match(source, /0035 dropped-column metadata lookalike/);
  assert.match(source, /ownedSequenceCount/);
});

test("0035 guarded/source commands, rollout order, and HMAC prerequisite are documented", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    pkg.scripts?.["test:account-erasure-identity:migration0035"],
    "npx tsx scripts/run-guarded-db-test.ts scripts/account-erasure-identity-migration-verify.ts",
  );
  assert.equal(
    pkg.scripts?.["test:account-erasure-identity:migration0035-source"],
    "npx tsx --test scripts/account-erasure-identity-migration-source.test.ts",
  );

  for (const documentationPath of [
    "src/lib/db/migrations/README.md",
    "docs/testing-multihall.md",
  ]) {
    const documentation = readFileSync(documentationPath, "utf8");
    const migration0034 = documentation.indexOf(
      "0034_notifications_calendar_security",
    );
    const migration0035 = documentation.indexOf(
      "0035_account_erasure_identity_outbox",
    );
    const migration0036 = documentation.indexOf("0036_ai_booking_proposals");

    assert.ok(migration0034 >= 0, `${documentationPath}: missing 0034`);
    assert.ok(
      migration0035 > migration0034,
      `${documentationPath}: 0035 must follow 0034`,
    );
    assert.ok(
      migration0036 > migration0035,
      `${documentationPath}: 0036 must follow 0035`,
    );
    assert.match(documentation, /ACCOUNT_ERASURE_IDENTITY_SECRET/);
    assert.match(documentation, /dedicated/i);
    assert.match(documentation, /stable/i);
    assert.match(documentation, /32 bytes/i);
    assert.match(documentation, /no fallback/i);
    assert.match(documentation, /unplanned rotation/i);
    assert.match(
      documentation,
      /shared Preview, staging, or\s+Production database/i,
    );
    assert.match(
      documentation,
      /test:account-erasure-identity:migration0035-source/,
    );
    assert.match(documentation, /test:account-erasure-identity:migration0035/);
  }
});
