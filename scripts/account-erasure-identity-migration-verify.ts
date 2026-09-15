/**
 * Verify manual migration 0035 on a guarded disposable loopback database.
 *
 * The guarded runner verifies the database-resident marker before importing
 * this module. This verifier requires an exact post-0034/pre-0035 baseline,
 * applies 0035, injects safe catalog/ACL drift through a two-level inherited
 * role fixture, reapplies 0035, and proves catalog convergence. Destructive
 * lookalike probes are restricted to this disposable database.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0035 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0035_account_erasure_identity_outbox.sql";
const targetTable = "account_erasure_identity_outbox";
const parentRole = "epetrecere_0035_browser_parent";
const grandparentRole = "epetrecere_0035_browser_grandparent";
const indexLookalikeTable = "epetrecere_0035_index_lookalike";
const inheritanceParentTable = "epetrecere_0035_inheritance_parent";
const unexpectedIndex = "account_erasure_identity_unexpected_idx";
const unexpectedConstraint = "account_erasure_identity_unexpected_chk";
const unexpectedColumn = "epetrecere_0035_unexpected";
const auditedRoles = [
  "anon",
  "authenticated",
  parentRole,
  grandparentRole,
] as const;
const post0034Tables = ["calendar_events", "notifications"] as const;
const post0034Sequences = [
  "calendar_events_id_seq",
  "notifications_id_seq",
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
    "Do not apply to Preview/Production without an explicit rollout",
    "LOCK TABLE public.account_erasure_identity_outbox IN ACCESS EXCLUSIVE MODE",
    "0035 requires the Supabase anon and authenticated roles",
    "0035 found an incompatible account_erasure_identity_outbox shape",
    "0035 requires a current-user-owned permanent non-partitioned non-inherited ordinary tombstone table",
    "0035 refuses dropped/identity/generated/typmod/inherited tombstone column drift",
    "0035 requires exactly one validated primary key on identity_hash",
    "0035 found unexpected/unvalidated tombstone constraints",
    "0035 refuses non-canonical named index object",
    "0035 found non-canonical tombstone indexes",
    "WITH RECURSIVE browser_role_tree",
    "ENABLE ROW LEVEL SECURITY",
    "NO FORCE ROW LEVEL SECURITY",
    "has_table_privilege",
    "has_column_privilege",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0035 source guarantee missing: ${guarantee}`);
    }
  }

  const sql = postgres(config.url, {
    max: 1,
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

  async function dropLookalikeTable(): Promise<void> {
    if (await relationExists(indexLookalikeTable)) {
      await sql.unsafe(`DROP TABLE public."${indexLookalikeTable}"`);
    }
  }

  async function dropInheritanceParent(): Promise<void> {
    if (await relationExists(inheritanceParentTable)) {
      await sql.unsafe(
        `ALTER TABLE public.${targetTable} NO INHERIT public."${inheritanceParentTable}"`,
      ).catch(() => undefined);
      await sql.unsafe(`DROP TABLE public."${inheritanceParentTable}"`);
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

  async function targetPrivilegeViolations(): Promise<PrivilegeViolation[]> {
    return sql<PrivilegeViolation[]>`
      WITH target_roles(role_name) AS (
        SELECT unnest(${[...auditedRoles]}::text[])
      ), table_privileges(privilege) AS (
        SELECT DISTINCT supported_privilege.privilege_type
        FROM pg_class AS target_relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          pg_catalog.acldefault('r', target_relation.relowner)
        ) AS supported_privilege
        WHERE target_relation.oid =
          'public.account_erasure_identity_outbox'::regclass
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ]::text[])
      )
      SELECT target_role.role_name AS "roleName",
        'table'::text AS "objectKind",
        'public.account_erasure_identity_outbox'::text AS "objectName",
        table_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN table_privileges AS table_privilege
      WHERE has_table_privilege(
        role.rolname,
        'public.account_erasure_identity_outbox',
        table_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name,
        'column',
        format(
          'public.account_erasure_identity_outbox.%I',
          column_info.column_name
        ),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = 'account_erasure_identity_outbox'
        AND has_column_privilege(
          role.rolname,
          'public.account_erasure_identity_outbox',
          column_info.column_name,
          column_privilege.privilege
        )
      ORDER BY 1, 2, 3, 4
    `;
  }

  async function post0034PrivilegeViolations(): Promise<PrivilegeViolation[]> {
    return sql<PrivilegeViolation[]>`
      WITH target_roles(role_name) AS (
        SELECT unnest(ARRAY['anon', 'authenticated']::text[])
      ), target_tables(table_name) AS (
        SELECT unnest(${[...post0034Tables]}::text[])
      ), table_privileges(privilege) AS (
        SELECT DISTINCT supported_privilege.privilege_type
        FROM pg_class AS target_relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          pg_catalog.acldefault('r', target_relation.relowner)
        ) AS supported_privilege
        WHERE target_relation.oid IN (
          'public.calendar_events'::regclass,
          'public.notifications'::regclass
        )
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ]::text[])
      ), target_sequences(sequence_name) AS (
        SELECT unnest(${[...post0034Sequences]}::text[])
      ), sequence_privileges(privilege) AS (
        SELECT DISTINCT supported_privilege.privilege_type
        FROM pg_class AS target_sequence
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          pg_catalog.acldefault('s', target_sequence.relowner)
        ) AS supported_privilege
        WHERE target_sequence.oid IN (
          'public.calendar_events_id_seq'::regclass,
          'public.notifications_id_seq'::regclass
        )
      )
      SELECT target_role.role_name AS "roleName",
        'table'::text AS "objectKind",
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
      SELECT target_role.role_name,
        'column',
        format('public.%I.%I', column_info.table_name, column_info.column_name),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = ANY(${[...post0034Tables]}::text[])
        AND has_column_privilege(
          role.rolname,
          format('public.%I', column_info.table_name),
          column_info.column_name,
          column_privilege.privilege
        )
      UNION ALL
      SELECT target_role.role_name,
        'sequence',
        format('public.%I', target_sequence.sequence_name),
        sequence_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN target_sequences AS target_sequence
      CROSS JOIN sequence_privileges AS sequence_privilege
      WHERE has_sequence_privilege(
        role.rolname,
        format('public.%I', target_sequence.sequence_name),
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
        AND table_name = 'account_erasure_identity_outbox'
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
      WHERE constraint_row.conrelid =
          'public.account_erasure_identity_outbox'::regclass
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
          ) AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
          ORDER BY key_position.position
        ) AS opclasses,
        ARRAY(
          SELECT index_catalog.indoption[key_position.position]::int
          FROM generate_series(
            0,
            index_catalog.indnkeyatts - 1
          ) AS key_position(position)
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
        index_catalog.indnkeyatts::int AS "keyCount",
        index_catalog.indnatts::int AS "attributeCount",
        index_relation.reltablespace::int AS "tablespaceOid",
        index_relation.reloptions AS "relationOptions"
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation
        ON index_relation.oid = index_catalog.indexrelid
      JOIN pg_class AS table_relation
        ON table_relation.oid = index_catalog.indrelid
      JOIN pg_roles AS index_owner
        ON index_owner.oid = index_relation.relowner
      JOIN pg_roles AS table_owner
        ON table_owner.oid = table_relation.relowner
      JOIN pg_am AS access_method
        ON access_method.oid = index_relation.relam
      WHERE index_catalog.indrelid =
          'public.account_erasure_identity_outbox'::regclass
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
        droppedColumnCount: number;
        nonCanonicalColumnMetadataCount: number;
        ownedSequenceCount: number;
      }[]
    >`
      SELECT target_relation.relkind::text AS "relationKind",
        target_relation.relpersistence::text AS "relationPersistence",
        target_relation.relispartition AS partition,
        (
          SELECT count(*)::int
          FROM pg_inherits
          WHERE inhrelid = target_relation.oid
             OR inhparent = target_relation.oid
        ) AS "inheritanceEdges",
        table_owner.rolname AS "ownerName",
        target_relation.relrowsecurity AS "rowSecurity",
        target_relation.relforcerowsecurity AS "forceRowSecurity",
        (
          SELECT count(*)::int
          FROM pg_policy
          WHERE polrelid = target_relation.oid
        ) AS "policyCount",
        (
          SELECT count(*)::int
          FROM pg_attribute
          WHERE attrelid = target_relation.oid
            AND attnum > 0
            AND attisdropped
        ) AS "droppedColumnCount",
        (
          SELECT count(*)::int
          FROM pg_attribute
          WHERE attrelid = target_relation.oid
            AND attnum > 0
            AND NOT attisdropped
            AND (
              attidentity <> ''
              OR attgenerated <> ''
              OR atttypmod <> -1
              OR attinhcount <> 0
              OR NOT attislocal
            )
        ) AS "nonCanonicalColumnMetadataCount",
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
      WHERE target_relation.oid =
        'public.account_erasure_identity_outbox'::regclass
    `;

    const privileges = await targetPrivilegeViolations();
    return { columns, constraints, indexes, relation, privileges };
  }

  function assertHardened(
    shape: Awaited<ReturnType<typeof currentShape>>,
    label: string,
  ): void {
    const expectedColumns = [
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
    ];
    assertExactStrings(
      shape.columns.map((column) =>
        [
          column.columnName,
          column.dataType,
          column.nullable,
          column.defaultValue ?? "<none>",
          column.identity,
          column.generated,
        ].join(":"),
      ),
      expectedColumns,
      `${label} columns`,
    );

    if (
      !shape.relation ||
      shape.relation.relationKind !== "r" ||
      shape.relation.relationPersistence !== "p" ||
      shape.relation.partition ||
      shape.relation.inheritanceEdges !== 0 ||
      !shape.relation.rowSecurity ||
      shape.relation.forceRowSecurity ||
      shape.relation.policyCount !== 0 ||
      shape.relation.droppedColumnCount !== 0 ||
      shape.relation.nonCanonicalColumnMetadataCount !== 0 ||
      shape.relation.ownedSequenceCount !== 0
    ) {
      throw new Error(
        `${label}: non-canonical relation/RLS shape ${JSON.stringify(shape.relation)}`,
      );
    }

    const expectedConstraints = new Map<
      string,
      {
        type: string;
        columns: string[] | null;
        expression: string | null;
      }
    >([
      [
        "account_erasure_identity_attempts_chk",
        {
          type: "c",
          columns: null,
          expression: "attempts>=0",
        },
      ],
      [
        "account_erasure_identity_hash_chk",
        {
          type: "c",
          columns: null,
          expression: "identity_hash~'^[0-9a-f]{64}$'::text",
        },
      ],
      [
        "account_erasure_identity_outbox_pkey",
        {
          type: "p",
          columns: ["identity_hash"],
          expression: null,
        },
      ],
      [
        "account_erasure_identity_state_chk",
        {
          type: "c",
          columns: null,
          expression:
            "status='processing'::textandclerk_idisnotnullandlease_tokenisnotnullandlease_untilisnotnullandcompleted_atisnullorstatus=anyarray['pending'::text,'failed'::text]andclerk_idisnotnullandlease_tokenisnullandlease_untilisnullandcompleted_atisnullorstatus='completed'::textandclerk_idisnullandlease_tokenisnullandlease_untilisnullandcompleted_atisnotnull",
        },
      ],
    ]);
    if (shape.constraints.length !== expectedConstraints.size) {
      throw new Error(
        `${label}: wrong constraint count ${JSON.stringify(shape.constraints)}`,
      );
    }
    for (const constraint of shape.constraints) {
      const expected = expectedConstraints.get(constraint.constraintName);
      if (
        !expected ||
        constraint.constraintType !== expected.type ||
        (expected.columns !== null &&
          JSON.stringify(constraint.sourceColumns) !==
            JSON.stringify(expected.columns)) ||
        constraint.expression !== expected.expression ||
        !constraint.valid ||
        // PostgreSQL marks a primary key NO INHERIT; only our CHECKs must
        // remain inheritable to protect child relations as well.
        (constraint.constraintType === "c" && constraint.noInherit) ||
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
        predicate: string | null;
        unique: boolean;
        primary: boolean;
      }
    >([
      [
        "account_erasure_identity_due_idx",
        {
          columns: ["next_attempt_at", "identity_hash"],
          opclasses: ["timestamptz_ops", "text_ops"],
          predicate: "status=anyarray['pending'::text,'failed'::text]",
          unique: false,
          primary: false,
        },
      ],
      [
        "account_erasure_identity_expired_lease_idx",
        {
          columns: ["lease_until", "identity_hash"],
          opclasses: ["timestamptz_ops", "text_ops"],
          predicate: "status='processing'::text",
          unique: false,
          primary: false,
        },
      ],
      [
        "account_erasure_identity_outbox_pkey",
        {
          columns: ["identity_hash"],
          opclasses: ["text_ops"],
          predicate: null,
          unique: true,
          primary: true,
        },
      ],
    ]);
    if (shape.indexes.length !== expectedIndexes.size) {
      throw new Error(
        `${label}: wrong index count ${JSON.stringify(shape.indexes)}`,
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
        index.predicate !== expected.predicate ||
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
        await sql`SELECT identity_hash
          FROM public.account_erasure_identity_outbox LIMIT 0`;
      } catch (error) {
        blocked = (error as { code?: string }).code === "42501";
      } finally {
        await sql`ROLLBACK`;
      }
      if (!blocked) {
        throw new Error(`${label}: SET ROLE ${role} could read tombstones`);
      }
    }
  }

  try {
    const baselineRelations = await sql<
      {
        tableName: string;
        relationKind: string;
        persistence: string;
        rowSecurity: boolean;
        forceRowSecurity: boolean;
      }[]
    >`
      SELECT relation.relname AS "tableName",
        relation.relkind::text AS "relationKind",
        relation.relpersistence::text AS persistence,
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...post0034Tables]}::text[])
      ORDER BY relation.relname
    `;
    if (
      baselineRelations.length !== post0034Tables.length ||
      baselineRelations.some(
        (relation) =>
          relation.relationKind !== "r" ||
          relation.persistence !== "p" ||
          !relation.rowSecurity ||
          relation.forceRowSecurity,
      )
    ) {
      throw new Error(
        `0035 verification requires exact post-0034 owner-bypass RLS: ${JSON.stringify(baselineRelations)}`,
      );
    }

    const baselineSerials = await sql<
      {
        tableName: string;
        sequenceName: string | null;
        sequenceKind: string | null;
        sequenceOwner: string | null;
        tableOwner: string;
        dependencyCount: number;
      }[]
    >`
      SELECT target.table_name AS "tableName",
        pg_get_serial_sequence(
          format('public.%I', target.table_name),
          'id'
        ) AS "sequenceName",
        sequence_relation.relkind::text AS "sequenceKind",
        sequence_owner.rolname AS "sequenceOwner",
        table_owner.rolname AS "tableOwner",
        (
          SELECT count(*)::int
          FROM pg_depend AS dependency
          JOIN pg_attribute AS id_attribute
            ON id_attribute.attrelid = table_relation.oid
           AND id_attribute.attname = 'id'
           AND id_attribute.attnum = dependency.refobjsubid
          WHERE dependency.classid = 'pg_class'::regclass
            AND dependency.objid = sequence_relation.oid
            AND dependency.refclassid = 'pg_class'::regclass
            AND dependency.refobjid = table_relation.oid
            AND dependency.deptype IN ('a', 'i')
        ) AS "dependencyCount"
      FROM unnest(${[...post0034Tables]}::text[]) AS target(table_name)
      JOIN pg_class AS table_relation
        ON table_relation.oid = format('public.%I', target.table_name)::regclass
      JOIN pg_roles AS table_owner ON table_owner.oid = table_relation.relowner
      LEFT JOIN pg_class AS sequence_relation
        ON sequence_relation.oid = to_regclass(
          format('public.%I', target.table_name || '_id_seq')
        )
      LEFT JOIN pg_roles AS sequence_owner
        ON sequence_owner.oid = sequence_relation.relowner
      ORDER BY target.table_name
    `;
    const expectedSerials = new Map([
      ["calendar_events", "public.calendar_events_id_seq"],
      ["notifications", "public.notifications_id_seq"],
    ]);
    if (
      baselineSerials.length !== expectedSerials.size ||
      baselineSerials.some(
        (serial) =>
          serial.sequenceName !== expectedSerials.get(serial.tableName) ||
          serial.sequenceKind !== "S" ||
          serial.sequenceOwner !== serial.tableOwner ||
          serial.dependencyCount !== 1,
      )
    ) {
      throw new Error(
        `0035 verification requires exact post-0034 serial ownership: ${JSON.stringify(baselineSerials)}`,
      );
    }

    const [baseline] = await sql<
      {
        browserRoles: number;
        usersTable: number;
        targetObjects: number;
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
          FROM pg_class
          WHERE oid = to_regclass('public.users')
            AND relkind = 'r'
        ) AS "usersTable",
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname IN (
              'account_erasure_identity_outbox',
              'account_erasure_identity_outbox_pkey',
              'account_erasure_identity_due_idx',
              'account_erasure_identity_expired_lease_idx',
              'account_erasure_identity_outbox_id_seq'
            )
        ) AS "targetObjects"
    `;
    const baselinePrivileges = await post0034PrivilegeViolations();
    if (
      baseline?.browserRoles !== 2 ||
      baseline.usersTable !== 1 ||
      baseline.targetObjects !== 0 ||
      baselinePrivileges.length !== 0
    ) {
      throw new Error(
        `0035 verification requires an exact post-0034/pre-0035 baseline: ${JSON.stringify({ baseline, baselinePrivileges })}`,
      );
    }

    await dropFixtureRoles();
    await dropLookalikeTable();
    await dropInheritanceParent();

    applyMigration(config.url, "0035 first apply");
    const firstShape = await currentShape();
    assertHardened(firstShape, "0035 first apply");
    await assertAuditedRolesCannotRead("0035 first apply");

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
      "0035 fixture memberships",
    );

    await sql.unsafe(
      `GRANT SELECT ON TABLE public.${targetTable} TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE (clerk_id) ON TABLE public.${targetTable} TO "${parentRole}"`,
    );
    await sql`GRANT INSERT ON TABLE public.account_erasure_identity_outbox TO anon`;
    await sql`GRANT SELECT (identity_hash)
      ON TABLE public.account_erasure_identity_outbox TO authenticated`;
    await sql`GRANT UPDATE (updated_at)
      ON TABLE public.account_erasure_identity_outbox TO PUBLIC`;
    await sql`
      CREATE POLICY epetrecere_0035_drift_policy
      ON public.account_erasure_identity_outbox
      FOR SELECT TO authenticated
      USING (true)
    `;
    await sql`ALTER TABLE public.account_erasure_identity_outbox
      DISABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.account_erasure_identity_outbox
      FORCE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.account_erasure_identity_outbox
      ALTER COLUMN status SET DEFAULT 'failed'`;
    await sql`ALTER TABLE public.account_erasure_identity_outbox
      DROP CONSTRAINT account_erasure_identity_attempts_chk`;
    await sql`ALTER TABLE public.account_erasure_identity_outbox
      ADD CONSTRAINT account_erasure_identity_attempts_chk CHECK (true)`;
    await sql`DROP INDEX public.account_erasure_identity_due_idx`;
    await sql`CREATE INDEX account_erasure_identity_due_idx
      ON public.account_erasure_identity_outbox (created_at)`;

    const seededViolations = await targetPrivilegeViolations();
    for (const role of auditedRoles) {
      if (!seededViolations.some((row) => row.roleName === role)) {
        throw new Error(`0035 privilege fixture did not expose ${role}`);
      }
    }

    applyMigration(config.url, "0035 second apply after safe catalog drift");
    const secondShape = await currentShape();
    assertHardened(secondShape, "0035 second apply");
    await assertAuditedRolesCannotRead("0035 second apply");
    assertExactStrings(
      await membershipShape(),
      expectedMemberships,
      "0035 memberships after reapply",
    );
    if (JSON.stringify(secondShape) !== JSON.stringify(firstShape)) {
      throw new Error(
        `0035 did not converge to the first catalog shape:\nfirst=${JSON.stringify(firstShape)}\nsecond=${JSON.stringify(secondShape)}`,
      );
    }

    await sql.unsafe(
      `CREATE INDEX "${unexpectedIndex}" ON public.${targetTable} (created_at)`,
    );
    expectMigrationRejected(
      config.url,
      "0035 extra-index lookalike",
      /non-canonical tombstone indexes/i,
    );
    await sql.unsafe(`DROP INDEX public."${unexpectedIndex}"`);

    await sql.unsafe(
      `ALTER TABLE public.${targetTable} ADD CONSTRAINT "${unexpectedConstraint}" CHECK (true)`,
    );
    expectMigrationRejected(
      config.url,
      "0035 extra-constraint lookalike",
      /unexpected\/unvalidated tombstone constraints/i,
    );
    await sql.unsafe(
      `ALTER TABLE public.${targetTable} DROP CONSTRAINT "${unexpectedConstraint}"`,
    );

    await sql`DROP INDEX public.account_erasure_identity_due_idx`;
    await sql.unsafe(
      `CREATE TABLE public."${indexLookalikeTable}" (id integer)`,
    );
    await sql.unsafe(
      `CREATE INDEX account_erasure_identity_due_idx ON public."${indexLookalikeTable}" (id)`,
    );
    expectMigrationRejected(
      config.url,
      "0035 foreign named-index lookalike",
      /refuses non-canonical named index object/i,
    );
    await dropLookalikeTable();
    applyMigration(config.url, "0035 restore after named-index lookalike");
    const restoredShape = await currentShape();
    assertHardened(restoredShape, "0035 restored shape");
    if (JSON.stringify(restoredShape) !== JSON.stringify(firstShape)) {
      throw new Error("0035 failed to restore after named-index lookalike");
    }

    await sql.unsafe(`ALTER TABLE public.${targetTable} SET UNLOGGED`);
    expectMigrationRejected(
      config.url,
      "0035 unlogged-relation lookalike",
      /requires a current-user-owned permanent non-partitioned non-inherited ordinary tombstone table/i,
    );
    await sql.unsafe(`ALTER TABLE public.${targetTable} SET LOGGED`);

    await sql.unsafe(
      `CREATE TABLE public."${inheritanceParentTable}" (identity_hash text NOT NULL)`,
    );
    await sql.unsafe(
      `ALTER TABLE public.${targetTable} INHERIT public."${inheritanceParentTable}"`,
    );
    expectMigrationRejected(
      config.url,
      "0035 inherited-relation lookalike",
      /requires a current-user-owned permanent non-partitioned non-inherited ordinary tombstone table/i,
    );
    await dropInheritanceParent();

    await expectTransactionalMigrationRejected(
      "0035 extra-column lookalike",
      /incompatible account_erasure_identity_outbox shape/i,
      async (tx) => {
        await tx.unsafe(
          `ALTER TABLE public.${targetTable} ADD COLUMN "${unexpectedColumn}" text`,
        );
      },
    );
    await expectTransactionalMigrationRejected(
      "0035 dropped-column metadata lookalike",
      /refuses dropped\/identity\/generated\/typmod\/inherited tombstone column drift/i,
      async (tx) => {
        await tx.unsafe(
          `ALTER TABLE public.${targetTable} ADD COLUMN "${unexpectedColumn}" text`,
        );
        await tx.unsafe(
          `ALTER TABLE public.${targetTable} DROP COLUMN "${unexpectedColumn}"`,
        );
      },
    );

    console.log("0035 account-erasure identity migration verification passed.");
  } finally {
    if (await relationExists(targetTable)) {
      await sql.unsafe(
        `ALTER TABLE public.${targetTable} DROP CONSTRAINT IF EXISTS "${unexpectedConstraint}"`,
      );
      await sql.unsafe(`DROP INDEX IF EXISTS public."${unexpectedIndex}"`);
      await sql.unsafe(
        `ALTER TABLE public.${targetTable} DROP COLUMN IF EXISTS "${unexpectedColumn}"`,
      );
    }
    await dropLookalikeTable();
    await dropInheritanceParent();
    await dropFixtureRoles();
    await sql.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
