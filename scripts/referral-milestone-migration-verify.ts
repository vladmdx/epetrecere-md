/**
 * Verify manual migration 0038 on a guarded disposable loopback database.
 *
 * The guarded runner validates the database-resident marker before importing
 * this module. This verifier requires the exact canonical or validated legacy referral ledger
 * before its milestone arbiter, proves duplicate evidence fails closed, then
 * applies 0038 twice around safe index/RLS/policy/ACL drift and compares the
 * complete catalog and financial state.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0038 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0038_referral_event_atomicity.sql";
const targetTable = "referral_events";
const targetSequence = "referral_events_id_seq";
const targetIndex = "referral_events_milestone_uidx";
const parentRole = "epetrecere_0038_browser_parent";
const grandparentRole = "epetrecere_0038_browser_grandparent";
const driftPolicy = "epetrecere_0038_drift_policy";
const lookalikeTable = "epetrecere_0038_index_lookalike";
const fixtureReferrer = "00000000-0000-4000-8000-000000003801";
const fixtureReferred = "00000000-0000-4000-8000-000000003802";
const fixtureEventIds = [-380002, -380001] as const;
const gdprReferrer = "00000000-0000-4000-8000-000000003803";
const gdprReferred = "00000000-0000-4000-8000-000000003804";
const gdprEventId = -380003;
const graphUsers = [
  {
    id: "00000000-0000-4000-8000-000000003811",
    clerkId: "e2e_0038_graph_a",
    email: "e2e-0038-graph-a@example.invalid",
    code: "graph0038a",
  },
  {
    id: "00000000-0000-4000-8000-000000003812",
    clerkId: "e2e_0038_graph_b",
    email: "e2e-0038-graph-b@example.invalid",
    code: "graph0038b",
  },
  {
    id: "00000000-0000-4000-8000-000000003813",
    clerkId: "e2e_0038_graph_c",
    email: "e2e-0038-graph-c@example.invalid",
    code: "graph0038c",
  },
] as const;
const legacyDepthUsers = Array.from({ length: 66 }, (_, index) => {
  const ordinal = String(index).padStart(2, "0");
  const uuidSuffix = (3900 + index).toString(16).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${uuidSuffix}`,
    clerkId: `e2e_0038_depth_${ordinal}`,
    email: `e2e-0038-depth-${ordinal}@example.invalid`,
    code: `depth0038-${ordinal}`,
  };
});
const auditedRoles = [
  "anon",
  "authenticated",
  parentRole,
  grandparentRole,
] as const;

type ColumnShape = {
  columnName: string;
  dataType: string;
  nullable: "YES" | "NO";
  defaultValue: string | null;
  identity: "YES" | "NO";
  generated: "ALWAYS" | "NEVER";
};

type ConstraintShape = {
  constraintName: string;
  constraintType: string;
  sourceColumns: string[];
  targetTable: string | null;
  targetColumns: string[];
  deleteAction: string;
  updateAction: string;
  matchType: string;
  valid: boolean;
  noInherit: boolean;
  deferrable: boolean;
  deferred: boolean;
  local: boolean;
  inheritanceCount: number;
  parentConstraintOid: number;
};

type IndexShape = {
  indexName: string;
  definition: string;
  indexKind: string;
  indexOwner: string;
  tableOwner: string;
  accessMethod: string;
  keyColumns: string[];
  opclasses: string[];
  options: number[];
  predicate: string | null;
  unique: boolean;
  primary: boolean;
  exclusion: boolean;
  immediate: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  clustered: boolean;
  replicaIdentity: boolean;
  nullsNotDistinct: boolean;
  expressionFree: boolean;
  usesColumnCollations: boolean;
  opclassesDefault: boolean;
  opclassesMatchInput: boolean;
  keyCount: number;
  attributeCount: number;
  constraintBackedCount: number;
  tablespaceOid: number;
  relationOptions: string[] | null;
};

type RelationShape = {
  relationKind: string;
  relationPersistence: string;
  partition: boolean;
  inheritanceEdges: number;
  ownerName: string;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
  policyCount: number;
  tableAcl: string | null;
  columnAcls: string[];
  droppedColumnCount: number;
  nonCanonicalColumnMetadataCount: number;
  serialSequence: string | null;
  sequenceKind: string | null;
  sequencePersistence: string | null;
  sequenceOwner: string | null;
  sequenceAcl: string | null;
  serialDependencyCount: number;
  ownedSequenceCount: number;
};

type PrivilegeViolation = {
  roleName: string;
  objectKind: "table" | "column" | "sequence";
  objectName: string;
  privilege: string;
};

type FinancialSnapshot = {
  eventCount: number;
  creditTotal: string;
  userCreditTotal: string;
};

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
      throw new Error(
        `${label}: rejected for an unexpected reason\n${output}`,
        {
          cause: error,
        },
      );
    }
    console.log(`-- ${label}: rejected as expected`);
    return;
  }
  throw new Error(`${label}: incompatible state was unexpectedly accepted`);
}

function assertExactStrings(
  actual: string[],
  expected: string[],
  label: string,
): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expectedSorted)}, got ${JSON.stringify(actualSorted)}`,
    );
  }
}

function assertUnchanged<T>(before: T, after: T, label: string): void {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      `${label} changed:\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(after)}`,
    );
  }
}

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "Do not apply to Preview/Production without an explicit rollout",
    "0038 depends only on the canonical pre-index referral schema, not on 0037",
    "0038 requires the Supabase anon and authenticated roles",
    "SELECT pg_advisory_xact_lock(280044, 0)",
    "LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE",
    "LOCK TABLE public.referral_events IN ACCESS EXCLUSIVE MODE",
    "0038 found a cyclic or over-depth legacy referral graph",
    "0038 found duplicate referral milestones",
    "Do not delete, merge, or adjust referral evidence automatically",
    "0038 refuses a same-name object not indexing public.referral_events",
    "0038 failed to install the exact unique btree referral milestone arbiter",
    "WITH RECURSIVE browser_role_tree",
    "ENABLE ROW LEVEL SECURITY",
    "NO FORCE ROW LEVEL SECURITY",
    "REVOKE ALL PRIVILEGES ON SEQUENCE public.referral_events_id_seq",
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0038 source guarantee missing: ${guarantee}`);
    }
  }
  if (/^\s*(?:INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\b)/im.test(source)) {
    throw new Error("0038 migration must not insert/delete financial evidence");
  }
  const updateStatements = source.match(/^\s*UPDATE\s+public\.referral_events\b/gim);
  if (
    updateStatements?.length !== 1
    || !/UPDATE public\.referral_events[\s\S]*SET metadata = CASE[\s\S]*recoveredBy[\s\S]*onboarding_reconciler[\s\S]*ELSE '\{\}'::jsonb/.test(source)
    || /SET\s+(?:credit_cents|event_type|referrer_user_id|referred_user_id|created_at)\s*=/i.test(source)
  ) {
    throw new Error("0038 permits only the bounded metadata minimization UPDATE");
  }

  const sql = postgres(config.url, {
    max: 1,
    prepare: false,
    ssl: false,
  });
  const migrationBody = source
    .replace(/^BEGIN;\s*/i, "")
    .replace(/\s*COMMIT;\s*$/i, "");

  async function expectTransactionalDriftRejected(
    label: string,
    setupStatement: string,
    expectedFailure: RegExp,
  ): Promise<void> {
    try {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(setupStatement);
        await transaction.unsafe(migrationBody);
      });
    } catch (error) {
      const output = [
        (error as Error).message,
        (error as { detail?: string }).detail,
        (error as { hint?: string }).hint,
      ]
        .filter(Boolean)
        .join("\n");
      if (!expectedFailure.test(output)) {
        throw new Error(
          `${label}: rejected for an unexpected reason\n${output}`,
          {
            cause: error,
          },
        );
      }
      console.log(`-- ${label}: rejected and rolled back as expected`);
      return;
    }
    throw new Error(`${label}: incompatible catalog drift was accepted`);
  }

  async function roleExists(roleName: string): Promise<boolean> {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${roleName}
      ) AS exists
    `;
    return row?.exists === true;
  }

  async function relationExists(relationName: string): Promise<boolean> {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass(format('public.%I', ${relationName}::text)) IS NOT NULL
        AS exists
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

  async function cleanupDuplicateFixture(): Promise<void> {
    await sql`
      DELETE FROM public.referral_events
      WHERE id IN (${fixtureEventIds[0]}, ${fixtureEventIds[1]}, ${gdprEventId})
    `;
    await sql`
      DELETE FROM public.users
      WHERE id IN (
        ${fixtureReferrer}::uuid, ${fixtureReferred}::uuid,
        ${gdprReferrer}::uuid, ${gdprReferred}::uuid,
        ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
        ${graphUsers[2].id}::uuid
      )
        OR starts_with(clerk_id, 'e2e_0038_depth_')
    `;
  }

  async function dropLookalikeTable(): Promise<void> {
    if (await relationExists(lookalikeTable)) {
      await sql.unsafe(`DROP TABLE public."${lookalikeTable}"`);
    }
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
      ), table_privileges(privilege) AS (
        SELECT DISTINCT supported_privilege.privilege_type
        FROM pg_class AS target_relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          pg_catalog.acldefault('r', target_relation.relowner)
        ) AS supported_privilege
        WHERE target_relation.oid = 'public.referral_events'::regclass
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ]::text[])
      ), sequence_privileges(privilege) AS (
        SELECT DISTINCT supported_privilege.privilege_type
        FROM pg_class AS target_sequence
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          pg_catalog.acldefault('s', target_sequence.relowner)
        ) AS supported_privilege
        WHERE target_sequence.oid = 'public.referral_events_id_seq'::regclass
      )
      SELECT target_role.role_name AS "roleName",
        'table'::text AS "objectKind",
        'public.referral_events'::text AS "objectName",
        table_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN table_privileges AS table_privilege
      WHERE has_table_privilege(
        role.rolname,
        'public.referral_events',
        table_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name,
        'column',
        format('public.referral_events.%I', column_info.column_name),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = 'referral_events'
        AND has_column_privilege(
          role.rolname,
          'public.referral_events',
          column_info.column_name,
          column_privilege.privilege
        )
      UNION ALL
      SELECT target_role.role_name,
        'sequence',
        'public.referral_events_id_seq',
        sequence_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN sequence_privileges AS sequence_privilege
      WHERE has_sequence_privilege(
        role.rolname,
        'public.referral_events_id_seq',
        sequence_privilege.privilege
      )
      ORDER BY 1, 2, 3, 4
    `;
  }

  async function financialSnapshot(): Promise<FinancialSnapshot> {
    const [snapshot] = await sql<FinancialSnapshot[]>`
      SELECT
        (SELECT count(*)::int FROM public.referral_events) AS "eventCount",
        (
          SELECT coalesce(sum(credit_cents), 0)::text
          FROM public.referral_events
        ) AS "creditTotal",
        (
          SELECT coalesce(sum(referral_credit_cents), 0)::text
          FROM public.users
        ) AS "userCreditTotal"
    `;
    if (!snapshot) throw new Error("0038 could not snapshot referral finances");
    return snapshot;
  }

  async function unrelatedSecurityShape() {
    const relation = await sql<
      {
        rowSecurity: boolean;
        forceRowSecurity: boolean;
        tableAcl: string | null;
      }[]
    >`
      SELECT relrowsecurity AS "rowSecurity",
        relforcerowsecurity AS "forceRowSecurity",
        relacl::text AS "tableAcl"
      FROM pg_class
      WHERE oid = 'public.users'::regclass
    `;
    const policies = await sql<
      {
        policyName: string;
        command: string;
        permissive: boolean;
        roles: string;
        usingExpression: string | null;
        checkExpression: string | null;
      }[]
    >`
      SELECT polname AS "policyName",
        polcmd::text AS command,
        polpermissive AS permissive,
        polroles::text AS roles,
        pg_get_expr(polqual, polrelid) AS "usingExpression",
        pg_get_expr(polwithcheck, polrelid) AS "checkExpression"
      FROM pg_policy
      WHERE polrelid = 'public.users'::regclass
      ORDER BY polname
    `;
    const columnAcls = await sql<{ columnName: string; acl: string | null }[]>`
      SELECT attname AS "columnName", attacl::text AS acl
      FROM pg_attribute
      WHERE attrelid = 'public.users'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    `;
    return { relation, policies, columnAcls };
  }

  async function currentShape() {
    const columns = await sql<ColumnShape[]>`
      SELECT column_name AS "columnName",
        data_type AS "dataType",
        is_nullable AS nullable,
        column_default AS "defaultValue",
        is_identity AS identity,
        is_generated AS generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'referral_events'
      ORDER BY column_name
    `;

    const constraints = await sql<ConstraintShape[]>`
      SELECT constraint_row.conname AS "constraintName",
        constraint_row.contype::text AS "constraintType",
        ARRAY(
          SELECT source_attribute.attname::text
          FROM unnest(constraint_row.conkey)
            WITH ORDINALITY AS key_position(attnum, position)
          JOIN pg_attribute AS source_attribute
            ON source_attribute.attrelid = constraint_row.conrelid
           AND source_attribute.attnum = key_position.attnum
          ORDER BY key_position.position
        ) AS "sourceColumns",
        target_relation.relname AS "targetTable",
        ARRAY(
          SELECT target_attribute.attname::text
          FROM unnest(constraint_row.confkey)
            WITH ORDINALITY AS key_position(attnum, position)
          JOIN pg_attribute AS target_attribute
            ON target_attribute.attrelid = constraint_row.confrelid
           AND target_attribute.attnum = key_position.attnum
          ORDER BY key_position.position
        ) AS "targetColumns",
        constraint_row.confdeltype::text AS "deleteAction",
        constraint_row.confupdtype::text AS "updateAction",
        constraint_row.confmatchtype::text AS "matchType",
        constraint_row.convalidated AS valid,
        constraint_row.connoinherit AS "noInherit",
        constraint_row.condeferrable AS deferrable,
        constraint_row.condeferred AS deferred,
        constraint_row.conislocal AS local,
        constraint_row.coninhcount::int AS "inheritanceCount",
        constraint_row.conparentid::int AS "parentConstraintOid"
      FROM pg_constraint AS constraint_row
      LEFT JOIN pg_class AS target_relation
        ON target_relation.oid = constraint_row.confrelid
      WHERE constraint_row.conrelid = 'public.referral_events'::regclass
      ORDER BY constraint_row.conname
    `;

    const indexes = await sql<IndexShape[]>`
      SELECT index_relation.relname AS "indexName",
        lower(pg_get_indexdef(index_relation.oid)) AS definition,
        index_relation.relkind::text AS "indexKind",
        index_owner.rolname AS "indexOwner",
        table_owner.rolname AS "tableOwner",
        access_method.amname AS "accessMethod",
        ARRAY(
          SELECT attribute.attname::text
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          ORDER BY key_position.position
        ) AS "keyColumns",
        ARRAY(
          SELECT operator_class.opcname::text
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
          ORDER BY key_position.position
        ) AS opclasses,
        ARRAY(
          SELECT index_catalog.indoption[key_position.position]::int
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          ORDER BY key_position.position
        ) AS options,
        CASE WHEN index_catalog.indpred IS NULL THEN NULL ELSE regexp_replace(
          lower(pg_get_expr(index_catalog.indpred, index_catalog.indrelid)),
          '[[:space:]()]', '', 'g'
        ) END AS predicate,
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
        index_catalog.indexprs IS NULL AS "expressionFree",
        NOT EXISTS (
          SELECT 1
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          WHERE index_catalog.indcollation[key_position.position]
            IS DISTINCT FROM attribute.attcollation
        ) AS "usesColumnCollations",
        (
          SELECT bool_and(operator_class.opcdefault)
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
        ) AS "opclassesDefault",
        NOT EXISTS (
          SELECT 1
          FROM generate_series(0, index_catalog.indnkeyatts - 1)
            AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
          WHERE operator_class.opcmethod <> access_method.oid
             OR operator_class.opcintype <> attribute.atttypid
        ) AS "opclassesMatchInput",
        index_catalog.indnkeyatts::int AS "keyCount",
        index_catalog.indnatts::int AS "attributeCount",
        (
          SELECT count(*)::int
          FROM pg_constraint AS constraint_row
          WHERE constraint_row.conindid = index_catalog.indexrelid
        ) AS "constraintBackedCount",
        index_relation.reltablespace::int AS "tablespaceOid",
        index_relation.reloptions AS "relationOptions"
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation
        ON index_relation.oid = index_catalog.indexrelid
      JOIN pg_class AS table_relation
        ON table_relation.oid = index_catalog.indrelid
      JOIN pg_roles AS index_owner ON index_owner.oid = index_relation.relowner
      JOIN pg_roles AS table_owner ON table_owner.oid = table_relation.relowner
      JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
      WHERE index_catalog.indrelid = 'public.referral_events'::regclass
      ORDER BY index_relation.relname
    `;

    const [relation] = await sql<RelationShape[]>`
      SELECT target_relation.relkind::text AS "relationKind",
        target_relation.relpersistence::text AS "relationPersistence",
        target_relation.relispartition AS partition,
        (
          SELECT count(*)::int
          FROM pg_inherits
          WHERE inhrelid = target_relation.oid OR inhparent = target_relation.oid
        ) AS "inheritanceEdges",
        table_owner.rolname AS "ownerName",
        target_relation.relrowsecurity AS "rowSecurity",
        target_relation.relforcerowsecurity AS "forceRowSecurity",
        (SELECT count(*)::int FROM pg_policy WHERE polrelid = target_relation.oid)
          AS "policyCount",
        target_relation.relacl::text AS "tableAcl",
        ARRAY(
          SELECT attribute.attname || ':' || coalesce(attribute.attacl::text, '<null>')
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = target_relation.oid
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
          ORDER BY attribute.attnum
        ) AS "columnAcls",
        (
          SELECT count(*)::int FROM pg_attribute
          WHERE attrelid = target_relation.oid AND attnum > 0 AND attisdropped
        ) AS "droppedColumnCount",
        (
          SELECT count(*)::int
          FROM pg_attribute
          WHERE attrelid = target_relation.oid
            AND attnum > 0
            AND NOT attisdropped
            AND (
              attidentity <> '' OR attgenerated <> '' OR atttypmod <> -1
              OR attinhcount <> 0 OR NOT attislocal
            )
        ) AS "nonCanonicalColumnMetadataCount",
        pg_get_serial_sequence('public.referral_events', 'id') AS "serialSequence",
        sequence_relation.relkind::text AS "sequenceKind",
        sequence_relation.relpersistence::text AS "sequencePersistence",
        sequence_owner.rolname AS "sequenceOwner",
        sequence_relation.relacl::text AS "sequenceAcl",
        (
          SELECT count(*)::int
          FROM pg_depend AS dependency
          JOIN pg_attribute AS id_attribute
            ON id_attribute.attrelid = target_relation.oid
           AND id_attribute.attname = 'id'
           AND id_attribute.attnum = dependency.refobjsubid
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.objid = sequence_relation.oid
            AND dependency.refclassid = 'pg_class'::regclass
            AND dependency.refobjid = target_relation.oid
            AND dependency.deptype = 'a'
        ) AS "serialDependencyCount",
        (
          SELECT count(*)::int
          FROM pg_depend AS dependency
          JOIN pg_class AS owned_relation
            ON owned_relation.oid = dependency.objid
           AND owned_relation.relkind = 'S'
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.refclassid = 'pg_class'::regclass
            AND dependency.refobjid = target_relation.oid
            AND dependency.deptype IN ('a', 'i')
        ) AS "ownedSequenceCount"
      FROM pg_class AS target_relation
      JOIN pg_roles AS table_owner ON table_owner.oid = target_relation.relowner
      LEFT JOIN pg_class AS sequence_relation
        ON sequence_relation.oid = to_regclass('public.referral_events_id_seq')
      LEFT JOIN pg_roles AS sequence_owner
        ON sequence_owner.oid = sequence_relation.relowner
      WHERE target_relation.oid = 'public.referral_events'::regclass
    `;

    const privileges = await privilegeViolations();
    return { columns, constraints, indexes, relation, privileges };
  }

  function assertStructure(
    shape: Awaited<ReturnType<typeof currentShape>>,
    mode: "baseline" | "baselineLegacy" | "hardened",
    label: string,
  ): void {
    const actualColumns = shape.columns.map((column) => {
      const normalizedDefault =
        column.defaultValue?.replace(
          "'public.referral_events_id_seq'",
          "'referral_events_id_seq'",
        ) ?? "<none>";
      return [
        column.columnName,
        column.dataType,
        column.nullable,
        normalizedDefault,
        column.identity,
        column.generated,
      ].join(":");
    });
    assertExactStrings(
      actualColumns,
      [
        "created_at:timestamp without time zone:NO:now():NO:NEVER",
        "credit_cents:integer:NO:0:NO:NEVER",
        "event_type:text:NO:<none>:NO:NEVER",
        "id:integer:NO:nextval('referral_events_id_seq'::regclass):NO:NEVER",
        "metadata:jsonb:YES:'{}'::jsonb:NO:NEVER",
        `referred_user_id:uuid:${mode !== "hardened" ? "NO" : "YES"}:<none>:NO:NEVER`,
        `referrer_user_id:uuid:${mode !== "hardened" ? "NO" : "YES"}:<none>:NO:NEVER`,
      ],
      `${label} columns`,
    );

    if (
      !shape.relation ||
      shape.relation.relationKind !== "r" ||
      shape.relation.relationPersistence !== "p" ||
      shape.relation.partition ||
      shape.relation.inheritanceEdges !== 0 ||
      shape.relation.droppedColumnCount !== 0 ||
      shape.relation.nonCanonicalColumnMetadataCount !== 0 ||
      shape.relation.serialSequence !== "public.referral_events_id_seq" ||
      shape.relation.sequenceKind !== "S" ||
      shape.relation.sequencePersistence !== "p" ||
      shape.relation.sequenceOwner !== shape.relation.ownerName ||
      shape.relation.serialDependencyCount !== 1 ||
      shape.relation.ownedSequenceCount !== 1 ||
      shape.relation.policyCount !== 0 ||
      (mode !== "hardened" &&
        (shape.relation.rowSecurity || shape.relation.forceRowSecurity)) ||
      (mode === "hardened" &&
        (!shape.relation.rowSecurity || shape.relation.forceRowSecurity))
    ) {
      throw new Error(
        `${label}: non-canonical relation/security/serial shape ${JSON.stringify(shape.relation)}`,
      );
    }

    const expectedConstraints = new Map<
      string,
      {
        type: string;
        source: string[];
        target: string | null;
        targetColumns: string[];
        deleteAction: string;
      }
    >([
      [
        "referral_events_pkey",
        {
          type: "p",
          source: ["id"],
          target: null,
          targetColumns: [],
          deleteAction: " ",
        },
      ],
      [
        mode === "baselineLegacy"
          ? "referral_events_referred_user_id_fkey"
          : "referral_events_referred_user_id_users_id_fk",
        {
          type: "f",
          source: ["referred_user_id"],
          target: "users",
          targetColumns: ["id"],
          deleteAction: mode !== "hardened" ? "c" : "n",
        },
      ],
      [
        mode === "baselineLegacy"
          ? "referral_events_referrer_user_id_fkey"
          : "referral_events_referrer_user_id_users_id_fk",
        {
          type: "f",
          source: ["referrer_user_id"],
          target: "users",
          targetColumns: ["id"],
          deleteAction: mode !== "hardened" ? "c" : "n",
        },
      ],
    ]);
    if (mode === "baselineLegacy") {
      expectedConstraints.set(
        "referral_events_referrer_user_id_referred_user_id_event_typ_key",
        {
          type: "u",
          source: ["referrer_user_id", "referred_user_id", "event_type"],
          target: null,
          targetColumns: [],
          deleteAction: " ",
        },
      );
    }
    if (shape.constraints.length !== expectedConstraints.size) {
      throw new Error(
        `${label}: wrong constraints ${JSON.stringify(shape.constraints)}`,
      );
    }
    for (const constraint of shape.constraints) {
      const expected = expectedConstraints.get(constraint.constraintName);
      if (
        !expected ||
        constraint.constraintType !== expected.type ||
        JSON.stringify(constraint.sourceColumns) !==
          JSON.stringify(expected.source) ||
        constraint.targetTable !== expected.target ||
        JSON.stringify(constraint.targetColumns) !==
          JSON.stringify(expected.targetColumns) ||
        (constraint.constraintType === "f" &&
          (constraint.deleteAction !== expected.deleteAction ||
            constraint.updateAction !== "a" ||
            constraint.matchType !== "s")) ||
        !constraint.valid ||
        !constraint.noInherit ||
        constraint.deferrable ||
        constraint.deferred ||
        !constraint.local ||
        constraint.inheritanceCount !== 0 ||
        constraint.parentConstraintOid !== 0
      ) {
        throw new Error(
          `${label}: non-canonical constraint ${JSON.stringify(constraint)}`,
        );
      }
    }

    const expectedIndexes = new Map<
      string,
      {
        columns: string[];
        opclasses: string[];
        unique: boolean;
        primary: boolean;
        constraintBacked: number;
      }
    >([
      [
        "idx_referral_referred",
        {
          columns: ["referred_user_id"],
          opclasses: ["uuid_ops"],
          unique: false,
          primary: false,
          constraintBacked: 0,
        },
      ],
      [
        "idx_referral_referrer",
        {
          columns: ["referrer_user_id", "created_at"],
          opclasses: ["uuid_ops", "timestamp_ops"],
          unique: false,
          primary: false,
          constraintBacked: 0,
        },
      ],
      [
        "referral_events_pkey",
        {
          columns: ["id"],
          opclasses: ["int4_ops"],
          unique: true,
          primary: true,
          constraintBacked: 1,
        },
      ],
    ]);
    if (mode === "baselineLegacy") {
      expectedIndexes.set(
        "referral_events_referrer_user_id_referred_user_id_event_typ_key",
        {
          columns: ["referrer_user_id", "referred_user_id", "event_type"],
          opclasses: ["uuid_ops", "uuid_ops", "text_ops"],
          unique: true,
          primary: false,
          constraintBacked: 1,
        },
      );
    }
    if (mode === "hardened") {
      expectedIndexes.set(targetIndex, {
        columns: ["referrer_user_id", "referred_user_id", "event_type"],
        opclasses: ["uuid_ops", "uuid_ops", "text_ops"],
        unique: true,
        primary: false,
        constraintBacked: 0,
      });
    }
    if (shape.indexes.length !== expectedIndexes.size) {
      throw new Error(
        `${label}: wrong indexes ${JSON.stringify(shape.indexes)}`,
      );
    }
    for (const index of shape.indexes) {
      const expected = expectedIndexes.get(index.indexName);
      if (
        !expected ||
        index.indexKind !== "i" ||
        index.indexOwner !== index.tableOwner ||
        index.accessMethod !== "btree" ||
        JSON.stringify(index.keyColumns) !== JSON.stringify(expected.columns) ||
        JSON.stringify(index.opclasses) !==
          JSON.stringify(expected.opclasses) ||
        index.options.some((option) => option !== 0) ||
        index.predicate !== null ||
        index.unique !== expected.unique ||
        index.primary !== expected.primary ||
        index.exclusion ||
        !index.immediate ||
        !index.valid ||
        !index.ready ||
        !index.live ||
        index.clustered ||
        index.replicaIdentity ||
        index.nullsNotDistinct ||
        !index.expressionFree ||
        !index.usesColumnCollations ||
        !index.opclassesDefault ||
        !index.opclassesMatchInput ||
        index.keyCount !== expected.columns.length ||
        index.attributeCount !== expected.columns.length ||
        index.constraintBackedCount !== expected.constraintBacked ||
        index.tablespaceOid !== 0 ||
        index.relationOptions !== null
      ) {
        throw new Error(
          `${label}: non-canonical index ${JSON.stringify(index)}`,
        );
      }
    }

    if (mode === "hardened" && shape.privileges.length !== 0) {
      throw new Error(
        `${label}: effective Data API privileges remain ${JSON.stringify(shape.privileges)}`,
      );
    }
  }

  async function assertAuditedRolesCannotAccess(label: string): Promise<void> {
    for (const role of auditedRoles) {
      if (!(await roleExists(role))) continue;

      let tableBlocked = false;
      await sql`BEGIN`;
      try {
        await sql.unsafe(`SET LOCAL ROLE "${role}"`);
        await sql`SELECT id FROM public.referral_events LIMIT 0`;
      } catch (error) {
        tableBlocked = (error as { code?: string }).code === "42501";
      } finally {
        await sql`ROLLBACK`;
      }
      if (!tableBlocked) {
        throw new Error(
          `${label}: SET ROLE ${role} could read referral events`,
        );
      }

      let sequenceBlocked = false;
      await sql`BEGIN`;
      try {
        await sql.unsafe(`SET LOCAL ROLE "${role}"`);
        await sql`SELECT nextval('public.referral_events_id_seq')`;
      } catch (error) {
        sequenceBlocked = (error as { code?: string }).code === "42501";
      } finally {
        await sql`ROLLBACK`;
      }
      if (!sequenceBlocked) {
        throw new Error(
          `${label}: SET ROLE ${role} could use referral sequence`,
        );
      }
    }
  }

  async function seedDuplicateFixture(): Promise<void> {
    await sql`
      INSERT INTO public.users (id, clerk_id, email, referral_credit_cents)
      VALUES
        (${fixtureReferrer}::uuid, 'e2e_0038_referrer',
          'e2e-0038-referrer@example.invalid', 381),
        (${fixtureReferred}::uuid, 'e2e_0038_referred',
          'e2e-0038-referred@example.invalid', 382)
    `;
    await sql`
      INSERT INTO public.referral_events (
        id, referrer_user_id, referred_user_id, event_type,
        credit_cents, metadata, created_at
      ) VALUES
        (${fixtureEventIds[0]}, ${fixtureReferrer}::uuid,
          ${fixtureReferred}::uuid, 'onboarded', 700,
          '{"fixture":"0038-a"}'::jsonb, '2026-09-14 08:00:00'::timestamp),
        (${fixtureEventIds[1]}, ${fixtureReferrer}::uuid,
          ${fixtureReferred}::uuid, 'onboarded', 800,
          '{"fixture":"0038-b"}'::jsonb, '2026-09-14 08:01:00'::timestamp)
    `;
  }

  async function verifyLegacyGraphFailsClosed(): Promise<void> {
    const cleanGraphUsers = async () => {
      await sql`
        DELETE FROM public.users
        WHERE id IN (
          ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
          ${graphUsers[2].id}::uuid
        )
          OR starts_with(clerk_id, 'e2e_0038_depth_')
      `;
    };

    await sql`
      INSERT INTO public.users (
        id, clerk_id, email, referral_code, referred_by_code,
        referral_credit_cents
      ) VALUES
        (${graphUsers[0].id}::uuid, ${graphUsers[0].clerkId},
          ${graphUsers[0].email}, ${graphUsers[0].code}, ${graphUsers[1].code}, 0),
        (${graphUsers[1].id}::uuid, ${graphUsers[1].clerkId},
          ${graphUsers[1].email}, ${graphUsers[1].code}, ${graphUsers[0].code}, 0)
    `;
    const cycleFinancial = await financialSnapshot();
    expectMigrationRejected(
      config.url,
      "0038 legacy referral-cycle fail-closed probe",
      /cyclic or over-depth legacy referral graph/i,
    );
    assertUnchanged(
      cycleFinancial,
      await financialSnapshot(),
      "0038 rejected legacy cycle financial evidence",
    );
    await cleanGraphUsers();

    for (let index = 0; index < legacyDepthUsers.length; index++) {
      const user = legacyDepthUsers[index];
      const nextCode = legacyDepthUsers[index + 1]?.code ?? null;
      await sql`
        INSERT INTO public.users (
          id, clerk_id, email, referral_code, referred_by_code,
          referral_credit_cents
        ) VALUES (
          ${user.id}::uuid, ${user.clerkId}, ${user.email}, ${user.code},
          ${nextCode}, 0
        )
      `;
    }
    const depthFinancial = await financialSnapshot();
    expectMigrationRejected(
      config.url,
      "0038 over-depth referral-chain fail-closed probe",
      /cyclic or over-depth legacy referral graph/i,
    );
    assertUnchanged(
      depthFinancial,
      await financialSnapshot(),
      "0038 rejected over-depth graph financial evidence",
    );
    await cleanGraphUsers();
  }

  async function verifyGdprLedgerPreservation(): Promise<void> {
    await sql`
      INSERT INTO public.users (id, clerk_id, email, referral_credit_cents)
      VALUES
        (${gdprReferrer}::uuid, 'e2e_0038_gdpr_referrer',
          'e2e-0038-gdpr-referrer@example.invalid', 1234),
        (${gdprReferred}::uuid, 'e2e_0038_gdpr_referred',
          'e2e-0038-gdpr-referred@example.invalid', 0)
    `;
    await sql`
      INSERT INTO public.referral_events (
        id, referrer_user_id, referred_user_id, event_type,
        credit_cents, metadata, created_at
      ) VALUES (
        ${gdprEventId}, ${gdprReferrer}::uuid, ${gdprReferred}::uuid,
        'first_booking', 500, '{}'::jsonb,
        '2026-09-14 09:00:00'::timestamp
      )
    `;

    await sql`DELETE FROM public.users WHERE id = ${gdprReferred}::uuid`;
    const [afterReferredDeletion] = await sql<
      {
        referrerUserId: string | null;
        referredUserId: string | null;
        eventType: string;
        creditCents: number;
        metadata: string;
        createdAt: string;
      }[]
    >`
      SELECT referrer_user_id::text AS "referrerUserId",
        referred_user_id::text AS "referredUserId",
        event_type AS "eventType",
        credit_cents AS "creditCents",
        metadata::text AS metadata,
        created_at::text AS "createdAt"
      FROM public.referral_events
      WHERE id = ${gdprEventId}
    `;
    const [referrerBalance] = await sql<{ credit: number }[]>`
      SELECT referral_credit_cents AS credit
      FROM public.users
      WHERE id = ${gdprReferrer}::uuid
    `;
    if (
      afterReferredDeletion?.referrerUserId !== gdprReferrer ||
      afterReferredDeletion.referredUserId !== null ||
      afterReferredDeletion.eventType !== "first_booking" ||
      afterReferredDeletion.creditCents !== 500 ||
      afterReferredDeletion.metadata !== '{}' ||
      afterReferredDeletion.createdAt !== "2026-09-14 09:00:00" ||
      referrerBalance?.credit !== 1234
    ) {
      throw new Error(
        `0038 referee erasure did not preserve ledger/balance: ${JSON.stringify({ afterReferredDeletion, referrerBalance })}`,
      );
    }

    await sql`DELETE FROM public.users WHERE id = ${gdprReferrer}::uuid`;
    const [afterReferrerDeletion] = await sql<
      {
        referrerUserId: string | null;
        referredUserId: string | null;
        eventType: string;
        creditCents: number;
        metadata: string;
        createdAt: string;
      }[]
    >`
      SELECT referrer_user_id::text AS "referrerUserId",
        referred_user_id::text AS "referredUserId",
        event_type AS "eventType",
        credit_cents AS "creditCents",
        metadata::text AS metadata,
        created_at::text AS "createdAt"
      FROM public.referral_events
      WHERE id = ${gdprEventId}
    `;
    if (
      afterReferrerDeletion?.referrerUserId !== null ||
      afterReferrerDeletion.referredUserId !== null ||
      afterReferrerDeletion.eventType !== "first_booking" ||
      afterReferrerDeletion.creditCents !== 500 ||
      afterReferrerDeletion.metadata !== '{}' ||
      afterReferrerDeletion.createdAt !== "2026-09-14 09:00:00"
    ) {
      throw new Error(
        `0038 referrer erasure did not preserve ledger: ${JSON.stringify(afterReferrerDeletion)}`,
      );
    }

    await sql`DELETE FROM public.referral_events WHERE id = ${gdprEventId}`;
  }

  async function verifyReferralCycleProtection(): Promise<void> {
    const [{ db: applicationDb }, { captureReferralAttribution }] =
      await Promise.all([
        import("../src/lib/db"),
        import("../src/lib/referrals/capture"),
      ]);

    const capture = (userIndex: 0 | 1 | 2, referrerIndex: 0 | 1 | 2) => {
      const user = graphUsers[userIndex];
      const referrer = graphUsers[referrerIndex];
      return applicationDb.transaction((tx) =>
        captureReferralAttribution(tx as unknown as typeof applicationDb, {
          userId: user.id,
          clerkId: user.clerkId,
          referrerId: referrer.id,
          cleanCode: referrer.code,
        }),
      );
    };
    const resetEdges = () => sql`
      UPDATE public.users
      SET referred_by_code = NULL
      WHERE id IN (
        ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
        ${graphUsers[2].id}::uuid
      )
        OR starts_with(clerk_id, 'e2e_0038_depth_')
    `;
    const edgeCount = async (): Promise<number> => {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM public.users
        WHERE id IN (
          ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
          ${graphUsers[2].id}::uuid
        )
          AND referred_by_code IS NOT NULL
      `;
      return row?.count ?? -1;
    };

    await sql`
      INSERT INTO public.users (
        id, clerk_id, email, referral_code, referral_credit_cents
      ) VALUES
        (${graphUsers[0].id}::uuid, ${graphUsers[0].clerkId},
          ${graphUsers[0].email}, ${graphUsers[0].code}, 0),
        (${graphUsers[1].id}::uuid, ${graphUsers[1].clerkId},
          ${graphUsers[1].email}, ${graphUsers[1].code}, 0),
        (${graphUsers[2].id}::uuid, ${graphUsers[2].clerkId},
          ${graphUsers[2].email}, ${graphUsers[2].code}, 0)
    `;

    try {
      const firstSequential = await capture(0, 1);
      const secondSequential = await capture(1, 0);
      if (
        firstSequential.status !== "captured" ||
        secondSequential.status !== "cycle" ||
        secondSequential.reason !== "reaches_user" ||
        (await edgeCount()) !== 1
      ) {
        throw new Error(
          `0038 sequential 2-cycle protection failed: ${JSON.stringify({ firstSequential, secondSequential, edges: await edgeCount() })}`,
        );
      }

      await resetEdges();
      const concurrent = await Promise.all([capture(0, 1), capture(1, 0)]);
      const capturedCount = concurrent.filter(
        (result) => result.status === "captured",
      ).length;
      const rejectedCount = concurrent.filter(
        (result) => result.status === "cycle",
      ).length;
      if (
        capturedCount !== 1 ||
        rejectedCount !== 1 ||
        (await edgeCount()) !== 1
      ) {
        throw new Error(
          `0038 concurrent 2-cycle protection failed: ${JSON.stringify({ concurrent, edges: await edgeCount() })}`,
        );
      }

      await resetEdges();
      const firstThreeCycle = await capture(0, 1);
      const secondThreeCycle = await capture(1, 2);
      const closingThreeCycle = await capture(2, 0);
      if (
        firstThreeCycle.status !== "captured" ||
        secondThreeCycle.status !== "captured" ||
        closingThreeCycle.status !== "cycle" ||
        closingThreeCycle.reason !== "reaches_user" ||
        (await edgeCount()) !== 2
      ) {
        throw new Error(
          `0038 3-cycle protection failed: ${JSON.stringify({ firstThreeCycle, secondThreeCycle, closingThreeCycle, edges: await edgeCount() })}`,
        );
      }
    } finally {
      await sql`
        DELETE FROM public.users
        WHERE id IN (
          ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
          ${graphUsers[2].id}::uuid
        )
      `;
    }
  }

  async function seedSecurityDrift(includeIndexDrift: boolean): Promise<void> {
    await sql.unsafe(
      `GRANT SELECT ON TABLE public.${targetTable} TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE (metadata) ON TABLE public.${targetTable} TO "${parentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE ON SEQUENCE public.${targetSequence} TO "${grandparentRole}"`,
    );
    await sql`GRANT INSERT ON TABLE public.referral_events TO anon`;
    await sql`GRANT SELECT (credit_cents) ON TABLE public.referral_events TO authenticated`;
    await sql`GRANT UPDATE (metadata) ON TABLE public.referral_events TO PUBLIC`;
    await sql`GRANT USAGE ON SEQUENCE public.referral_events_id_seq TO PUBLIC`;
    await sql`
      CREATE POLICY epetrecere_0038_drift_policy
      ON public.referral_events
      FOR SELECT TO authenticated
      USING (true)
    `;
    await sql`ALTER TABLE public.referral_events DISABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.referral_events FORCE ROW LEVEL SECURITY`;

    if (includeIndexDrift) {
      await sql`DROP INDEX public.referral_events_milestone_uidx`;
      await sql`CREATE INDEX referral_events_milestone_uidx
        ON public.referral_events (created_at)`;
    }
  }

  try {
    if (!(await roleExists("anon")) || !(await roleExists("authenticated"))) {
      throw new Error("0038 baseline requires anon and authenticated roles");
    }
    if ((await roleExists(parentRole)) || (await roleExists(grandparentRole))) {
      throw new Error("0038 baseline contains stale verifier roles");
    }
    if (await relationExists(lookalikeTable)) {
      throw new Error("0038 baseline contains stale lookalike fixture");
    }

    const fixtureCount = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM public.users
      WHERE id IN (
        ${fixtureReferrer}::uuid, ${fixtureReferred}::uuid,
        ${gdprReferrer}::uuid, ${gdprReferred}::uuid,
        ${graphUsers[0].id}::uuid, ${graphUsers[1].id}::uuid,
        ${graphUsers[2].id}::uuid
      )
        OR starts_with(clerk_id, 'e2e_0038_depth_')
    `;
    if (fixtureCount[0]?.count !== 0) {
      throw new Error("0038 baseline contains stale financial fixture users");
    }

    const [duplicates] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM (
        SELECT 1
        FROM public.referral_events
        WHERE referrer_user_id IS NOT NULL
          AND referred_user_id IS NOT NULL
        GROUP BY referrer_user_id, referred_user_id, event_type
        HAVING count(*) > 1
      ) AS duplicate_group
    `;
    if (duplicates?.count !== 0) {
      throw new Error(
        "0038 exact pre-index baseline already contains duplicate referral evidence",
      );
    }

    const baselineShape = await currentShape();
    const baselineMode = baselineShape.constraints.some(
      (constraint) =>
        constraint.constraintName ===
        "referral_events_referrer_user_id_referred_user_id_event_typ_key",
    )
      ? "baselineLegacy"
      : "baseline";
    assertStructure(baselineShape, baselineMode, "0038 exact pre-index baseline");
    const baselineFinancial = await financialSnapshot();

    if (baselineMode === "baselineLegacy") {
      try {
        await seedDuplicateFixture();
        throw new Error("0038 legacy UNIQUE unexpectedly accepted duplicate evidence");
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error;
        console.log("-- 0038 legacy UNIQUE rejected duplicate evidence as expected");
      } finally {
        await cleanupDuplicateFixture();
      }
      assertUnchanged(
        baselineShape,
        await currentShape(),
        "0038 legacy UNIQUE duplicate rejection catalog",
      );
      assertUnchanged(
        baselineFinancial,
        await financialSnapshot(),
        "0038 legacy UNIQUE duplicate fixture cleanup",
      );
    } else {
      await seedDuplicateFixture();
      const duplicateFinancial = await financialSnapshot();
      expectMigrationRejected(
        config.url,
        "0038 duplicate-evidence fail-closed probe",
        /duplicate referral milestones/i,
      );
      assertUnchanged(
        duplicateFinancial,
        await financialSnapshot(),
        "0038 rejected duplicate evidence",
      );
      const [preservedDuplicates] = await sql<
        {
          count: number;
          creditTotal: string;
        }[]
      >`
        SELECT count(*)::int AS count,
          coalesce(sum(credit_cents), 0)::text AS "creditTotal"
        FROM public.referral_events
        WHERE id IN (${fixtureEventIds[0]}, ${fixtureEventIds[1]})
      `;
      if (
        preservedDuplicates?.count !== 2 ||
        preservedDuplicates.creditTotal !== "1500"
      ) {
        throw new Error(
          `0038 rejected migration changed duplicate evidence: ${JSON.stringify(preservedDuplicates)}`,
        );
      }
      assertUnchanged(
        baselineShape,
        await currentShape(),
        "0038 catalog after duplicate rejection",
      );
      await cleanupDuplicateFixture();
      assertUnchanged(
        baselineFinancial,
        await financialSnapshot(),
        "0038 duplicate fixture cleanup",
      );
    }

    await verifyLegacyGraphFailsClosed();
    assertUnchanged(
      baselineShape,
      await currentShape(),
      "0038 catalog after legacy-graph rejections",
    );
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 legacy-graph fixture cleanup",
    );

    await sql.unsafe(`CREATE ROLE "${grandparentRole}" NOLOGIN INHERIT`);
    await sql.unsafe(`CREATE ROLE "${parentRole}" NOLOGIN INHERIT`);
    await sql.unsafe(`GRANT "${grandparentRole}" TO "${parentRole}"`);
    await sql.unsafe(`GRANT "${parentRole}" TO "anon", "authenticated"`);
    const expectedMemberships = [
      `${grandparentRole}->${parentRole}`,
      `${parentRole}->anon`,
      `${parentRole}->authenticated`,
    ].sort();
    assertExactStrings(
      await membershipShape(),
      expectedMemberships,
      "0038 fixture memberships",
    );
    const unrelatedSecurityBefore = await unrelatedSecurityShape();

    await seedSecurityDrift(false);
    const firstSeededPrivileges = await privilegeViolations();
    for (const role of auditedRoles) {
      if (!firstSeededPrivileges.some((row) => row.roleName === role)) {
        throw new Error(`0038 first privilege fixture did not expose ${role}`);
      }
    }

    applyMigration(config.url, "0038 first apply");
    const firstShape = await currentShape();
    assertStructure(firstShape, "hardened", "0038 first apply");
    await assertAuditedRolesCannotAccess("0038 first apply");
    assertExactStrings(
      await membershipShape(),
      expectedMemberships,
      "0038 memberships after first apply",
    );
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 first apply financial evidence",
    );
    assertUnchanged(
      unrelatedSecurityBefore,
      await unrelatedSecurityShape(),
      "0038 first apply unrelated users security",
    );

    await verifyGdprLedgerPreservation();
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 GDPR ledger fixture cleanup",
    );

    await verifyReferralCycleProtection();
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 referral cycle fixtures financial neutrality",
    );

    await seedSecurityDrift(true);
    const secondSeededPrivileges = await privilegeViolations();
    for (const role of auditedRoles) {
      if (!secondSeededPrivileges.some((row) => row.roleName === role)) {
        throw new Error(`0038 second privilege fixture did not expose ${role}`);
      }
    }

    applyMigration(
      config.url,
      "0038 second apply after index/RLS/policy/ACL drift",
    );
    const secondShape = await currentShape();
    assertStructure(secondShape, "hardened", "0038 second apply");
    await assertAuditedRolesCannotAccess("0038 second apply");
    assertUnchanged(
      firstShape,
      secondShape,
      "0038 complete catalog convergence",
    );
    assertExactStrings(
      await membershipShape(),
      expectedMemberships,
      "0038 memberships after reapply",
    );
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 reapply financial evidence",
    );
    assertUnchanged(
      unrelatedSecurityBefore,
      await unrelatedSecurityShape(),
      "0038 reapply unrelated users security",
    );

    await sql`DROP INDEX public.referral_events_milestone_uidx`;
    await sql.unsafe(`CREATE TABLE public."${lookalikeTable}" (id integer)`);
    await sql.unsafe(
      `CREATE INDEX ${targetIndex} ON public."${lookalikeTable}" (id)`,
    );
    const beforeLookalikeFailure = await financialSnapshot();
    expectMigrationRejected(
      config.url,
      "0038 foreign same-name-index lookalike",
      /same-name object not indexing public\.referral_events/i,
    );
    assertUnchanged(
      beforeLookalikeFailure,
      await financialSnapshot(),
      "0038 named-index rejection financial evidence",
    );
    await dropLookalikeTable();
    applyMigration(config.url, "0038 restore after named-index lookalike");
    const restoredShape = await currentShape();
    assertStructure(restoredShape, "hardened", "0038 restored shape");
    assertUnchanged(firstShape, restoredShape, "0038 restored catalog");
    assertUnchanged(
      baselineFinancial,
      await financialSnapshot(),
      "0038 final financial evidence",
    );

    for (const probe of [
      {
        label: "0038 extra-column lookalike",
        setup:
          "ALTER TABLE public.referral_events ADD COLUMN epetrecere_0038_extra text",
        failure: /non-canonical referral_events column shape/i,
      },
      {
        label: "0038 extra-constraint lookalike",
        setup:
          "ALTER TABLE public.referral_events ADD CONSTRAINT epetrecere_0038_extra_chk CHECK (true) NOT VALID",
        failure: /exact canonical or legacy referral constraints/i,
      },
      {
        label: "0038 extra-index lookalike",
        setup:
          "CREATE INDEX epetrecere_0038_extra_idx ON public.referral_events (created_at)",
        failure: /non-canonical referral indexes/i,
      },
    ]) {
      await expectTransactionalDriftRejected(
        probe.label,
        probe.setup,
        probe.failure,
      );
      assertUnchanged(
        restoredShape,
        await currentShape(),
        `${probe.label} rollback catalog`,
      );
      assertUnchanged(
        baselineFinancial,
        await financialSnapshot(),
        `${probe.label} financial evidence`,
      );
    }

    console.log("0038 referral milestone migration verification passed.");
  } finally {
    await dropLookalikeTable();
    await cleanupDuplicateFixture();
    if (await relationExists(targetTable)) {
      await sql.unsafe(
        `DROP POLICY IF EXISTS "${driftPolicy}" ON public.${targetTable}`,
      );
    }
    await dropFixtureRoles();
    await sql.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
