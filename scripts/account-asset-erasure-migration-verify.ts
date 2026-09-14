/**
 * Verify manual migration 0037 on a guarded disposable loopback database.
 *
 * The guarded runner verifies the database-resident marker before importing
 * this module. The verifier requires the exact post-0036/pre-0037 baseline,
 * applies 0037, exercises the live claim/orphan/delete fences, injects safe
 * catalog and inherited-role drift, reapplies 0037, and compares the complete
 * protected catalog. It must never be pointed at Preview/Production.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0037 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0037_account_asset_erasure_outbox.sql";
const targetTables = [
  "account_blob_assets",
  "account_blob_asset_claims",
  "account_asset_erasure_outbox",
] as const;
const targetSequence = "account_asset_erasure_outbox_id_seq";
const helperSignatures = [
  "account_blob_record_claim(text,text,text,text,uuid)",
  "account_blob_fence_claim_mutation()",
  "account_blob_enqueue_unclaimed_orphans()",
  "account_blob_deferred_orphan_check()",
  "account_blob_sync_row_claims()",
] as const;
const helperNames = helperSignatures.map((signature) => signature.split("(")[0]);
const sourceTriggerTables = [
  "artist_images",
  "artists",
  "blog_posts",
  "booking_requests",
  "categories",
  "chat_messages",
  "conversations",
  "event_photos",
  "event_plans",
  "invitation_templates",
  "invitations",
  "reviews",
  "users",
  "venue_images",
  "venues",
] as const;
const parentRole = "epetrecere_0037_browser_parent";
const grandparentRole = "epetrecere_0037_browser_grandparent";
const auditedRoles = [
  "anon",
  "authenticated",
  parentRole,
  grandparentRole,
] as const;
const lookalikeTable = "epetrecere_0037_index_lookalike";
const fixtureUsers = {
  ordinary: "00000000-0000-4000-8000-000000003701",
  owner: "00000000-0000-4000-8000-000000003702",
  sharer: "00000000-0000-4000-8000-000000003703",
  raceOwner: "00000000-0000-4000-8000-000000003704",
  raceSharer: "00000000-0000-4000-8000-000000003705",
  attachOwner: "00000000-0000-4000-8000-000000003706",
  attachSharer: "00000000-0000-4000-8000-000000003707",
} as const;
const allFixtureUsers = Object.values(fixtureUsers);

type PrivilegeViolation = {
  roleName: string;
  objectKind: "table" | "column" | "sequence" | "function";
  objectName: string;
  privilege: string;
};

type Outcome = { ok: true } | { ok: false; error: unknown };

function assetKey(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

function applyMigration(databaseUrl: string, label: string): void {
  console.log(`-- ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function expectMigrationRejected(
  databaseUrl: string,
  label: string,
  expectedFailure: RegExp,
): void {
  try {
    execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const output = [failure.message, failure.stdout, failure.stderr]
      .filter(Boolean)
      .join("\n");
    if (!expectedFailure.test(output)) {
      throw new Error(`${label}: rejected for an unexpected reason\n${output}`, {
        cause: error,
      });
    }
    console.log(`-- ${label}: rejected as expected`);
    return;
  }
  throw new Error(`${label}: incompatible catalog was unexpectedly accepted`);
}

function assertUnchanged<T>(before: T, after: T, label: string): void {
  assert.deepEqual(after, before, `${label} changed`);
}

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "Do not apply to Preview/Production without an explicit rollout",
    "0037 requires canonical post-0036 ordinary table",
    "0037 requires canonical source column",
    "LOCK TABLE public.account_blob_assets IN ACCESS EXCLUSIVE MODE",
    "0037 refuses dropped/identity/generated/inherited/typmod asset columns",
    "0037 found non-canonical outbox serial sequence shape/ownership",
    "0037 foreign-key action drift",
    "0037 failed exact index shape",
    "0037 refuses missing or overloaded Blob helper functions",
    "0037 failed exact source Blob claim trigger shape",
    "WITH RECURSIVE browser_role_tree",
    "ENABLE ROW LEVEL SECURITY",
    "NO FORCE ROW LEVEL SECURITY",
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
    "has_function_privilege",
    "pg_advisory_xact_lock(1163022925, 37)",
    "registered Blob is pending erasure",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0037 source guarantee missing: ${guarantee}`);
    }
  }

  const sql = postgres(config.url, {
    max: 4,
    prepare: false,
    ssl: false,
  });
  type TransactionExecutor = postgres.TransactionSql<Record<string, unknown>>;
  const migrationBody = source
    .replace(/^BEGIN;\s*/, "")
    .replace(/\s*COMMIT;\s*$/, "");

  async function expectTransactionalMigrationRejected(
    label: string,
    expectedFailure: RegExp,
    inject: (tx: TransactionExecutor) => Promise<unknown>,
  ): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await inject(tx);
        await tx.unsafe(migrationBody);
      });
    } catch (error) {
      const output = error instanceof Error ? error.message : "unknown error";
      if (!expectedFailure.test(output)) {
        throw new Error(`${label}: rejected for an unexpected reason\n${output}`, {
          cause: error,
        });
      }
      console.log(`-- ${label}: rejected as expected`);
      return;
    }
    throw new Error(`${label}: incompatible catalog was unexpectedly accepted`);
  }

  async function roleExists(roleName: string): Promise<boolean> {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${roleName}) AS exists
    `;
    return row?.exists === true;
  }

  async function relationExists(relationName: string): Promise<boolean> {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass(format('public.%I', ${relationName})) IS NOT NULL AS exists
    `;
    return row?.exists === true;
  }

  async function dropFixtureRoles(): Promise<void> {
    const parentExists = await roleExists(parentRole);
    const grandparentExists = await roleExists(grandparentRole);
    if (parentExists) {
      for (const member of ["anon", "authenticated"]) {
        if (await roleExists(member)) {
          await sql.unsafe(`REVOKE "${parentRole}" FROM "${member}"`);
        }
      }
    }
    if (parentExists && grandparentExists) {
      await sql.unsafe(`REVOKE "${grandparentRole}" FROM "${parentRole}"`);
    }
    if (parentExists) {
      await sql.unsafe(`DROP OWNED BY "${parentRole}"`);
      await sql.unsafe(`DROP ROLE "${parentRole}"`);
    }
    if (grandparentExists) {
      await sql.unsafe(`DROP OWNED BY "${grandparentRole}"`);
      await sql.unsafe(`DROP ROLE "${grandparentRole}"`);
    }
  }

  async function assertBaseline(): Promise<void> {
    const [shape] = await sql<{
      targetRelations: number;
      helperFunctions: number;
      targetTriggers: number;
      priorTables: number;
      laterIndex: boolean;
    }[]>`
      SELECT
        (SELECT count(*)::integer FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = ANY(${[
              ...targetTables,
              targetSequence,
            ]}::text[])) AS "targetRelations",
        (SELECT count(*)::integer FROM pg_proc AS function_row
          JOIN pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
          WHERE namespace.nspname = 'public'
            AND function_row.proname = ANY(${helperNames}::text[])) AS "helperFunctions",
        (SELECT count(*)::integer FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname IN (
              'account_blob_claims_sync_trg',
              'account_blob_claim_mutation_fence_trg',
              'account_blob_claim_orphan_check_trg',
              'account_blob_owner_orphan_check_trg'
            )) AS "targetTriggers",
        (SELECT count(*)::integer FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind = 'r'
            AND relation.relname IN (
              'account_erasure_identity_outbox', 'ai_booking_proposals'
            )) AS "priorTables",
        to_regclass('public.referral_events_milestone_uidx') IS NOT NULL
          AS "laterIndex"
    `;
    assert.deepEqual(shape, {
      targetRelations: 0,
      helperFunctions: 0,
      targetTriggers: 0,
      priorTables: 2,
      laterIndex: false,
    }, "0037 requires exact post-0036/pre-0037 baseline");
  }

  async function membershipShape(): Promise<string[]> {
    const rows = await sql<{ edge: string }[]>`
      SELECT parent.rolname || '->' || child.rolname AS edge
      FROM pg_auth_members AS membership
      JOIN pg_roles AS parent ON parent.oid = membership.roleid
      JOIN pg_roles AS child ON child.oid = membership.member
      WHERE parent.rolname IN (${parentRole}, ${grandparentRole})
      ORDER BY edge
    `;
    return rows.map((row) => row.edge);
  }

  async function privilegeViolations(): Promise<PrivilegeViolation[]> {
    return sql<PrivilegeViolation[]>`
      WITH target_roles(role_name) AS (
        SELECT unnest(${[...auditedRoles]}::text[])
      ), target_tables(table_name) AS (
        SELECT unnest(${[...targetTables]}::text[])
      ), table_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
        ]::text[])
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']::text[])
      ), sequence_privileges(privilege) AS (
        SELECT unnest(ARRAY['USAGE','SELECT','UPDATE']::text[])
      ), target_functions(signature) AS (
        SELECT unnest(${[...helperSignatures]}::text[])
      )
      SELECT target_role.role_name AS "roleName", 'table'::text AS "objectKind",
        format('public.%I', target_table.table_name) AS "objectName",
        table_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN target_tables AS target_table
      CROSS JOIN table_privileges AS table_privilege
      WHERE has_table_privilege(
        role.rolname,
        format('public.%I', target_table.table_name),
        table_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name, 'column',
        format('public.%I.%I', column_info.table_name, column_info.column_name),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = ANY(${[...targetTables]}::text[])
        AND has_column_privilege(
          role.rolname,
          format('public.%I', column_info.table_name),
          column_info.column_name,
          column_privilege.privilege
        )
      UNION ALL
      SELECT target_role.role_name, 'sequence',
        ${`public.${targetSequence}`}, sequence_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN sequence_privileges AS sequence_privilege
      WHERE has_sequence_privilege(
        role.rolname,
        ${`public.${targetSequence}`},
        sequence_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name, 'function',
        'public.' || target_function.signature, 'EXECUTE'
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN target_functions AS target_function
      WHERE has_function_privilege(
        role.rolname,
        'public.' || target_function.signature,
        'EXECUTE'
      )
      ORDER BY 1, 2, 3, 4
    `;
  }

  async function catalogSnapshot() {
    const relations = await sql`
      SELECT relation.relname AS "relationName", relation.relkind::text AS kind,
        relation.relpersistence::text AS persistence,
        relation.relispartition AS partition,
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity",
        relation.relreplident::text AS "replicaIdentity",
        owner_role.rolname AS owner,
        coalesce(
          relation.relacl,
          acldefault('r', relation.relowner)
        )::text AS acl,
        relation.reloptions::text AS options,
        relation.reltablespace::integer AS tablespace,
        (SELECT count(*)::integer FROM pg_inherits
          WHERE inhrelid = relation.oid OR inhparent = relation.oid) AS inheritance,
        (SELECT count(*)::integer FROM pg_policy
          WHERE polrelid = relation.oid) AS "policyCount"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_roles AS owner_role ON owner_role.oid = relation.relowner
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...targetTables]}::text[])
      ORDER BY relation.relname
    `;
    const columns = await sql`
      SELECT relation.relname AS "tableName", attribute.attnum::integer AS position,
        attribute.attname AS "columnName",
        format_type(attribute.atttypid, attribute.atttypmod) AS "dataType",
        attribute.attnotnull AS "notNull",
        pg_get_expr(default_row.adbin, default_row.adrelid) AS "defaultValue",
        attribute.attidentity::text AS identity,
        attribute.attgenerated::text AS generated,
        attribute.attisdropped AS dropped,
        attribute.atttypmod AS typmod,
        attribute.attislocal AS local,
        attribute.attinhcount AS "inheritanceCount",
        coalesce(attribute.attacl, ARRAY[]::aclitem[])::text AS acl
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid
      LEFT JOIN pg_attrdef AS default_row
        ON default_row.adrelid = attribute.attrelid
       AND default_row.adnum = attribute.attnum
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...targetTables]}::text[])
        AND attribute.attnum > 0
      ORDER BY relation.relname, attribute.attnum
    `;
    const constraints = await sql`
      SELECT relation.relname AS "tableName", constraint_row.conname AS name,
        constraint_row.contype::text AS type,
        coalesce((SELECT array_agg(attribute.attname ORDER BY key_position.ordinality)
          FROM unnest(constraint_row.conkey) WITH ORDINALITY
            AS key_position(attnum, ordinality)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.conrelid
           AND attribute.attnum = key_position.attnum), ARRAY[]::text[]) AS columns,
        target_relation.relname AS "targetTable",
        coalesce((SELECT array_agg(attribute.attname ORDER BY key_position.ordinality)
          FROM unnest(constraint_row.confkey) WITH ORDINALITY
            AS key_position(attnum, ordinality)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.confrelid
           AND attribute.attnum = key_position.attnum), ARRAY[]::text[]) AS "targetColumns",
        constraint_row.confdeltype::text AS "deleteAction",
        constraint_row.confupdtype::text AS "updateAction",
        constraint_row.confmatchtype::text AS "matchType",
        constraint_row.convalidated AS valid,
        constraint_row.connoinherit AS "noInherit",
        constraint_row.condeferrable AS deferrable,
        constraint_row.condeferred AS deferred,
        constraint_row.conislocal AS local,
        constraint_row.coninhcount AS "inheritanceCount",
        constraint_row.conparentid::integer AS "parentConstraintOid",
        pg_get_constraintdef(constraint_row.oid, true) AS definition
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_class AS target_relation
        ON target_relation.oid = constraint_row.confrelid
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...targetTables]}::text[])
      ORDER BY relation.relname, constraint_row.conname
    `;
    const indexes = await sql`
      SELECT table_relation.relname AS "tableName",
        index_relation.relname AS "indexName",
        pg_get_indexdef(index_catalog.indexrelid) AS definition,
        access_method.amname AS "accessMethod",
        owner_role.rolname AS owner,
        index_catalog.indisunique AS unique,
        index_catalog.indisprimary AS primary,
        index_catalog.indisexclusion AS exclusion,
        index_catalog.indimmediate AS immediate,
        index_catalog.indisvalid AS valid,
        index_catalog.indisready AS ready,
        index_catalog.indislive AS live,
        index_catalog.indisclustered AS clustered,
        index_catalog.indisreplident AS "replicaIdentity",
        index_catalog.indnullsnotdistinct AS "nullsNotDistinct",
        index_catalog.indnkeyatts AS "keyCount",
        index_catalog.indnatts AS "attributeCount",
        index_catalog.indexprs IS NULL AS "expressionFree",
        pg_get_expr(index_catalog.indpred, index_catalog.indrelid) AS predicate,
        index_catalog.indkey::text AS keys,
        index_catalog.indclass::text AS opclasses,
        index_catalog.indcollation::text AS collations,
        index_catalog.indoption::text AS options,
        index_relation.reltablespace::integer AS tablespace,
        index_relation.reloptions::text AS "relationOptions",
        (SELECT count(*)::integer FROM pg_constraint
          WHERE conindid = index_catalog.indexrelid) AS "constraintCount"
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation ON index_relation.oid = index_catalog.indexrelid
      JOIN pg_class AS table_relation ON table_relation.oid = index_catalog.indrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
      JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
      JOIN pg_roles AS owner_role ON owner_role.oid = index_relation.relowner
      WHERE namespace.nspname = 'public'
        AND table_relation.relname = ANY(${[...targetTables]}::text[])
      ORDER BY table_relation.relname, index_relation.relname
    `;
    const sequence = await sql`
      SELECT relation.relname AS "sequenceName", relation.relkind::text AS kind,
        relation.relpersistence::text AS persistence,
        relation.relispartition AS partition,
        owner_role.rolname AS owner,
        table_owner.rolname AS "tableOwner",
        coalesce(relation.relacl, acldefault('s', relation.relowner))::text AS acl,
        relation.reltablespace::integer AS tablespace,
        relation.reloptions::text AS "relationOptions",
        (SELECT count(*)::integer FROM pg_inherits
          WHERE inhrelid = relation.oid OR inhparent = relation.oid) AS inheritance,
        sequence_row.seqtypid::regtype::text AS "dataType",
        sequence_row.seqstart::text AS start,
        sequence_row.seqincrement::text AS increment,
        sequence_row.seqmax::text AS max,
        sequence_row.seqmin::text AS min,
        sequence_row.seqcache::text AS cache,
        sequence_row.seqcycle AS cycle,
        (SELECT count(*)::integer FROM pg_depend AS dependency
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = dependency.refobjid
           AND attribute.attnum = dependency.refobjsubid
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.objid = relation.oid
            AND dependency.refclassid = 'pg_class'::regclass
            AND dependency.refobjid = 'public.account_asset_erasure_outbox'::regclass
            AND attribute.attname = 'id'
            AND dependency.deptype = 'a') AS "serialDependencyCount"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_roles AS owner_role ON owner_role.oid = relation.relowner
      JOIN pg_class AS table_relation
        ON table_relation.oid = 'public.account_asset_erasure_outbox'::regclass
      JOIN pg_roles AS table_owner ON table_owner.oid = table_relation.relowner
      JOIN pg_sequence AS sequence_row ON sequence_row.seqrelid = relation.oid
      WHERE namespace.nspname = 'public' AND relation.relname = ${targetSequence}
    `;
    const functions = await sql`
      SELECT function_row.proname AS name,
        oidvectortypes(function_row.proargtypes) AS arguments,
        pg_get_function_result(function_row.oid) AS result,
        language_row.lanname AS language,
        owner_role.rolname AS owner,
        function_row.prokind::text AS kind,
        function_row.prosecdef AS "securityDefiner",
        function_row.proleakproof AS leakproof,
        function_row.proisstrict AS strict,
        function_row.provolatile::text AS volatility,
        function_row.proparallel::text AS parallel,
        function_row.proconfig::text AS config,
        coalesce(
          function_row.proacl,
          acldefault('f', function_row.proowner)
        )::text AS acl,
        pg_get_functiondef(function_row.oid) AS definition
      FROM pg_proc AS function_row
      JOIN pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
      JOIN pg_language AS language_row ON language_row.oid = function_row.prolang
      JOIN pg_roles AS owner_role ON owner_role.oid = function_row.proowner
      WHERE namespace.nspname = 'public'
        AND function_row.proname = ANY(${helperNames}::text[])
      ORDER BY function_row.proname, function_row.proargtypes::text
    `;
    const triggers = await sql`
      SELECT relation.relname AS "tableName", trigger_row.tgname AS name,
        trigger_row.tgfoid::regprocedure::text AS function,
        trigger_row.tgtype::integer AS type,
        trigger_row.tgenabled::text AS enabled,
        trigger_row.tgisinternal AS internal,
        trigger_row.tgdeferrable AS deferrable,
        trigger_row.tginitdeferred AS deferred,
        (trigger_row.tgconstraint <> 0) AS "constraintBacked",
        trigger_row.tgnargs::integer AS "argumentCount",
        pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid) AS qualification,
        pg_get_triggerdef(trigger_row.oid, true) AS definition
      FROM pg_trigger AS trigger_row
      JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND NOT trigger_row.tgisinternal
        AND (
          trigger_row.tgname = 'account_blob_claims_sync_trg'
          OR relation.relname = ANY(${[...targetTables]}::text[])
        )
      ORDER BY relation.relname, trigger_row.tgname
    `;
    const policies = await sql`
      SELECT relation.relname AS "tableName", policy.polname AS name,
        policy.polcmd AS command, policy.polpermissive AS permissive,
        pg_get_expr(policy.polqual, policy.polrelid) AS using,
        pg_get_expr(policy.polwithcheck, policy.polrelid) AS check
      FROM pg_policy AS policy
      JOIN pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...targetTables]}::text[])
      ORDER BY relation.relname, policy.polname
    `;
    const privileges = await privilegeViolations();
    return {
      relations,
      columns,
      constraints,
      indexes,
      sequence,
      functions,
      triggers,
      policies,
      privileges,
    };
  }

  function assertCanonical(
    snapshot: Awaited<ReturnType<typeof catalogSnapshot>>,
    label: string,
  ): void {
    assert.deepEqual(
      snapshot.relations.map((row) => row.relationName),
      [...targetTables].sort(),
      `${label}: tables`,
    );
    for (const relation of snapshot.relations) {
      assert.equal(relation.kind, "r", `${label}: ordinary table`);
      assert.equal(relation.persistence, "p", `${label}: permanent table`);
      assert.equal(relation.partition, false, `${label}: no partition`);
      assert.equal(relation.rowSecurity, true, `${label}: RLS enabled`);
      assert.equal(relation.forceRowSecurity, false, `${label}: owner bypass RLS`);
      assert.equal(relation.inheritance, 0, `${label}: no inheritance`);
      assert.equal(relation.policyCount, 0, `${label}: zero policies`);
    }
    assert.equal(snapshot.columns.length, 29, `${label}: exact columns`);
    assert.equal(snapshot.columns.some((row) => row.dropped), false, `${label}: no dropped columns`);
    assert.deepEqual(
      snapshot.constraints.map((row) => `${row.tableName}.${row.name}`),
      [
        "account_asset_erasure_outbox.account_asset_erasure_outbox_asset_key_chk",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_asset_key_unique",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_attempts_chk",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_pkey",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_registry_fk",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_state_chk",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_status_chk",
        "account_blob_asset_claims.account_blob_asset_claims_asset_fk",
        "account_blob_asset_claims.account_blob_asset_claims_erasure_user_fk",
        "account_blob_asset_claims.account_blob_asset_claims_identity_chk",
        "account_blob_asset_claims.account_blob_asset_claims_pkey",
        "account_blob_assets.account_blob_assets_key_chk",
        "account_blob_assets.account_blob_assets_owner_user_fk",
        "account_blob_assets.account_blob_assets_pkey",
        "account_blob_assets.account_blob_assets_policy_chk",
        "account_blob_assets.account_blob_assets_provenance_chk",
        "account_blob_assets.account_blob_assets_state_chk",
      ],
      `${label}: exact constraints`,
    );
    assert.equal(
      snapshot.constraints.some((row) =>
        !row.valid || row.deferrable || row.deferred || !row.local
        || row.inheritanceCount !== 0 || row.parentConstraintOid !== 0
        || row.noInherit
      ),
      false,
      `${label}: canonical constraint flags`,
    );
    assert.deepEqual(
      snapshot.indexes.map((row) => `${row.tableName}.${row.indexName}`),
      [
        "account_asset_erasure_outbox.account_asset_erasure_outbox_asset_key_unique",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_due_idx",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_expired_lease_idx",
        "account_asset_erasure_outbox.account_asset_erasure_outbox_pkey",
        "account_blob_asset_claims.account_blob_asset_claims_asset_idx",
        "account_blob_asset_claims.account_blob_asset_claims_erasure_user_idx",
        "account_blob_asset_claims.account_blob_asset_claims_pkey",
        "account_blob_assets.account_blob_assets_live_url_uidx",
        "account_blob_assets.account_blob_assets_owner_active_idx",
        "account_blob_assets.account_blob_assets_owner_idx",
        "account_blob_assets.account_blob_assets_pending_unclaimed_idx",
        "account_blob_assets.account_blob_assets_pkey",
      ],
      `${label}: exact indexes`,
    );
    assert.equal(snapshot.sequence.length, 1, `${label}: serial sequence`);
    assert.equal(snapshot.sequence[0]?.kind, "S", `${label}: sequence kind`);
    assert.equal(snapshot.sequence[0]?.persistence, "p", `${label}: sequence persistence`);
    assert.equal(snapshot.sequence[0]?.partition, false, `${label}: sequence partition`);
    assert.equal(snapshot.sequence[0]?.owner, snapshot.sequence[0]?.tableOwner,
      `${label}: sequence owner`);
    assert.equal(snapshot.sequence[0]?.tablespace, 0, `${label}: sequence tablespace`);
    assert.equal(snapshot.sequence[0]?.relationOptions, null, `${label}: sequence options`);
    assert.equal(snapshot.sequence[0]?.inheritance, 0, `${label}: sequence inheritance`);
    assert.equal(snapshot.sequence[0]?.dataType, "integer", `${label}: sequence type`);
    assert.equal(snapshot.sequence[0]?.start, "1", `${label}: sequence start`);
    assert.equal(snapshot.sequence[0]?.increment, "1", `${label}: sequence increment`);
    assert.equal(snapshot.sequence[0]?.max, "2147483647", `${label}: sequence max`);
    assert.equal(snapshot.sequence[0]?.min, "1", `${label}: sequence min`);
    assert.equal(snapshot.sequence[0]?.cache, "1", `${label}: sequence cache`);
    assert.equal(snapshot.sequence[0]?.cycle, false, `${label}: sequence cycle`);
    assert.equal(snapshot.sequence[0]?.serialDependencyCount, 1, `${label}: serial ownership`);
    assert.equal(snapshot.functions.length, 5, `${label}: exact helper functions`);
    for (const helper of snapshot.functions) {
      assert.equal(helper.kind, "f", `${label}: helper kind`);
      assert.equal(helper.language, "plpgsql", `${label}: helper language`);
      assert.equal(helper.securityDefiner, true, `${label}: SECURITY DEFINER`);
      assert.equal(helper.leakproof, false, `${label}: not leakproof`);
      assert.equal(helper.strict, false, `${label}: trigger-compatible strictness`);
      assert.equal(helper.volatility, "v", `${label}: volatile`);
      assert.equal(helper.parallel, "u", `${label}: parallel unsafe`);
      assert.equal(helper.config, '{"search_path=pg_catalog, public"}', `${label}: fixed search path`);
    }
    assert.equal(snapshot.triggers.length, sourceTriggerTables.length + 3, `${label}: exact triggers`);
    assert.deepEqual(
      snapshot.triggers
        .filter((row) => row.name === "account_blob_claims_sync_trg")
        .map((row) => row.tableName),
      [...sourceTriggerTables],
      `${label}: source trigger coverage`,
    );
    assert.equal(snapshot.policies.length, 0, `${label}: no policies`);
    assert.deepEqual(snapshot.privileges, [], `${label}: zero effective browser privileges`);
  }

  async function assertBrowserReadBlocked(label: string): Promise<void> {
    for (const role of ["anon", "authenticated"]) {
      for (const table of targetTables) {
        let blocked = false;
        await sql`BEGIN`;
        try {
          await sql.unsafe(`SET LOCAL ROLE "${role}"`);
          await sql.unsafe(`SELECT 1 FROM public."${table}" LIMIT 0`);
        } catch (error) {
          blocked = (error as { code?: string }).code === "42501";
        } finally {
          await sql`ROLLBACK`;
        }
        assert.equal(blocked, true, `${label}: ${role} read ${table}`);
      }
    }
  }

  async function insertUser(id: string, label: string): Promise<void> {
    await sql`
      INSERT INTO public.users (id, clerk_id, email, name)
      VALUES (${id}::uuid, ${`e2e_0037_${label}`}, ${`e2e-0037-${label}@example.invalid`}, ${label})
    `;
  }

  async function insertAsset(url: string, ownerUserId: string): Promise<string> {
    const key = assetKey(url);
    await sql`
      INSERT INTO public.account_blob_assets
        (asset_key, asset_url, owner_user_id, provenance)
      VALUES (${key}, ${url}, ${ownerUserId}::uuid, 'e2e_0037')
    `;
    return key;
  }

  async function cleanupFixtures(): Promise<void> {
    if (!(await relationExists("account_blob_assets"))) return;
    await sql`
      DELETE FROM public.account_asset_erasure_outbox
      WHERE asset_key IN (
        SELECT asset_key FROM public.account_blob_assets
        WHERE provenance = 'e2e_0037'
      )
    `;
    await sql`
      DELETE FROM public.account_blob_assets WHERE provenance = 'e2e_0037'
    `;
    await sql`DELETE FROM public.users WHERE id = ANY(${allFixtureUsers}::uuid[])`;
  }

  async function advisoryCount(tx: TransactionExecutor): Promise<number> {
    const [row] = await tx<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM pg_locks
      WHERE pid = pg_backend_pid() AND locktype = 'advisory'
    `;
    return row?.count ?? 0;
  }

  async function exerciseFastPathAndLegacy(): Promise<void> {
    await insertUser(fixtureUsers.ordinary, "ordinary");
    await sql.begin(async (tx) => {
      await tx`
        UPDATE public.users SET name = 'ordinary-no-blob'
        WHERE id = ${fixtureUsers.ordinary}::uuid
      `;
      assert.equal(await advisoryCount(tx), 0, "ordinary write took global Blob advisory lock");
    });
    const legacy = "https://legacy.example.invalid/not-registered.webp";
    await sql`
      UPDATE public.users SET avatar_url = ${legacy}
      WHERE id = ${fixtureUsers.ordinary}::uuid
    `;
    const [legacyClaims] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM public.account_blob_asset_claims
      WHERE source_table = 'users' AND source_id = ${fixtureUsers.ordinary}
    `;
    assert.equal(legacyClaims?.count, 0, "legacy URL became deletion authority");

    const registeredUrl =
      "https://fixture0037.public.blob.vercel-storage.com/e2e/ordinary.webp";
    await insertAsset(registeredUrl, fixtureUsers.ordinary);
    await sql.begin(async (tx) => {
      await tx`
        UPDATE public.users SET avatar_url = ${registeredUrl}
        WHERE id = ${fixtureUsers.ordinary}::uuid
      `;
      assert.ok(await advisoryCount(tx) >= 1, "registered URL write missed global fence");
    });
  }

  async function exerciseSharedReferenceLifecycle(): Promise<void> {
    await insertUser(fixtureUsers.owner, "owner");
    await insertUser(fixtureUsers.sharer, "sharer");
    const url = "https://fixture0037.public.blob.vercel-storage.com/e2e/shared.webp";
    const key = await insertAsset(url, fixtureUsers.owner);
    await sql`
      UPDATE public.users SET avatar_url = ${url}
      WHERE id IN (${fixtureUsers.owner}::uuid, ${fixtureUsers.sharer}::uuid)
    `;
    await sql`DELETE FROM public.users WHERE id = ${fixtureUsers.owner}::uuid`;
    const [retained] = await sql<{
      ownerUserId: string | null;
      state: string;
      claims: number;
      queued: number;
    }[]>`
      SELECT asset.owner_user_id AS "ownerUserId", asset.state,
        (SELECT count(*)::integer FROM public.account_blob_asset_claims
          WHERE asset_key = asset.asset_key) AS claims,
        (SELECT count(*)::integer FROM public.account_asset_erasure_outbox
          WHERE asset_key = asset.asset_key) AS queued
      FROM public.account_blob_assets AS asset WHERE asset.asset_key = ${key}
    `;
    assert.deepEqual(retained, {
      ownerUserId: null,
      state: "active",
      claims: 1,
      queued: 0,
    }, "shared asset was not retained after owner deletion");
    await sql`
      UPDATE public.users SET avatar_url = NULL
      WHERE id = ${fixtureUsers.sharer}::uuid
    `;
    const [queued] = await sql<{ state: string; claims: number; queued: number }[]>`
      SELECT asset.state,
        (SELECT count(*)::integer FROM public.account_blob_asset_claims
          WHERE asset_key = asset.asset_key) AS claims,
        (SELECT count(*)::integer FROM public.account_asset_erasure_outbox
          WHERE asset_key = asset.asset_key) AS queued
      FROM public.account_blob_assets AS asset WHERE asset.asset_key = ${key}
    `;
    assert.deepEqual(queued, { state: "queued", claims: 0, queued: 1 },
      "last surviving claim did not enqueue exact orphan");
  }

  async function exerciseLiveOwnerLastClaimCleanup(): Promise<void> {
    await insertUser(fixtureUsers.ordinary, "live-owner");
    const attachedUrl =
      "https://fixture0037.public.blob.vercel-storage.com/e2e/live-owner-attached.webp";
    const draftUrl =
      "https://fixture0037.public.blob.vercel-storage.com/e2e/live-owner-draft.webp";
    const attachedKey = await insertAsset(attachedUrl, fixtureUsers.ordinary);
    const draftKey = await insertAsset(draftUrl, fixtureUsers.ordinary);

    await sql`
      UPDATE public.users SET avatar_url = ${attachedUrl}
      WHERE id = ${fixtureUsers.ordinary}::uuid
    `;
    await sql`
      UPDATE public.users SET avatar_url = NULL
      WHERE id = ${fixtureUsers.ordinary}::uuid
    `;

    const states = await sql<{
      assetKey: string;
      ownerUserId: string | null;
      state: string;
      claims: number;
      queued: number;
    }[]>`
      SELECT asset.asset_key AS "assetKey",
        asset.owner_user_id AS "ownerUserId", asset.state,
        (SELECT count(*)::integer FROM public.account_blob_asset_claims
          WHERE asset_key = asset.asset_key) AS claims,
        (SELECT count(*)::integer FROM public.account_asset_erasure_outbox
          WHERE asset_key = asset.asset_key) AS queued
      FROM public.account_blob_assets AS asset
      WHERE asset.asset_key IN (${attachedKey}, ${draftKey})
      ORDER BY asset.asset_key
    `;
    const byKey = new Map(states.map((row) => [row.assetKey, row]));
    assert.deepEqual(byKey.get(attachedKey), {
      assetKey: attachedKey,
      ownerUserId: null,
      state: "queued",
      claims: 0,
      queued: 1,
    }, "last claim removal with a live owner did not enqueue exact cleanup");
    assert.deepEqual(byKey.get(draftKey), {
      assetKey: draftKey,
      ownerUserId: fixtureUsers.ordinary,
      state: "active",
      claims: 0,
      queued: 0,
    }, "unattached generic draft was swept without prior claim provenance");
  }

  function controlledTransaction(
    work: (
      tx: TransactionExecutor,
      ready: () => void,
      hold: Promise<void>,
    ) => Promise<void>,
  ) {
    let release!: () => void;
    let markReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      rejectReady = reject;
    });
    const transaction = sql.begin(async (tx) => {
      try {
        await work(tx, markReady, hold);
      } catch (error) {
        rejectReady(error);
        throw error;
      }
    });
    return { ready, release, transaction };
  }

  async function pendingOutcome(promise: Promise<unknown>): Promise<boolean> {
    const settled = await Promise.race([
      promise.then(() => true, () => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 75)),
    ]);
    return settled === false;
  }

  async function exerciseDeleteClaimRace(): Promise<void> {
    await insertUser(fixtureUsers.raceOwner, "race-owner");
    await insertUser(fixtureUsers.raceSharer, "race-sharer");
    const url = "https://fixture0037.public.blob.vercel-storage.com/e2e/delete-race.webp";
    const key = await insertAsset(url, fixtureUsers.raceOwner);
    await sql`
      UPDATE public.users SET avatar_url = ${url}
      WHERE id IN (${fixtureUsers.raceOwner}::uuid, ${fixtureUsers.raceSharer}::uuid)
    `;

    const ownerDelete = controlledTransaction(async (tx, ready, hold) => {
      await tx`SELECT pg_advisory_xact_lock(1163022925, 37)`;
      await tx`DELETE FROM public.users WHERE id = ${fixtureUsers.raceOwner}::uuid`;
      ready();
      await hold;
    });
    await ownerDelete.ready;
    const lastClaimDelete = sql.begin(async (tx) => {
      await tx`
        UPDATE public.users SET avatar_url = NULL
        WHERE id = ${fixtureUsers.raceSharer}::uuid
      `;
    });
    assert.equal(await pendingOutcome(lastClaimDelete), true,
      "claim deletion did not wait behind account-delete fence");
    ownerDelete.release();
    await Promise.all([ownerDelete.transaction, lastClaimDelete]);

    const [final] = await sql<{ state: string; claims: number; queued: number }[]>`
      SELECT asset.state,
        (SELECT count(*)::integer FROM public.account_blob_asset_claims
          WHERE asset_key = asset.asset_key) AS claims,
        (SELECT count(*)::integer FROM public.account_asset_erasure_outbox
          WHERE asset_key = asset.asset_key) AS queued
      FROM public.account_blob_assets AS asset WHERE asset.asset_key = ${key}
    `;
    assert.deepEqual(final, { state: "queued", claims: 0, queued: 1 },
      "owner-delete/final-claim race lost durable cleanup");
  }

  async function exerciseUserGlobalAssetLockOrder(): Promise<void> {
    await insertUser(fixtureUsers.ordinary, "lock-order-owner");
    const url =
      "https://fixture0037.public.blob.vercel-storage.com/e2e/lock-order.webp";
    const key = await insertAsset(url, fixtureUsers.ordinary);

    const erasure = controlledTransaction(async (tx, ready, hold) => {
      await tx`
        SELECT 1 FROM public.users
        WHERE id = ${fixtureUsers.ordinary}::uuid
        FOR UPDATE
      `;
      ready();
      await hold;
      await tx`SELECT pg_advisory_xact_lock(1163022925, 37)`;
      await tx`
        SELECT 1 FROM public.account_blob_assets
        WHERE asset_key = ${key}
        FOR UPDATE
      `;
    });
    await erasure.ready;

    const claimAttempt = sql.begin(async (tx) => {
      await tx`
        SELECT public.account_blob_record_claim(
          ${url}, 'users', ${fixtureUsers.ordinary}, 'avatar_url',
          ${fixtureUsers.ordinary}::uuid
        )
      `;
    });
    assert.equal(await pendingOutcome(claimAttempt), true,
      "claim helper did not wait on the user lock before global/asset locks");
    erasure.release();
    await Promise.all([erasure.transaction, claimAttempt]);

    const [claim] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM public.account_blob_asset_claims
      WHERE asset_key = ${key}
        AND erasure_user_id = ${fixtureUsers.ordinary}::uuid
    `;
    assert.equal(claim?.count, 1,
      "canonical user -> global advisory -> asset order lost the claim");
  }

  async function exerciseReattachVsQueueRace(): Promise<void> {
    await insertUser(fixtureUsers.attachOwner, "attach-owner");
    await insertUser(fixtureUsers.attachSharer, "attach-sharer");
    const url = "https://fixture0037.public.blob.vercel-storage.com/e2e/attach-race.webp";
    const key = await insertAsset(url, fixtureUsers.attachOwner);

    const orphan = controlledTransaction(async (tx, ready, hold) => {
      await tx`
        UPDATE public.account_blob_assets SET owner_user_id = NULL
        WHERE asset_key = ${key}
      `;
      ready();
      await hold;
    });
    await orphan.ready;
    const claimAttemptPromise = sql.begin(async (tx) => {
      await tx`
        UPDATE public.users SET avatar_url = ${url}
        WHERE id = ${fixtureUsers.attachSharer}::uuid
      `;
    });
    const outcomePromise: Promise<Outcome> = claimAttemptPromise.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    assert.equal(await pendingOutcome(outcomePromise), true,
      "new claim did not wait for registry orphan decision");
    orphan.release();
    await orphan.transaction;
    const outcome = await outcomePromise;
    assert.equal(outcome.ok, false, "queued asset was reattached");
    if (!outcome.ok) {
      assert.equal((outcome.error as { code?: string }).code, "55000");
    }
    const [final] = await sql<{ state: string; claims: number; queued: number }[]>`
      SELECT asset.state,
        (SELECT count(*)::integer FROM public.account_blob_asset_claims
          WHERE asset_key = asset.asset_key) AS claims,
        (SELECT count(*)::integer FROM public.account_asset_erasure_outbox
          WHERE asset_key = asset.asset_key) AS queued
      FROM public.account_blob_assets AS asset WHERE asset.asset_key = ${key}
    `;
    assert.deepEqual(final, { state: "queued", claims: 0, queued: 1 },
      "claim/orphan race produced ambiguous state");
  }

  async function injectRepairableDrift(): Promise<void> {
    await sql.unsafe(`ALTER TABLE public.account_blob_assets DISABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`ALTER TABLE public.account_blob_asset_claims FORCE ROW LEVEL SECURITY`);
    await sql.unsafe(
      `CREATE POLICY epetrecere_0037_drift_policy ON public.account_blob_assets FOR SELECT USING (true)`,
    );
    await sql.unsafe(`
      ALTER TABLE public.account_blob_assets
        DROP CONSTRAINT account_blob_assets_policy_chk,
        ADD CONSTRAINT account_blob_assets_policy_chk CHECK (length(erasure_policy) > 0)
    `);
    await sql.unsafe(`DROP INDEX public.account_blob_assets_owner_active_idx`);
    await sql.unsafe(`
      CREATE INDEX account_blob_assets_owner_active_idx
      ON public.account_blob_assets (provenance)
    `);
    await sql.unsafe(`ALTER FUNCTION public.account_blob_sync_row_claims() SECURITY INVOKER`);
    await sql.unsafe(`ALTER FUNCTION public.account_blob_sync_row_claims() STABLE`);
    await sql.unsafe(`ALTER FUNCTION public.account_blob_sync_row_claims() PARALLEL SAFE`);
    await sql.unsafe(`ALTER FUNCTION public.account_blob_sync_row_claims() RESET ALL`);
    await sql.unsafe(`DROP TRIGGER account_blob_claims_sync_trg ON public.users`);
    await sql.unsafe(`
      CREATE TRIGGER account_blob_claims_sync_trg BEFORE INSERT ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.account_blob_sync_row_claims()
    `);
    for (const table of targetTables) {
      await sql.unsafe(`GRANT SELECT, UPDATE ON TABLE public."${table}" TO "${grandparentRole}"`);
    }
    await sql.unsafe(`
      GRANT SELECT(asset_url), UPDATE(provenance)
      ON TABLE public.account_blob_assets TO "${grandparentRole}"
    `);
    await sql.unsafe(`
      GRANT USAGE, SELECT, UPDATE
      ON SEQUENCE public.${targetSequence} TO "${grandparentRole}"
    `);
    for (const signature of helperSignatures) {
      await sql.unsafe(`GRANT EXECUTE ON FUNCTION public.${signature} TO "${grandparentRole}"`);
    }
  }

  async function runFailClosedProbes(): Promise<void> {
    await expectTransactionalMigrationRejected(
      "0037 extra column",
      /column\/default drift|typmod asset columns/i,
      async (tx) => {
        await tx.unsafe(
          "ALTER TABLE public.account_blob_assets ADD COLUMN epetrecere_0037_extra text",
        );
      },
    );

    await sql.unsafe(`ALTER TABLE public.account_blob_assets ADD CONSTRAINT epetrecere_0037_extra_chk CHECK (true)`);
    expectMigrationRejected(config.url, "0037 extra constraint", /unexpected constraint drift/i);
    await sql.unsafe(`ALTER TABLE public.account_blob_assets DROP CONSTRAINT epetrecere_0037_extra_chk`);

    await sql.unsafe(`CREATE INDEX epetrecere_0037_extra_idx ON public.account_blob_assets (provenance)`);
    expectMigrationRejected(config.url, "0037 extra index", /unexpected index drift/i);
    await sql.unsafe(`DROP INDEX public.epetrecere_0037_extra_idx`);

    await sql.unsafe(`
      CREATE FUNCTION public.account_blob_sync_row_claims(integer)
      RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT $1'
    `);
    expectMigrationRejected(config.url, "0037 helper overload", /missing or overloaded Blob helper functions/i);
    await sql.unsafe(`DROP FUNCTION public.account_blob_sync_row_claims(integer)`);

    await sql.unsafe(`
      CREATE TRIGGER account_blob_unexpected_trg AFTER INSERT
      ON public.account_blob_assets FOR EACH ROW
      EXECUTE FUNCTION public.account_blob_deferred_orphan_check()
    `);
    expectMigrationRejected(config.url, "0037 extra protected trigger", /unexpected registry\/claim\/outbox trigger drift/i);
    await sql.unsafe(`DROP TRIGGER account_blob_unexpected_trg ON public.account_blob_assets`);

    await sql.unsafe(`ALTER SEQUENCE public.${targetSequence} OWNED BY NONE`);
    expectMigrationRejected(config.url, "0037 serial ownership drift", /canonical outbox serial sequence|serial sequence ownership/i);
    await sql.unsafe(`
      ALTER SEQUENCE public.${targetSequence}
      OWNED BY public.account_asset_erasure_outbox.id
    `);

    await expectTransactionalMigrationRejected(
      "0037 serial settings drift",
      /non-canonical outbox serial sequence shape\/ownership/i,
      async (tx) => {
        await tx.unsafe(
          `ALTER SEQUENCE public.${targetSequence} INCREMENT BY 2`,
        );
      },
    );

    await sql.unsafe(`DROP INDEX public.account_blob_assets_owner_idx`);
    await sql.unsafe(`CREATE TABLE public.${lookalikeTable} (id uuid)`);
    await sql.unsafe(`CREATE INDEX account_blob_assets_owner_idx ON public.${lookalikeTable} (id)`);
    expectMigrationRejected(config.url, "0037 foreign same-name index", /refuses named index object/i);
    await sql.unsafe(`DROP INDEX public.account_blob_assets_owner_idx`);
    await sql.unsafe(`DROP TABLE public.${lookalikeTable}`);
    applyMigration(config.url, "0037 restore after lookalike probe");
  }

  try {
    await dropFixtureRoles();
    await assertBaseline();
    applyMigration(config.url, "0037 first apply");
    const first = await catalogSnapshot();
    assertCanonical(first, "first apply");
    await assertBrowserReadBlocked("first apply");

    await cleanupFixtures();
    await exerciseFastPathAndLegacy();
    await cleanupFixtures();
    await exerciseSharedReferenceLifecycle();
    await cleanupFixtures();
    await exerciseLiveOwnerLastClaimCleanup();
    await cleanupFixtures();
    await exerciseUserGlobalAssetLockOrder();
    await cleanupFixtures();
    await exerciseDeleteClaimRace();
    await cleanupFixtures();
    await exerciseReattachVsQueueRace();
    await cleanupFixtures();

    await sql.unsafe(`CREATE ROLE "${parentRole}" NOLOGIN`);
    await sql.unsafe(`CREATE ROLE "${grandparentRole}" NOLOGIN`);
    await sql.unsafe(`GRANT "${parentRole}" TO "anon"`);
    await sql.unsafe(`GRANT "${parentRole}" TO "authenticated"`);
    await sql.unsafe(`GRANT "${grandparentRole}" TO "${parentRole}"`);
    const membershipsBefore = await membershipShape();
    assert.deepEqual(membershipsBefore, [
      `${grandparentRole}->${parentRole}`,
      `${parentRole}->anon`,
      `${parentRole}->authenticated`,
    ]);

    await injectRepairableDrift();
    assert.ok((await privilegeViolations()).length > 0, "ACL drift fixture was ineffective");
    applyMigration(config.url, "0037 reapply after drift");
    const repaired = await catalogSnapshot();
    assertCanonical(repaired, "reapply");
    assertUnchanged(first, repaired, "0037 complete catalog after repair");
    assertUnchanged(membershipsBefore, await membershipShape(), "0037 role memberships");
    await assertBrowserReadBlocked("reapply");

    await runFailClosedProbes();
    const final = await catalogSnapshot();
    assertCanonical(final, "final");
    assertUnchanged(first, final, "0037 final catalog");
    console.log("0037 account asset migration verification passed");
  } finally {
    await cleanupFixtures().catch(() => undefined);
    if (await relationExists(lookalikeTable).catch(() => false)) {
      await sql.unsafe(`DROP TABLE public.${lookalikeTable} CASCADE`).catch(() => undefined);
    }
    await dropFixtureRoles().catch(() => undefined);
    await sql.end({ timeout: 2 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
