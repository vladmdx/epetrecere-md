/**
 * Verify manual migration 0036 on a guarded disposable loopback database.
 *
 * The guarded runner validates the database-resident marker before importing
 * this module. The verifier requires an exact post-0035/pre-0036 baseline,
 * applies 0036 once, injects safe policy/RLS/index/ACL drift, reapplies 0036,
 * and proves catalog convergence without changing role membership.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0036 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration = "src/lib/db/migrations/manual/0036_ai_booking_proposals.sql";
const parentRole = "epetrecere_0036_browser_parent";
const grandparentRole = "epetrecere_0036_browser_grandparent";
const targetTable = "ai_booking_proposals";
const targetSequence = "ai_booking_proposals_id_seq";
const targetIndexes = [
  "ai_booking_proposals_expiry_idx",
  "ai_booking_proposals_token_hash_uidx",
  "ai_booking_proposals_user_plan_expiry_idx",
] as const;
const auditedIndexes = ["ai_booking_proposals_pkey", ...targetIndexes] as const;
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
  expression: string | null;
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
  predicate: string | null;
  keyCount: number;
  attributeCount: number;
  tablespaceOid: number;
  relationOptions: string[] | null;
};

type PrivilegeViolation = {
  roleName: string;
  objectKind: "table" | "column" | "sequence";
  objectName: string;
  privilege: string;
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
        { cause: error },
      );
    }
    console.log(`-- ${label}: rejected as expected`);
    return;
  }
  throw new Error(`${label}: incompatible lookalike was unexpectedly accepted`);
}

function canonicalSql(value: string | null): string | null {
  return (
    value?.toLowerCase().replaceAll('"', "").replace(/\s+/g, " ").trim() ?? null
  );
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

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "payload_hash text NOT NULL",
    "0036 requires canonical post-0035 ordinary table",
    "LOCK TABLE public.ai_booking_proposals IN ACCESS EXCLUSIVE MODE",
    "0036 found a non-canonical ai_booking_proposals column shape",
    "0036 requires exactly one canonical primary key on id",
    "0036 found non-canonical serial sequence ownership",
    "0036 requires exactly four proposal foreign keys",
    "DROP INDEX IF EXISTS public.ai_booking_proposals_token_hash_uidx",
    "WITH RECURSIVE browser_role_tree",
    "ENABLE ROW LEVEL SECURITY",
    "NO FORCE ROW LEVEL SECURITY",
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0036 source guarantee missing: ${guarantee}`);
    }
  }

  const sql = postgres(config.url, {
    max: 1,
    prepare: false,
    ssl: false,
  });

  async function roleExists(roleName: string): Promise<boolean> {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${roleName}
      ) AS exists
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
        WHERE target_relation.oid = 'public.ai_booking_proposals'::regclass
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
        WHERE target_sequence.oid =
          'public.ai_booking_proposals_id_seq'::regclass
      )
      SELECT target_role.role_name AS "roleName",
        'table'::text AS "objectKind",
        'public.ai_booking_proposals'::text AS "objectName",
        table_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN table_privileges AS table_privilege
      WHERE has_table_privilege(
        role.rolname,
        'public.ai_booking_proposals',
        table_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name,
        'column',
        format('public.ai_booking_proposals.%I', column_info.column_name),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = 'ai_booking_proposals'
        AND has_column_privilege(
          role.rolname,
          'public.ai_booking_proposals',
          column_info.column_name,
          column_privilege.privilege
        )
      UNION ALL
      SELECT target_role.role_name,
        'sequence',
        'public.ai_booking_proposals_id_seq',
        sequence_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN sequence_privileges AS sequence_privilege
      WHERE has_sequence_privilege(
        role.rolname,
        'public.ai_booking_proposals_id_seq',
        sequence_privilege.privilege
      )
      ORDER BY 1, 2, 3, 4
    `;
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
        AND table_name = 'ai_booking_proposals'
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
        CASE WHEN constraint_row.contype = 'c' THEN regexp_replace(
          lower(pg_get_expr(constraint_row.conbin, constraint_row.conrelid)),
          '[[:space:]()]', '', 'g'
        ) ELSE NULL END AS expression,
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
      WHERE constraint_row.conrelid = 'public.ai_booking_proposals'::regclass
        AND constraint_row.contype IN ('p', 'f', 'c')
      ORDER BY constraint_row.contype, constraint_row.conname
    `;

    const indexes = await sql<IndexShape[]>`
      SELECT index_relation.relname AS "indexName",
        pg_get_indexdef(index_relation.oid) AS definition,
        index_relation.relkind::text AS "indexKind",
        index_owner.rolname AS "indexOwner",
        table_owner.rolname AS "tableOwner",
        access_method.amname AS "accessMethod",
        ARRAY(
          SELECT attribute.attname::text
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          ORDER BY key_position.position
        ) AS "keyColumns",
        ARRAY(
          SELECT operator_class.opcname::text
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS class_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid =
              index_catalog.indclass[class_position.position]
          ORDER BY class_position.position
        ) AS opclasses,
        ARRAY(
          SELECT index_catalog.indoption[key_position.position]::integer
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          ORDER BY key_position.position
        ) AS options,
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
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          WHERE index_catalog.indcollation[key_position.position]
            IS DISTINCT FROM attribute.attcollation
        ) AS "usesColumnCollations",
        (
          SELECT bool_and(operator_class.opcdefault)
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
        ) AS "opclassesDefault",
        NOT EXISTS (
          SELECT 1
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
          WHERE operator_class.opcmethod <> access_method.oid
             OR operator_class.opcintype <> attribute.atttypid
        ) AS "opclassesMatchInput",
        pg_get_expr(index_catalog.indpred, index_catalog.indrelid) AS predicate,
        index_catalog.indnkeyatts::int AS "keyCount",
        index_catalog.indnatts::int AS "attributeCount",
        index_relation.reltablespace::int AS "tablespaceOid",
        index_relation.reloptions AS "relationOptions"
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation
        ON index_relation.oid = index_catalog.indexrelid
      JOIN pg_namespace AS namespace
        ON namespace.oid = index_relation.relnamespace
      JOIN pg_class AS table_relation
        ON table_relation.oid = index_catalog.indrelid
      JOIN pg_roles AS index_owner
        ON index_owner.oid = index_relation.relowner
      JOIN pg_roles AS table_owner
        ON table_owner.oid = table_relation.relowner
      JOIN pg_am AS access_method
        ON access_method.oid = index_relation.relam
      WHERE namespace.nspname = 'public'
        AND index_catalog.indrelid = 'public.ai_booking_proposals'::regclass
        AND index_relation.relname = ANY(${[...auditedIndexes]}::text[])
      ORDER BY index_relation.relname
    `;

    const [relation] = await sql<
      {
        relationKind: string;
        relationPersistence: string;
        partition: boolean;
        inheritanceEdges: number;
        ownerName: string;
        rowSecurity: boolean;
        forceRowSecurity: boolean;
        policyCount: number;
        serialSequence: string | null;
        sequenceKind: string | null;
        sequencePersistence: string | null;
        sequenceOwner: string | null;
        serialDependencyCount: number;
      }[]
    >`
      SELECT table_relation.relkind::text AS "relationKind",
        table_relation.relpersistence::text AS "relationPersistence",
        table_relation.relispartition AS partition,
        (
          SELECT count(*)::int
          FROM pg_inherits
          WHERE inhrelid = table_relation.oid OR inhparent = table_relation.oid
        ) AS "inheritanceEdges",
        table_owner.rolname AS "ownerName",
        table_relation.relrowsecurity AS "rowSecurity",
        table_relation.relforcerowsecurity AS "forceRowSecurity",
        (
          SELECT count(*)::int
          FROM pg_policy
          WHERE polrelid = table_relation.oid
        ) AS "policyCount",
        pg_get_serial_sequence(
          'public.ai_booking_proposals',
          'id'
        ) AS "serialSequence",
        sequence_relation.relkind::text AS "sequenceKind",
        sequence_relation.relpersistence::text AS "sequencePersistence",
        sequence_owner.rolname AS "sequenceOwner",
        (
          SELECT count(*)::int
          FROM pg_depend AS dependency
          JOIN pg_attribute AS id_attribute
            ON id_attribute.attrelid = table_relation.oid
           AND id_attribute.attname = 'id'
           AND NOT id_attribute.attisdropped
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.objid = sequence_relation.oid
            AND dependency.refclassid = 'pg_class'::regclass
            AND dependency.refobjid = table_relation.oid
            AND dependency.refobjsubid = id_attribute.attnum
            AND dependency.deptype = 'a'
        ) AS "serialDependencyCount"
      FROM pg_class AS table_relation
      JOIN pg_roles AS table_owner ON table_owner.oid = table_relation.relowner
      LEFT JOIN pg_class AS sequence_relation
        ON sequence_relation.oid = to_regclass('public.ai_booking_proposals_id_seq')
      LEFT JOIN pg_roles AS sequence_owner
        ON sequence_owner.oid = sequence_relation.relowner
      WHERE table_relation.oid = 'public.ai_booking_proposals'::regclass
    `;

    const privileges = await privilegeViolations();
    return { columns, constraints, indexes, relation, privileges };
  }

  function assertHardened(
    shape: Awaited<ReturnType<typeof currentShape>>,
    label: string,
  ): void {
    const expectedColumns: string[] = [
      "artist_id:integer:NO:<none>:NO:NEVER",
      "category_id:integer:NO:<none>:NO:NEVER",
      "consumed_action_id:uuid:YES:<none>:NO:NEVER",
      "consumed_at:timestamp with time zone:YES:<none>:NO:NEVER",
      "created_at:timestamp with time zone:NO:now():NO:NEVER",
      "event_plan_id:integer:NO:<none>:NO:NEVER",
      "expires_at:timestamp with time zone:NO:<none>:NO:NEVER",
      "id:integer:NO:nextval('ai_booking_proposals_id_seq'::regclass):NO:NEVER",
      "payload_hash:text:NO:<none>:NO:NEVER",
      "token_hash:text:NO:<none>:NO:NEVER",
      "user_id:uuid:NO:<none>:NO:NEVER",
    ];
    const actualColumns = shape.columns.map((column) => {
      const normalizedDefault =
        column.defaultValue?.replace(
          "'public.ai_booking_proposals_id_seq'",
          "'ai_booking_proposals_id_seq'",
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
    assertExactStrings(actualColumns, expectedColumns, `${label} columns`);

    if (
      !shape.relation ||
      shape.relation.relationKind !== "r" ||
      shape.relation.relationPersistence !== "p" ||
      shape.relation.partition ||
      shape.relation.inheritanceEdges !== 0 ||
      !shape.relation.rowSecurity ||
      shape.relation.forceRowSecurity ||
      shape.relation.policyCount !== 0 ||
      shape.relation.serialSequence !== "public.ai_booking_proposals_id_seq" ||
      shape.relation.sequenceKind !== "S" ||
      shape.relation.sequencePersistence !== "p" ||
      shape.relation.sequenceOwner !== shape.relation.ownerName ||
      shape.relation.serialDependencyCount !== 1
    ) {
      throw new Error(
        `${label}: non-canonical relation/RLS/serial shape ${JSON.stringify(shape.relation)}`,
      );
    }

    const primaryKeys = shape.constraints.filter(
      (constraint) => constraint.constraintType === "p",
    );
    if (
      primaryKeys.length !== 1 ||
      primaryKeys[0]?.constraintName !== "ai_booking_proposals_pkey" ||
      JSON.stringify(primaryKeys[0]?.sourceColumns) !==
        JSON.stringify(["id"]) ||
      !primaryKeys[0].valid ||
      !primaryKeys[0].noInherit ||
      primaryKeys[0].deferrable ||
      primaryKeys[0].deferred ||
      !primaryKeys[0].local ||
      primaryKeys[0].inheritanceCount !== 0 ||
      primaryKeys[0].parentConstraintOid !== 0
    ) {
      throw new Error(
        `${label}: non-canonical primary key ${JSON.stringify(primaryKeys)}`,
      );
    }

    const checks = shape.constraints.filter(
      (constraint) => constraint.constraintType === "c",
    );
    if (
      checks.length !== 1 ||
      checks[0]?.constraintName !==
        "ai_booking_proposals_consumption_shape_chk" ||
      checks[0].expression !==
        "consumed_atisnullandconsumed_action_idisnullorconsumed_atisnotnullandconsumed_action_idisnotnull" ||
      !checks[0].valid ||
      checks[0].noInherit ||
      checks[0].deferrable ||
      checks[0].deferred ||
      !checks[0].local ||
      checks[0].inheritanceCount !== 0 ||
      checks[0].parentConstraintOid !== 0
    ) {
      throw new Error(
        `${label}: non-canonical CHECK ${JSON.stringify(checks)}`,
      );
    }

    const expectedForeignKeys = new Map([
      ["ai_booking_proposals_artist_fk", ["artist_id", "artists"]],
      ["ai_booking_proposals_category_fk", ["category_id", "categories"]],
      ["ai_booking_proposals_event_plan_fk", ["event_plan_id", "event_plans"]],
      ["ai_booking_proposals_user_fk", ["user_id", "users"]],
    ]);
    const foreignKeys = shape.constraints.filter(
      (constraint) => constraint.constraintType === "f",
    );
    if (foreignKeys.length !== expectedForeignKeys.size) {
      throw new Error(
        `${label}: wrong FK count ${JSON.stringify(foreignKeys)}`,
      );
    }
    for (const foreignKey of foreignKeys) {
      const expected = expectedForeignKeys.get(foreignKey.constraintName);
      if (
        !expected ||
        JSON.stringify(foreignKey.sourceColumns) !==
          JSON.stringify([expected[0]]) ||
        foreignKey.targetTable !== expected[1] ||
        JSON.stringify(foreignKey.targetColumns) !== JSON.stringify(["id"]) ||
        foreignKey.deleteAction !== "c" ||
        foreignKey.updateAction !== "a" ||
        foreignKey.matchType !== "s" ||
        !foreignKey.valid ||
        !foreignKey.noInherit ||
        foreignKey.deferrable ||
        foreignKey.deferred ||
        !foreignKey.local ||
        foreignKey.inheritanceCount !== 0 ||
        foreignKey.parentConstraintOid !== 0
      ) {
        throw new Error(
          `${label}: non-canonical FK ${JSON.stringify(foreignKey)}`,
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
        definition: string;
      }
    >([
      [
        "ai_booking_proposals_pkey",
        {
          columns: ["id"],
          opclasses: ["int4_ops"],
          unique: true,
          primary: true,
          definition:
            "create unique index ai_booking_proposals_pkey on public.ai_booking_proposals using btree (id)",
        },
      ],
      [
        "ai_booking_proposals_expiry_idx",
        {
          columns: ["expires_at"],
          opclasses: ["timestamptz_ops"],
          unique: false,
          primary: false,
          definition:
            "create index ai_booking_proposals_expiry_idx on public.ai_booking_proposals using btree (expires_at)",
        },
      ],
      [
        "ai_booking_proposals_token_hash_uidx",
        {
          columns: ["token_hash"],
          opclasses: ["text_ops"],
          unique: true,
          primary: false,
          definition:
            "create unique index ai_booking_proposals_token_hash_uidx on public.ai_booking_proposals using btree (token_hash)",
        },
      ],
      [
        "ai_booking_proposals_user_plan_expiry_idx",
        {
          columns: ["user_id", "event_plan_id", "expires_at"],
          opclasses: ["uuid_ops", "int4_ops", "timestamptz_ops"],
          unique: false,
          primary: false,
          definition:
            "create index ai_booking_proposals_user_plan_expiry_idx on public.ai_booking_proposals using btree (user_id, event_plan_id, expires_at)",
        },
      ],
    ]);
    if (shape.indexes.length !== expectedIndexes.size) {
      throw new Error(
        `${label}: wrong target index count ${JSON.stringify(shape.indexes)}`,
      );
    }
    for (const index of shape.indexes) {
      const expected = expectedIndexes.get(index.indexName);
      if (
        !expected ||
        canonicalSql(index.definition) !== expected.definition ||
        index.indexKind !== "i" ||
        index.indexOwner !== index.tableOwner ||
        index.accessMethod !== "btree" ||
        JSON.stringify(index.keyColumns) !== JSON.stringify(expected.columns) ||
        JSON.stringify(index.opclasses) !==
          JSON.stringify(expected.opclasses) ||
        index.options.some((option) => option !== 0) ||
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
        index.predicate !== null ||
        index.keyCount !== expected.columns.length ||
        index.attributeCount !== expected.columns.length ||
        index.tablespaceOid !== 0 ||
        index.relationOptions !== null
      ) {
        throw new Error(
          `${label}: non-canonical index ${JSON.stringify(index)}`,
        );
      }
    }

    if (shape.privileges.length !== 0) {
      throw new Error(
        `${label}: effective privileges remain ${JSON.stringify(shape.privileges)}`,
      );
    }
  }

  async function assertAuditedRolesCannotRead(label: string): Promise<void> {
    for (const role of auditedRoles) {
      if (!(await roleExists(role))) continue;
      let blocked = false;
      await sql`BEGIN`;
      try {
        await sql.unsafe(`SET LOCAL ROLE "${role}"`);
        await sql`SELECT id FROM public.ai_booking_proposals LIMIT 0`;
      } catch (error) {
        blocked = (error as { code?: string }).code === "42501";
      } finally {
        await sql`ROLLBACK`;
      }
      if (!blocked) {
        throw new Error(`${label}: SET ROLE ${role} could read proposal rows`);
      }
    }
  }

  try {
    const [baseline] = await sql<
      {
        browserRoles: number;
        requiredTables: number;
        identityColumns: number;
        identityTotalColumns: number;
        identityPrimaryKey: number;
        identityRls: number;
        identityPolicies: number;
        proposalObjects: number;
      }[]
    >`
      SELECT
        (
          SELECT count(*)::int
          FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        ) AS "browserRoles",
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind = 'r'
            AND relation.relname IN (
              'users', 'event_plans', 'artists', 'categories',
              'account_erasure_identity_outbox'
            )
        ) AS "requiredTables",
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'account_erasure_identity_outbox'
            AND column_name IN (
              'identity_hash', 'clerk_id', 'status', 'attempts',
              'next_attempt_at', 'lease_token', 'lease_until', 'last_error',
              'completed_at', 'created_at', 'updated_at'
            )
        ) AS "identityColumns",
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'account_erasure_identity_outbox'
        ) AS "identityTotalColumns",
        (
          SELECT count(*)::int
          FROM pg_constraint
          WHERE conrelid =
              to_regclass('public.account_erasure_identity_outbox')
            AND contype = 'p'
            AND conkey = ARRAY[
              (
                SELECT attnum
                FROM pg_attribute
                WHERE attrelid =
                    to_regclass('public.account_erasure_identity_outbox')
                  AND attname = 'identity_hash'
                  AND NOT attisdropped
              )
            ]::smallint[]
            AND convalidated
        ) AS "identityPrimaryKey",
        (
          SELECT count(*)::int
          FROM pg_class
          WHERE oid = to_regclass('public.account_erasure_identity_outbox')
            AND relrowsecurity
            AND NOT relforcerowsecurity
        ) AS "identityRls",
        (
          SELECT count(*)::int
          FROM pg_policy
          WHERE polrelid =
            to_regclass('public.account_erasure_identity_outbox')
        ) AS "identityPolicies",
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname IN (
              'ai_booking_proposals',
              'ai_booking_proposals_id_seq',
              'ai_booking_proposals_pkey',
              'ai_booking_proposals_expiry_idx',
              'ai_booking_proposals_token_hash_uidx',
              'ai_booking_proposals_user_plan_expiry_idx'
            )
        ) AS "proposalObjects"
    `;

    if (
      baseline?.browserRoles !== 2 ||
      baseline.requiredTables !== 5 ||
      baseline.identityColumns !== 11 ||
      baseline.identityTotalColumns !== 11 ||
      baseline.identityPrimaryKey !== 1 ||
      baseline.identityRls !== 1 ||
      baseline.identityPolicies !== 0 ||
      baseline.proposalObjects !== 0
    ) {
      throw new Error(
        `0036 verification requires an exact post-0035/pre-0036 baseline: ${JSON.stringify(baseline)}`,
      );
    }

    const identityColumns = await sql<ColumnShape[]>`
      SELECT column_name AS "columnName",
        data_type AS "dataType",
        is_nullable AS nullable,
        column_default AS "defaultValue",
        is_identity AS identity,
        is_generated AS generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'account_erasure_identity_outbox'
      ORDER BY column_name
    `;
    assertExactStrings(
      identityColumns.map((column) =>
        [
          column.columnName,
          column.dataType,
          column.nullable,
          column.defaultValue ?? "<none>",
          column.identity,
          column.generated,
        ].join(":"),
      ),
      [
        "attempts:integer:NO:0:NO:NEVER",
        "clerk_id:text:YES:<none>:NO:NEVER",
        "completed_at:timestamp with time zone:YES:<none>:NO:NEVER",
        "created_at:timestamp with time zone:NO:now():NO:NEVER",
        "identity_hash:text:NO:<none>:NO:NEVER",
        "last_error:text:YES:<none>:NO:NEVER",
        "lease_token:uuid:YES:<none>:NO:NEVER",
        "lease_until:timestamp with time zone:YES:<none>:NO:NEVER",
        "next_attempt_at:timestamp with time zone:NO:now():NO:NEVER",
        "status:text:NO:'pending'::text:NO:NEVER",
        "updated_at:timestamp with time zone:NO:now():NO:NEVER",
      ],
      "0036 post-0035 baseline columns",
    );

    const identityConstraints = await sql<
      {
        constraintName: string;
        constraintType: string;
        valid: boolean;
        deferrable: boolean;
        deferred: boolean;
        local: boolean;
        inheritanceCount: number;
        parentConstraintOid: number;
        sourceColumns: string[];
      }[]
    >`
      SELECT constraint_row.conname AS "constraintName",
        constraint_row.contype::text AS "constraintType",
        constraint_row.convalidated AS valid,
        constraint_row.condeferrable AS deferrable,
        constraint_row.condeferred AS deferred,
        constraint_row.conislocal AS local,
        constraint_row.coninhcount::int AS "inheritanceCount",
        constraint_row.conparentid::int AS "parentConstraintOid",
        ARRAY(
          SELECT attribute.attname::text
          FROM unnest(constraint_row.conkey)
            WITH ORDINALITY AS key_position(attnum, position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.conrelid
           AND attribute.attnum = key_position.attnum
          ORDER BY key_position.position
        ) AS "sourceColumns"
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
        'public.account_erasure_identity_outbox'::regclass
      ORDER BY constraint_row.conname
    `;
    assertExactStrings(
      identityConstraints.map(
        (constraint) =>
          `${constraint.constraintName}:${constraint.constraintType}`,
      ),
      [
        "account_erasure_identity_attempts_chk:c",
        "account_erasure_identity_hash_chk:c",
        "account_erasure_identity_outbox_pkey:p",
        "account_erasure_identity_state_chk:c",
      ],
      "0036 post-0035 baseline constraints",
    );
    for (const constraint of identityConstraints) {
      if (
        !constraint.valid ||
        constraint.deferrable ||
        constraint.deferred ||
        !constraint.local ||
        constraint.inheritanceCount !== 0 ||
        constraint.parentConstraintOid !== 0 ||
        (constraint.constraintType === "p" &&
          JSON.stringify(constraint.sourceColumns) !==
            JSON.stringify(["identity_hash"]))
      ) {
        throw new Error(
          `0036 requires canonical post-0035 constraints: ${JSON.stringify(constraint)}`,
        );
      }
    }

    const identityIndexes = await sql<
      {
        indexName: string;
        keyColumns: string[];
        unique: boolean;
        primary: boolean;
        valid: boolean;
        ready: boolean;
        live: boolean;
        predicate: string | null;
      }[]
    >`
      SELECT index_relation.relname AS "indexName",
        ARRAY(
          SELECT attribute.attname::text
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          ORDER BY key_position.position
        ) AS "keyColumns",
        index_catalog.indisunique AS unique,
        index_catalog.indisprimary AS primary,
        index_catalog.indisvalid AS valid,
        index_catalog.indisready AS ready,
        index_catalog.indislive AS live,
        pg_get_expr(index_catalog.indpred, index_catalog.indrelid) AS predicate
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation
        ON index_relation.oid = index_catalog.indexrelid
      WHERE index_catalog.indrelid =
        'public.account_erasure_identity_outbox'::regclass
      ORDER BY index_relation.relname
    `;
    const expectedIdentityIndexes = new Map([
      [
        "account_erasure_identity_due_idx",
        {
          columns: ["next_attempt_at", "identity_hash"],
          unique: false,
          primary: false,
          predicate: true,
        },
      ],
      [
        "account_erasure_identity_expired_lease_idx",
        {
          columns: ["lease_until", "identity_hash"],
          unique: false,
          primary: false,
          predicate: true,
        },
      ],
      [
        "account_erasure_identity_outbox_pkey",
        {
          columns: ["identity_hash"],
          unique: true,
          primary: true,
          predicate: false,
        },
      ],
    ]);
    if (identityIndexes.length !== expectedIdentityIndexes.size) {
      throw new Error(
        `0036 requires exact post-0035 indexes: ${JSON.stringify(identityIndexes)}`,
      );
    }
    for (const index of identityIndexes) {
      const expected = expectedIdentityIndexes.get(index.indexName);
      if (
        !expected ||
        JSON.stringify(index.keyColumns) !== JSON.stringify(expected.columns) ||
        index.unique !== expected.unique ||
        index.primary !== expected.primary ||
        !index.valid ||
        !index.ready ||
        !index.live ||
        (index.predicate !== null) !== expected.predicate
      ) {
        throw new Error(
          `0036 requires canonical post-0035 index: ${JSON.stringify(index)}`,
        );
      }
    }

    await dropFixtureRoles();

    applyMigration(config.url, "0036 first apply");
    const firstShape = await currentShape();
    assertHardened(firstShape, "0036 first apply");
    await assertAuditedRolesCannotRead("0036 first apply");

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
      "0036 fixture memberships",
    );

    await sql.unsafe(
      `GRANT SELECT ON TABLE public.${targetTable} TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE (payload_hash) ON TABLE public.${targetTable} TO "${parentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE ON SEQUENCE public.${targetSequence} TO "${grandparentRole}"`,
    );
    await sql`GRANT INSERT ON TABLE public.ai_booking_proposals TO anon`;
    await sql`GRANT SELECT (token_hash) ON TABLE public.ai_booking_proposals TO authenticated`;
    await sql`GRANT UPDATE (created_at) ON TABLE public.ai_booking_proposals TO PUBLIC`;
    await sql`GRANT USAGE ON SEQUENCE public.ai_booking_proposals_id_seq TO PUBLIC`;
    await sql`
      CREATE POLICY epetrecere_0036_drift_policy
      ON public.ai_booking_proposals
      FOR SELECT TO authenticated
      USING (true)
    `;
    await sql`ALTER TABLE public.ai_booking_proposals DISABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.ai_booking_proposals FORCE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.ai_booking_proposals
      DROP CONSTRAINT ai_booking_proposals_consumption_shape_chk`;
    await sql`ALTER TABLE public.ai_booking_proposals
      ADD CONSTRAINT ai_booking_proposals_consumption_shape_chk CHECK (true)`;
    await sql`DROP INDEX public.ai_booking_proposals_expiry_idx`;
    await sql`CREATE INDEX ai_booking_proposals_expiry_idx
      ON public.ai_booking_proposals (created_at)`;

    const seededViolations = await privilegeViolations();
    for (const role of auditedRoles) {
      if (!seededViolations.some((row) => row.roleName === role)) {
        throw new Error(`0036 privilege fixture did not expose ${role}`);
      }
    }

    applyMigration(config.url, "0036 second apply after safe catalog drift");
    const secondShape = await currentShape();
    assertHardened(secondShape, "0036 second apply");
    await assertAuditedRolesCannotRead("0036 second apply");
    assertExactStrings(
      await membershipShape(),
      expectedMemberships,
      "0036 memberships after reapply",
    );

    if (JSON.stringify(secondShape) !== JSON.stringify(firstShape)) {
      throw new Error(
        `0036 did not converge to the first catalog shape:\nfirst=${JSON.stringify(firstShape)}\nsecond=${JSON.stringify(secondShape)}`,
      );
    }

    // Fail closed on an incompatible lookalike instead of silently dropping
    // an unknown column. Restore the disposable schema after the assertion.
    await sql`ALTER TABLE public.ai_booking_proposals
      ADD COLUMN epetrecere_0036_unexpected text`;
    expectMigrationRejected(
      config.url,
      "0036 extra-column lookalike",
      /non-canonical ai_booking_proposals column shape/i,
    );
    await sql`ALTER TABLE public.ai_booking_proposals
      DROP COLUMN epetrecere_0036_unexpected`;

    console.log("0036 AI booking proposal migration verification passed.");
  } finally {
    const [proposal] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.ai_booking_proposals') IS NOT NULL AS exists
    `;
    if (proposal?.exists) {
      await sql`ALTER TABLE public.ai_booking_proposals
        DROP COLUMN IF EXISTS epetrecere_0036_unexpected`;
    }
    await dropFixtureRoles();
    await sql.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
