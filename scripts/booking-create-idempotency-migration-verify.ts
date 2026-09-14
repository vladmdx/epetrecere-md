/**
 * Verify manual migration 0033 on a guarded disposable loopback database.
 *
 * The verifier requires an actual post-0031 + post-0032 / pre-0033 baseline,
 * applies 0033 twice, compares the complete catalog shape, and exercises the
 * CHECK, uniqueness, cascade, SET NULL, RLS, and privilege guarantees.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0033 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0033_booking_request_creation_idempotency.sql";
const inheritedRole = "epetrecere_booking_0033_inherited";

type ColumnShape = {
  tableName: string;
  columnName: string;
  dataType: string;
  udtName: string;
  nullable: "YES" | "NO";
  defaultValue: string | null;
  identity: "YES" | "NO";
  identityGeneration: string | null;
  generated: "ALWAYS" | "NEVER";
  generationExpression: string | null;
};

type CheckShape = {
  constraintName: string;
  constraintType: string;
  expression: string;
  valid: boolean;
  inheritable: boolean;
  deferrable: boolean;
  deferred: boolean;
};

type IndexShape = {
  indexName: string;
  tableName: string;
  accessMethod: string;
  keyColumns: string[];
  opclassNames: string[];
  options: number[];
  predicate: string | null;
  indexDefinition: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  primary: boolean;
  exclusion: boolean;
  immediate: boolean;
  clustered: boolean;
  replicaIdentity: boolean;
  expressionFree: boolean;
  usesColumnCollations: boolean;
  opclassesDefault: boolean;
  keyCount: number;
  attributeCount: number;
  tablespaceOid: number;
  relationOptions: string[] | null;
};

type ForeignKeyShape = {
  constraintName: string;
  sourceTable: string;
  targetTable: string;
  sourceColumns: string[];
  targetColumns: string[];
  deleteAction: string;
  updateAction: string;
  matchType: string;
  valid: boolean;
  deferrable: boolean;
  deferred: boolean;
  local: boolean;
  inheritanceCount: number;
  parentConstraintOid: number;
};

type RlsShape = {
  tableName: string;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
};

type PrivilegeViolation = {
  roleName: string;
  objectKind: string;
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
        {
          cause: error,
        },
      );
    }
    console.log(`-- ${label}: rejected as expected`);
    return;
  }
  throw new Error(`${label}: non-canonical FK drift was unexpectedly accepted`);
}

async function expectPgCode(
  operation: () => Promise<unknown>,
  code: string,
  label: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw new Error(
      `${label}: expected PostgreSQL ${code}, got ${(error as { code?: string }).code ?? "unknown"}`,
      { cause: error },
    );
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
}

function normalizedSql(value: string | null): string | null {
  return value?.toLowerCase().replace(/[\s()\"]/g, "") ?? null;
}

function assertExactNames(
  actual: string[],
  expected: string[],
  label: string,
): void {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(sortedActual)}`,
    );
  }
}

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "booking_requests_creation_request_shape_chk",
    "booking_requests_creation_scope_request_uidx",
    "offer_requests_booking_request_fk",
    "offer_requests_booking_request_uidx",
    "ON DELETE CASCADE",
    "ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE",
    "HAVING count(*) > 1",
    "REVOKE ALL PRIVILEGES ON TABLE",
    "REVOKE ALL PRIVILEGES ON SEQUENCE",
    "ENABLE ROW LEVEL SECURITY",
    "NO FORCE ROW LEVEL SECURITY",
    "0033 does not mutate parent-role ACLs",
    "0033 found a non-canonical booking creation-request index",
    "0033 found non-canonical or additional offer-to-booking foreign keys",
    "source_attnum = ANY(fk.conkey)",
    "0033 found composite or additional FKs involving offer_requests.%s",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0033 source guarantee missing: ${guarantee}`);
    }
  }
  if (source.includes("WITH RECURSIVE inherited_roles")) {
    throw new Error("0033 must not revoke ACLs from inherited parent roles");
  }

  const sql = postgres(config.url, {
    max: 1,
    prepare: false,
    ssl: false,
  });
  let legacyBookingId: number | null = null;
  const legacyOfferIds: number[] = [];
  let fixtureArtistId: number | null = null;
  let fixtureVenueId: number | null = null;
  let detachmentBookingId: number | null = null;
  let keyedBookingId: number | null = null;
  let privilegeFixtureStarted = false;
  const mark = `m33_${Date.now()}_${randomUUID().slice(0, 8)}`;

  async function dropInheritedTestRole(): Promise<void> {
    const [role] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${inheritedRole}
      ) AS exists
    `;
    if (!role?.exists) return;

    for (const member of ["anon", "authenticated"]) {
      const [membership] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_auth_members AS membership
          JOIN pg_roles AS parent ON parent.oid = membership.roleid
          JOIN pg_roles AS child ON child.oid = membership.member
          WHERE parent.rolname = ${inheritedRole}
            AND child.rolname = ${member}
        ) AS exists
      `;
      if (membership?.exists) {
        await sql.unsafe(`REVOKE "${inheritedRole}" FROM "${member}"`);
      }
    }
    await sql.unsafe(`DROP OWNED BY "${inheritedRole}"`);
    await sql.unsafe(`DROP ROLE "${inheritedRole}"`);
  }

  async function inheritedParentState() {
    const acl = await sql<
      {
        objectKind: string;
        objectName: string;
        privilege: string;
        grantable: boolean;
      }[]
    >`
      SELECT CASE WHEN relation.relkind = 'S' THEN 'sequence' ELSE 'table' END
          AS "objectKind",
        format('public.%I', relation.relname) AS "objectName",
        privilege.privilege_type AS privilege,
        privilege.is_grantable AS grantable
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL aclexplode(relation.relacl) AS privilege
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'booking_requests', 'offer_requests',
          'booking_requests_id_seq', 'offer_requests_id_seq'
        )
        AND privilege.grantee = (
          SELECT oid FROM pg_roles WHERE rolname = ${inheritedRole}
        )
      ORDER BY 2, 1, 3, 4
    `;
    const memberships = await sql<{ member: string }[]>`
      SELECT child.rolname AS member
      FROM pg_auth_members AS membership
      JOIN pg_roles AS parent ON parent.oid = membership.roleid
      JOIN pg_roles AS child ON child.oid = membership.member
      WHERE parent.rolname = ${inheritedRole}
      ORDER BY child.rolname
    `;
    return { acl, members: memberships.map((row) => row.member) };
  }

  async function offerTargetForeignKeys(): Promise<ForeignKeyShape[]> {
    return sql<ForeignKeyShape[]>`
      SELECT fk.conname AS "constraintName",
        source_relation.relname AS "sourceTable",
        target_relation.relname AS "targetTable",
        ARRAY(
          SELECT source_attribute.attname::text
          FROM unnest(fk.conkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_attribute AS source_attribute
            ON source_attribute.attrelid = fk.conrelid
           AND source_attribute.attnum = key.attnum
          ORDER BY key.position
        ) AS "sourceColumns",
        ARRAY(
          SELECT target_attribute.attname::text
          FROM unnest(fk.confkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_attribute AS target_attribute
            ON target_attribute.attrelid = fk.confrelid
           AND target_attribute.attnum = key.attnum
          ORDER BY key.position
        ) AS "targetColumns",
        fk.confdeltype::text AS "deleteAction",
        fk.confupdtype::text AS "updateAction",
        fk.confmatchtype::text AS "matchType",
        fk.convalidated AS valid,
        fk.condeferrable AS deferrable,
        fk.condeferred AS deferred,
        fk.conislocal AS local,
        fk.coninhcount::int AS "inheritanceCount",
        fk.conparentid::int AS "parentConstraintOid"
      FROM pg_constraint AS fk
      JOIN pg_class AS source_relation ON source_relation.oid = fk.conrelid
      JOIN pg_class AS target_relation ON target_relation.oid = fk.confrelid
      WHERE fk.conrelid = 'public.offer_requests'::regclass
        AND fk.contype = 'f'
        AND EXISTS (
          SELECT 1
          FROM unnest(fk.conkey) AS key(attnum)
          JOIN pg_attribute AS source_attribute
            ON source_attribute.attrelid = fk.conrelid
           AND source_attribute.attnum = key.attnum
          WHERE source_attribute.attname IN (
            'booking_request_id', 'artist_id', 'venue_id'
          )
        )
      ORDER BY fk.conname
    `;
  }

  function assertForeignKeys(
    foreignKeys: ForeignKeyShape[],
    expected: Array<{
      name: string;
      source: string;
      targetTable: string;
      deleteAction: "c" | "n";
    }>,
    label: string,
  ): void {
    if (foreignKeys.length !== expected.length) {
      throw new Error(
        `${label}: unexpected target FKs ${JSON.stringify(foreignKeys)}`,
      );
    }
    for (const specification of expected) {
      const foreignKey = foreignKeys.find(
        (candidate) => candidate.constraintName === specification.name,
      );
      if (
        !foreignKey ||
        foreignKey.sourceTable !== "offer_requests" ||
        foreignKey.targetTable !== specification.targetTable ||
        JSON.stringify(foreignKey.sourceColumns) !==
          JSON.stringify([specification.source]) ||
        JSON.stringify(foreignKey.targetColumns) !== JSON.stringify(["id"]) ||
        foreignKey.deleteAction !== specification.deleteAction ||
        foreignKey.updateAction !== "a" ||
        foreignKey.matchType !== "s" ||
        !foreignKey.valid ||
        foreignKey.deferrable ||
        foreignKey.deferred ||
        !foreignKey.local ||
        foreignKey.inheritanceCount !== 0 ||
        foreignKey.parentConstraintOid !== 0
      ) {
        throw new Error(
          `${label}: non-canonical ${specification.name}: ${JSON.stringify(foreignKey)}`,
        );
      }
    }
  }

  async function privilegeViolations(): Promise<PrivilegeViolation[]> {
    return sql<PrivilegeViolation[]>`
      WITH target_roles(role_name) AS (
        VALUES ('anon'::text), ('authenticated'::text), (${inheritedRole}::text)
      ), target_tables(table_name) AS (
        VALUES ('booking_requests'::text), ('offer_requests'::text)
      ), table_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]::text[])
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[])
      ), target_sequences(sequence_name) AS (
        VALUES
          ('booking_requests_id_seq'::text),
          ('offer_requests_id_seq'::text)
      ), sequence_privileges(privilege) AS (
        SELECT unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']::text[])
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
        AND column_info.table_name IN ('booking_requests', 'offer_requests')
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
      WHERE to_regclass(format('public.%I', target_sequence.sequence_name)) IS NOT NULL
        AND has_sequence_privilege(
          role.rolname,
          format('public.%I', target_sequence.sequence_name),
          sequence_privilege.privilege
        )
      ORDER BY 1, 2, 3, 4
    `;
  }

  async function assertRolesCannotRead(label: string): Promise<void> {
    for (const role of ["anon", "authenticated", inheritedRole]) {
      for (const table of ["booking_requests", "offer_requests"]) {
        let blocked = false;
        await sql`BEGIN`;
        try {
          await sql.unsafe(`SET LOCAL ROLE "${role}"`);
          await sql.unsafe(`SELECT id FROM public.${table} LIMIT 0`);
        } catch (error) {
          blocked = (error as { code?: string }).code === "42501";
        } finally {
          await sql`ROLLBACK`;
        }
        if (!blocked) {
          throw new Error(`${label}: SET ROLE ${role} could read ${table}`);
        }
      }
    }
  }

  async function currentShape() {
    const columns = await sql<ColumnShape[]>`
      SELECT table_name AS "tableName",
        column_name AS "columnName",
        data_type AS "dataType",
        udt_name AS "udtName",
        is_nullable AS nullable,
        column_default AS "defaultValue",
        is_identity AS identity,
        identity_generation AS "identityGeneration",
        is_generated AS generated,
        generation_expression AS "generationExpression"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'booking_requests' AND column_name IN (
            'creation_scope_hash', 'creation_request_id',
            'creation_payload_hash'
          ))
          OR (table_name = 'offer_requests' AND column_name = 'booking_request_id')
        )
      ORDER BY table_name, ordinal_position
    `;
    const checks = await sql<CheckShape[]>`
      SELECT check_constraint.conname AS "constraintName",
        check_constraint.contype::text AS "constraintType",
        regexp_replace(
          lower(pg_get_expr(check_constraint.conbin, check_constraint.conrelid)),
          '[[:space:]()]', '', 'g'
        ) AS expression,
        check_constraint.convalidated AS valid,
        NOT check_constraint.connoinherit AS inheritable,
        check_constraint.condeferrable AS deferrable,
        check_constraint.condeferred AS deferred
      FROM pg_constraint AS check_constraint
      WHERE check_constraint.conrelid = 'public.booking_requests'::regclass
        AND check_constraint.conname = 'booking_requests_creation_request_shape_chk'
      ORDER BY check_constraint.conname
    `;
    const indexes = await sql<IndexShape[]>`
      SELECT index_relation.relname AS "indexName",
        table_relation.relname AS "tableName",
        access_method.amname AS "accessMethod",
        ARRAY(
          SELECT attribute.attname::text
          FROM generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          ORDER BY key_position.position
        ) AS "keyColumns",
        ARRAY(
          SELECT operator_class.opcname::text
          FROM generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
          ORDER BY key_position.position
        ) AS "opclassNames",
        ARRAY(
          SELECT index_catalog.indoption[key_position.position]::int
          FROM generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
          ORDER BY key_position.position
        ) AS options,
        regexp_replace(
          lower(pg_get_expr(index_catalog.indpred, index_catalog.indrelid)),
          '[[:space:]()]', '', 'g'
        ) AS predicate,
        pg_get_indexdef(index_catalog.indexrelid) AS "indexDefinition",
        index_catalog.indisunique AS unique,
        index_catalog.indisvalid AS valid,
        index_catalog.indisready AS ready,
        index_catalog.indislive AS live,
        index_catalog.indisprimary AS primary,
        index_catalog.indisexclusion AS exclusion,
        index_catalog.indimmediate AS immediate,
        index_catalog.indisclustered AS clustered,
        index_catalog.indisreplident AS "replicaIdentity",
        index_catalog.indexprs IS NULL AS "expressionFree",
        NOT EXISTS (
          SELECT 1
          FROM generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index_catalog.indrelid
           AND attribute.attnum = index_catalog.indkey[key_position.position]
          WHERE index_catalog.indcollation[key_position.position]
            IS DISTINCT FROM attribute.attcollation
        ) AS "usesColumnCollations",
        (
          SELECT bool_and(operator_class.opcdefault)
          FROM generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
          JOIN pg_opclass AS operator_class
            ON operator_class.oid = index_catalog.indclass[key_position.position]
        ) AS "opclassesDefault",
        index_catalog.indnkeyatts::int AS "keyCount",
        index_catalog.indnatts::int AS "attributeCount",
        index_relation.reltablespace::int AS "tablespaceOid",
        index_relation.reloptions AS "relationOptions"
      FROM pg_class AS index_relation
      JOIN pg_namespace AS index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      JOIN pg_index AS index_catalog
        ON index_catalog.indexrelid = index_relation.oid
      JOIN pg_class AS table_relation
        ON table_relation.oid = index_catalog.indrelid
      JOIN pg_am AS access_method
        ON access_method.oid = index_relation.relam
      WHERE index_namespace.nspname = 'public'
        AND index_relation.relname IN (
          'booking_requests_creation_scope_request_uidx',
          'offer_requests_booking_request_uidx'
        )
      ORDER BY index_relation.relname
    `;
    const foreignKeys = await offerTargetForeignKeys();
    const rls = await sql<RlsShape[]>`
      SELECT relation.relname AS "tableName",
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity"
      FROM pg_class AS relation
      WHERE relation.oid IN (
        'public.booking_requests'::regclass,
        'public.offer_requests'::regclass
      )
      ORDER BY relation.relname
    `;
    const privileges = await privilegeViolations();
    return { columns, checks, indexes, foreignKeys, rls, privileges };
  }

  function assertCurrentShape(
    shape: Awaited<ReturnType<typeof currentShape>>,
    label: string,
  ): void {
    const expectedColumns = new Map<
      string,
      { dataType: string; udtName: string }
    >([
      [
        "booking_requests.creation_scope_hash",
        { dataType: "text", udtName: "text" },
      ],
      [
        "booking_requests.creation_request_id",
        { dataType: "uuid", udtName: "uuid" },
      ],
      [
        "booking_requests.creation_payload_hash",
        { dataType: "text", udtName: "text" },
      ],
      [
        "offer_requests.booking_request_id",
        { dataType: "integer", udtName: "int4" },
      ],
    ]);
    if (shape.columns.length !== expectedColumns.size) {
      throw new Error(
        `${label}: incomplete 0033 columns ${JSON.stringify(shape.columns)}`,
      );
    }
    for (const column of shape.columns) {
      const expected = expectedColumns.get(
        `${column.tableName}.${column.columnName}`,
      );
      if (
        !expected ||
        column.dataType !== expected.dataType ||
        column.udtName !== expected.udtName ||
        column.nullable !== "YES" ||
        column.defaultValue !== null ||
        column.identity !== "NO" ||
        column.identityGeneration !== null ||
        column.generated !== "NEVER" ||
        column.generationExpression !== null
      ) {
        throw new Error(
          `${label}: non-canonical column ${JSON.stringify(column)}`,
        );
      }
    }

    const expectedCheckExpression =
      "creation_scope_hashisnullandcreation_request_idisnullandcreation_payload_hashisnullorcreation_scope_hashisnotnullandcreation_request_idisnotnullandcreation_payload_hashisnotnull";
    if (
      shape.checks.length !== 1 ||
      shape.checks[0]?.constraintName !==
        "booking_requests_creation_request_shape_chk" ||
      shape.checks[0].constraintType !== "c" ||
      shape.checks[0].expression !== expectedCheckExpression ||
      !shape.checks[0].valid ||
      !shape.checks[0].inheritable ||
      shape.checks[0].deferrable ||
      shape.checks[0].deferred
    ) {
      throw new Error(
        `${label}: non-canonical CHECK ${JSON.stringify(shape.checks)}`,
      );
    }

    const expectedIndexes = [
      {
        name: "booking_requests_creation_scope_request_uidx",
        table: "booking_requests",
        columns: ["creation_scope_hash", "creation_request_id"],
        opclasses: ["text_ops", "uuid_ops"],
        predicate:
          "creation_scope_hashisnotnullandcreation_request_idisnotnull",
        definition:
          "CREATE UNIQUE INDEX booking_requests_creation_scope_request_uidx ON public.booking_requests USING btree (creation_scope_hash, creation_request_id) WHERE ((creation_scope_hash IS NOT NULL) AND (creation_request_id IS NOT NULL))",
      },
      {
        name: "offer_requests_booking_request_uidx",
        table: "offer_requests",
        columns: ["booking_request_id"],
        opclasses: ["int4_ops"],
        predicate: "booking_request_idisnotnull",
        definition:
          "CREATE UNIQUE INDEX offer_requests_booking_request_uidx ON public.offer_requests USING btree (booking_request_id) WHERE (booking_request_id IS NOT NULL)",
      },
    ];
    if (shape.indexes.length !== expectedIndexes.length) {
      throw new Error(
        `${label}: incomplete indexes ${JSON.stringify(shape.indexes)}`,
      );
    }
    for (const expected of expectedIndexes) {
      const index = shape.indexes.find(
        (candidate) => candidate.indexName === expected.name,
      );
      if (
        !index ||
        index.tableName !== expected.table ||
        index.accessMethod !== "btree" ||
        JSON.stringify(index.keyColumns) !== JSON.stringify(expected.columns) ||
        JSON.stringify(index.opclassNames) !==
          JSON.stringify(expected.opclasses) ||
        index.options.some((option) => option !== 0) ||
        index.predicate !== expected.predicate ||
        normalizedSql(index.indexDefinition) !==
          normalizedSql(expected.definition) ||
        !index.unique ||
        !index.valid ||
        !index.ready ||
        !index.live ||
        index.primary ||
        index.exclusion ||
        !index.immediate ||
        index.clustered ||
        index.replicaIdentity ||
        !index.expressionFree ||
        !index.usesColumnCollations ||
        !index.opclassesDefault ||
        index.keyCount !== expected.columns.length ||
        index.attributeCount !== expected.columns.length ||
        index.tablespaceOid !== 0 ||
        index.relationOptions !== null
      ) {
        throw new Error(
          `${label}: non-canonical ${expected.name}: ${JSON.stringify(index)}`,
        );
      }
    }

    assertForeignKeys(
      shape.foreignKeys,
      [
        {
          name: "offer_requests_artist_id_artists_id_fk",
          source: "artist_id",
          targetTable: "artists",
          deleteAction: "n",
        },
        {
          name: "offer_requests_booking_request_fk",
          source: "booking_request_id",
          targetTable: "booking_requests",
          deleteAction: "c",
        },
        {
          name: "offer_requests_venue_id_venues_id_fk",
          source: "venue_id",
          targetTable: "venues",
          deleteAction: "n",
        },
      ],
      label,
    );

    if (
      shape.rls.length !== 2 ||
      shape.rls.some((table) => !table.rowSecurity || table.forceRowSecurity)
    ) {
      throw new Error(
        `${label}: RLS is not enabled ${JSON.stringify(shape.rls)}`,
      );
    }
    if (shape.privileges.length !== 0) {
      throw new Error(
        `${label}: effective browser-role privileges remain ${JSON.stringify(shape.privileges)}`,
      );
    }
  }

  try {
    const baselineColumns = await sql<{ objectName: string }[]>`
      SELECT format('%s.%s', table_name, column_name) AS "objectName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'booking_requests' AND column_name = 'artist_name_snapshot')
          OR (table_name = 'booking_effect_outbox' AND column_name IN (
            'referral_status', 'materialization_status'
          ))
          OR (table_name = 'booking_effect_deliveries' AND column_name IN (
            'dispatch_started_at', 'cancel_requested_at'
          ))
          OR (table_name = 'partner_organizations' AND column_name IN (
            'creation_actor_user_id', 'creation_request_id', 'creation_request_hash'
          ))
          OR (table_name = 'venues' AND column_name IN (
            'onboarding_submission_id', 'onboarding_submission_hash'
          ))
          OR (table_name = 'venue_halls' AND column_name IN (
            'creation_request_id', 'creation_payload_hash'
          ))
        )
      ORDER BY 1
    `;
    assertExactNames(
      baselineColumns.map((column) => column.objectName),
      [
        "booking_requests.artist_name_snapshot",
        "booking_effect_outbox.referral_status",
        "booking_effect_outbox.materialization_status",
        "booking_effect_deliveries.dispatch_started_at",
        "booking_effect_deliveries.cancel_requested_at",
        "partner_organizations.creation_actor_user_id",
        "partner_organizations.creation_request_id",
        "partner_organizations.creation_request_hash",
        "venues.onboarding_submission_id",
        "venues.onboarding_submission_hash",
        "venue_halls.creation_request_id",
        "venue_halls.creation_payload_hash",
      ],
      "0033 requires the post-0031 + post-0032 baseline columns",
    );

    const baselineConstraints = await sql<{ objectName: string }[]>`
      SELECT constraint_catalog.conname AS "objectName"
      FROM pg_constraint AS constraint_catalog
      WHERE constraint_catalog.conname IN (
        'booking_requests_artist_fk',
        'booking_effect_outbox_booking_key_unique',
        'booking_effect_outbox_booking_fk',
        'booking_effect_outbox_step_status_chk',
        'booking_effect_deliveries_pkey',
        'booking_effect_deliveries_effect_fk',
        'booking_effect_deliveries_effect_recipient_channel_unique',
        'booking_effect_deliveries_dedupe_unique',
        'partner_organizations_creation_actor_user_id_fkey',
        'partner_organizations_creation_request_shape_chk',
        'venues_onboarding_submission_shape_chk',
        'venue_halls_creation_request_shape_chk',
        'venue_images_hall_cannot_be_cover_chk',
        'legal_acceptances_org_profile_scope_chk'
      )
        AND constraint_catalog.convalidated
      ORDER BY constraint_catalog.conname
    `;
    assertExactNames(
      baselineConstraints.map((constraint) => constraint.objectName),
      [
        "booking_requests_artist_fk",
        "booking_effect_outbox_booking_key_unique",
        "booking_effect_outbox_booking_fk",
        "booking_effect_outbox_step_status_chk",
        "booking_effect_deliveries_pkey",
        "booking_effect_deliveries_effect_fk",
        "booking_effect_deliveries_effect_recipient_channel_unique",
        "booking_effect_deliveries_dedupe_unique",
        "partner_organizations_creation_actor_user_id_fkey",
        "partner_organizations_creation_request_shape_chk",
        "venues_onboarding_submission_shape_chk",
        "venue_halls_creation_request_shape_chk",
        "venue_images_hall_cannot_be_cover_chk",
        "legal_acceptances_org_profile_scope_chk",
      ],
      "0033 requires valid post-0031 + post-0032 constraints",
    );

    const baselineIndexes = await sql<{ objectName: string }[]>`
      SELECT index_relation.relname AS "objectName"
      FROM pg_class AS index_relation
      JOIN pg_namespace AS namespace
        ON namespace.oid = index_relation.relnamespace
      JOIN pg_index AS index_catalog
        ON index_catalog.indexrelid = index_relation.oid
      WHERE namespace.nspname = 'public'
        AND index_relation.relname IN (
          'booking_effect_outbox_due_idx',
          'booking_effect_outbox_expired_lease_idx',
          'booking_effect_deliveries_due_idx',
          'booking_effect_deliveries_expired_lease_idx',
          'partner_organizations_actor_creation_request_uidx',
          'venues_user_id_not_null_uidx',
          'venues_org_onboarding_submission_uidx',
          'venue_halls_venue_creation_request_uidx',
          'venue_images_one_general_cover_per_venue_uidx'
        )
        AND index_catalog.indisvalid
        AND index_catalog.indisready
      ORDER BY index_relation.relname
    `;
    assertExactNames(
      baselineIndexes.map((index) => index.objectName),
      [
        "booking_effect_outbox_due_idx",
        "booking_effect_outbox_expired_lease_idx",
        "booking_effect_deliveries_due_idx",
        "booking_effect_deliveries_expired_lease_idx",
        "partner_organizations_actor_creation_request_uidx",
        "venues_user_id_not_null_uidx",
        "venues_org_onboarding_submission_uidx",
        "venue_halls_venue_creation_request_uidx",
        "venue_images_one_general_cover_per_venue_uidx",
      ],
      "0033 requires valid post-0031 + post-0032 indexes",
    );

    const [baselineRls] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_class
      WHERE oid IN (
        'public.booking_effect_outbox'::regclass,
        'public.booking_effect_deliveries'::regclass,
        'public.venues'::regclass,
        'public.venue_images'::regclass
      )
        AND relrowsecurity
    `;
    if (baselineRls?.count !== 4) {
      throw new Error(
        `0033 requires the RLS-hardened post-0031 + post-0032 baseline: ${JSON.stringify(baselineRls)}`,
      );
    }

    const [pre0033] = await sql<
      {
        columns: number;
        constraints: number;
        indexes: number;
        browserRoles: number;
      }[]
    >`
      SELECT
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'booking_requests' AND column_name IN (
                'creation_scope_hash', 'creation_request_id',
                'creation_payload_hash'
              ))
              OR (table_name = 'offer_requests' AND column_name = 'booking_request_id')
            )
        ) AS columns,
        (
          SELECT count(*)::int
          FROM pg_constraint
          WHERE conname IN (
            'booking_requests_creation_request_shape_chk',
            'offer_requests_booking_request_fk'
          )
        ) AS constraints,
        (
          SELECT count(*)::int
          FROM pg_class AS index_relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = index_relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND index_relation.relname IN (
              'booking_requests_creation_scope_request_uidx',
              'offer_requests_booking_request_uidx'
            )
        ) AS indexes,
        (
          SELECT count(*)::int
          FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        ) AS "browserRoles"
    `;
    if (
      pre0033?.columns !== 0 ||
      pre0033.constraints !== 0 ||
      pre0033.indexes !== 0 ||
      pre0033.browserRoles !== 2
    ) {
      throw new Error(
        `0033 verification requires a genuine Supabase post-0031 + post-0032 / pre-0033 baseline: ${JSON.stringify(pre0033)}`,
      );
    }

    assertForeignKeys(
      await offerTargetForeignKeys(),
      [
        {
          name: "offer_requests_artist_id_artists_id_fk",
          source: "artist_id",
          targetTable: "artists",
          deleteAction: "c",
        },
        {
          name: "offer_requests_venue_id_venues_id_fk",
          source: "venue_id",
          targetTable: "venues",
          deleteAction: "c",
        },
      ],
      "0033 requires the legacy pre-0033 offer target FKs",
    );

    const [legacyBooking] = await sql<{ id: number }[]>`
      INSERT INTO public.booking_requests (
        client_name, client_phone, event_date, status, source
      ) VALUES (${mark}, '+37369000001', '2033-01-01', 'pending', 'client')
      RETURNING id
    `;
    legacyBookingId = legacyBooking.id;

    const [artist] = await sql<{ id: number }[]>`
      INSERT INTO public.artists (name_ro, slug, is_active)
      VALUES (${`${mark} artist`}, ${`${mark}-artist`}, false)
      RETURNING id
    `;
    fixtureArtistId = artist.id;
    const [venue] = await sql<{ id: number }[]>`
      INSERT INTO public.venues (name_ro, slug, is_active)
      VALUES (${`${mark} venue`}, ${`${mark}-venue`}, false)
      RETURNING id
    `;
    fixtureVenueId = venue.id;
    const targetOffers = await sql<{ id: number }[]>`
      INSERT INTO public.offer_requests (
        artist_id, venue_id, client_name, client_phone, event_date, status, source
      ) VALUES
        (${fixtureArtistId}, NULL, ${`${mark} artist offer`}, '+37369000001', '2033-01-01', 'new', 'form'),
        (NULL, ${fixtureVenueId}, ${`${mark} venue offer`}, '+37369000001', '2033-01-01', 'new', 'form')
      RETURNING id
    `;
    legacyOfferIds.push(...targetOffers.map((offer) => offer.id));

    // Direct/PUBLIC grants are in 0033's ownership boundary and must be
    // revoked. A grant on an inherited parent is not: the migration must abort
    // without changing that parent's ACL or membership because other roles may
    // also depend on it.
    await dropInheritedTestRole();
    await sql.unsafe(`CREATE ROLE "${inheritedRole}" NOLOGIN`);
    privilegeFixtureStarted = true;
    await sql.unsafe(`GRANT "${inheritedRole}" TO "anon", "authenticated"`);
    await sql.unsafe(
      `GRANT SELECT ON TABLE public.booking_requests TO "${inheritedRole}"`,
    );
    await sql`GRANT INSERT ON TABLE public.offer_requests TO anon`;
    await sql`GRANT UPDATE (client_name) ON TABLE public.booking_requests TO authenticated`;
    await sql`GRANT SELECT (id) ON TABLE public.offer_requests TO PUBLIC`;
    await sql.unsafe(
      `GRANT UPDATE ON SEQUENCE public.offer_requests_id_seq TO "${inheritedRole}"`,
    );
    await sql`GRANT SELECT ON SEQUENCE public.booking_requests_id_seq TO authenticated`;
    await sql`GRANT USAGE ON SEQUENCE public.offer_requests_id_seq TO PUBLIC`;

    const seededViolations = await privilegeViolations();
    for (const role of ["anon", "authenticated", inheritedRole]) {
      if (!seededViolations.some((violation) => violation.roleName === role)) {
        throw new Error(`0033 privilege fixture did not expose ${role}`);
      }
    }
    const inheritedReaders = await sql<{ roleName: string }[]>`
      SELECT rolname AS "roleName"
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
        AND has_table_privilege(
          rolname,
          'public.booking_requests',
          'SELECT'
        )
      ORDER BY rolname
    `;
    if (
      JSON.stringify(inheritedReaders.map((role) => role.roleName)) !==
      JSON.stringify(["anon", "authenticated"])
    ) {
      throw new Error(
        `0033 parent grant is not effectively inherited by both browser roles: ${JSON.stringify(inheritedReaders)}`,
      );
    }

    const parentBeforeRejectedApply = await inheritedParentState();
    if (
      JSON.stringify(parentBeforeRejectedApply) !==
      JSON.stringify({
        acl: [
          {
            objectKind: "table",
            objectName: "public.booking_requests",
            privilege: "SELECT",
            grantable: false,
          },
          {
            objectKind: "sequence",
            objectName: "public.offer_requests_id_seq",
            privilege: "UPDATE",
            grantable: false,
          },
        ],
        members: ["anon", "authenticated"],
      })
    ) {
      throw new Error(
        `0033 inherited-role fixture has an unexpected shape: ${JSON.stringify(parentBeforeRejectedApply)}`,
      );
    }

    expectMigrationRejected(
      config.url,
      "0033 inherited parent-role grant",
      /42501|could not remove effective/i,
    );
    const parentAfterRejectedApply = await inheritedParentState();
    if (
      JSON.stringify(parentAfterRejectedApply) !==
      JSON.stringify(parentBeforeRejectedApply)
    ) {
      throw new Error(
        `0033 mutated inherited parent ACL/membership on rejection: before=${JSON.stringify(parentBeforeRejectedApply)} after=${JSON.stringify(parentAfterRejectedApply)}`,
      );
    }
    const [rejectedApplyState] = await sql<{ newColumns: number }[]>`
      SELECT count(*)::int AS "newColumns"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'booking_requests' AND column_name IN (
            'creation_scope_hash', 'creation_request_id',
            'creation_payload_hash'
          ))
          OR (table_name = 'offer_requests' AND column_name = 'booking_request_id')
        )
    `;
    if (rejectedApplyState?.newColumns !== 0) {
      throw new Error(
        `0033 inherited-role rejection was not transactional: ${JSON.stringify(rejectedApplyState)}`,
      );
    }

    await sql.unsafe(`REVOKE "${inheritedRole}" FROM "anon", "authenticated"`);
    await sql.unsafe(
      `REVOKE SELECT ON TABLE public.booking_requests FROM "${inheritedRole}"`,
    );
    await sql.unsafe(
      `REVOKE UPDATE ON SEQUENCE public.offer_requests_id_seq FROM "${inheritedRole}"`,
    );
    const cleanedParent = await inheritedParentState();
    if (cleanedParent.acl.length !== 0 || cleanedParent.members.length !== 0) {
      throw new Error(
        `0033 inherited-role fixture cleanup failed: ${JSON.stringify(cleanedParent)}`,
      );
    }

    applyMigration(config.url, "0033 first apply");
    const firstShape = await currentShape();
    assertCurrentShape(firstShape, "0033 first apply");
    await assertRolesCannotRead("0033 first apply");

    // A same-column FK hidden inside a composite, or a second single-column
    // target FK, must make reapplication fail closed. Both drift fixtures are
    // outside the migration transaction and are removed before the valid
    // second apply below.
    await sql`
      CREATE UNIQUE INDEX m33_verify_booking_artist_uidx
      ON public.booking_requests (id, artist_id)
    `;
    await sql`
      ALTER TABLE public.offer_requests
      ADD CONSTRAINT m33_verify_composite_booking_fk
      FOREIGN KEY (booking_request_id, artist_id)
      REFERENCES public.booking_requests (id, artist_id)
    `;
    expectMigrationRejected(
      config.url,
      "0033 composite booking_request_id FK drift",
      /non-canonical or additional offer-to-booking/i,
    );
    await sql`
      ALTER TABLE public.offer_requests
      DROP CONSTRAINT m33_verify_composite_booking_fk
    `;
    await sql`DROP INDEX public.m33_verify_booking_artist_uidx`;

    await sql`
      ALTER TABLE public.offer_requests
      ADD CONSTRAINT m33_verify_extra_artist_fk
      FOREIGN KEY (artist_id) REFERENCES public.artists (id)
      ON DELETE CASCADE
    `;
    expectMigrationRejected(
      config.url,
      "0033 additional artist_id FK drift",
      /composite or additional FKs involving offer_requests\.artist_id/i,
    );
    await sql`
      ALTER TABLE public.offer_requests
      DROP CONSTRAINT m33_verify_extra_artist_fk
    `;

    const [legacyState] = await sql<
      {
        scopeHash: string | null;
        requestId: string | null;
        payloadHash: string | null;
        linkedOffers: number;
      }[]
    >`
      SELECT booking.creation_scope_hash AS "scopeHash",
        booking.creation_request_id::text AS "requestId",
        booking.creation_payload_hash AS "payloadHash",
        (
          SELECT count(*)::int
          FROM public.offer_requests AS offer
          WHERE offer.id = ANY(${legacyOfferIds})
            AND offer.booking_request_id IS NOT NULL
        ) AS "linkedOffers"
      FROM public.booking_requests AS booking
      WHERE booking.id = ${legacyBookingId}
    `;
    if (
      !legacyState ||
      legacyState.scopeHash !== null ||
      legacyState.requestId !== null ||
      legacyState.payloadHash !== null ||
      legacyState.linkedOffers !== 0
    ) {
      throw new Error(
        `0033 changed legacy rows: ${JSON.stringify(legacyState)}`,
      );
    }

    applyMigration(config.url, "0033 second apply");
    const secondShape = await currentShape();
    assertCurrentShape(secondShape, "0033 second apply");
    await assertRolesCannotRead("0033 second apply");
    if (JSON.stringify(secondShape) !== JSON.stringify(firstShape)) {
      throw new Error(
        `0033 reapply changed catalog shape:\nfirst=${JSON.stringify(firstShape)}\nsecond=${JSON.stringify(secondShape)}`,
      );
    }

    const [detachmentBooking] = await sql<{ id: number }[]>`
      INSERT INTO public.booking_requests (
        client_name, client_phone, event_date, status, source
      ) VALUES (${`${mark} detach`}, '+37369000005', '2033-01-05', 'pending', 'client')
      RETURNING id
    `;
    detachmentBookingId = detachmentBooking.id;
    await sql`
      UPDATE public.offer_requests
      SET booking_request_id = ${legacyBookingId}
      WHERE id = ${legacyOfferIds[0]}
    `;
    await sql`
      UPDATE public.offer_requests
      SET booking_request_id = ${detachmentBookingId}
      WHERE id = ${legacyOfferIds[1]}
    `;

    const scopeHash = "a".repeat(64);
    const payloadHash = "b".repeat(64);
    const requestId = randomUUID();
    const [keyedBooking] = await sql<{ id: number }[]>`
      INSERT INTO public.booking_requests (
        creation_scope_hash, creation_request_id, creation_payload_hash,
        client_name, client_phone, event_date, status, source
      ) VALUES (
        ${scopeHash}, ${requestId}, ${payloadHash},
        ${`${mark} keyed`}, '+37369000002', '2033-01-02', 'pending', 'client'
      ) RETURNING id
    `;
    keyedBookingId = keyedBooking.id;

    await expectPgCode(
      () => sql`
        INSERT INTO public.booking_requests (
          creation_scope_hash, client_name, client_phone, event_date
        ) VALUES (${scopeHash}, ${`${mark} partial`}, '+37369000003', '2033-01-03')
      `,
      "23514",
      "partial creation identity",
    );
    await expectPgCode(
      () => sql`
        INSERT INTO public.booking_requests (
          creation_scope_hash, creation_request_id, creation_payload_hash,
          client_name, client_phone, event_date
        ) VALUES (
          ${scopeHash}, ${requestId}, ${"c".repeat(64)},
          ${`${mark} duplicate`}, '+37369000004', '2033-01-04'
        )
      `,
      "23505",
      "duplicate scope/request identity",
    );

    await sql`
      INSERT INTO public.offer_requests (
        booking_request_id, client_name, client_phone, event_date, status
      ) VALUES (${keyedBookingId}, ${`${mark} projection`}, '+37369000002', '2033-01-02', 'new')
    `;
    await expectPgCode(
      () => sql`
        INSERT INTO public.offer_requests (
          booking_request_id, client_name, client_phone, event_date, status
        ) VALUES (${keyedBookingId}, ${`${mark} duplicate projection`}, '+37369000002', '2033-01-02', 'new')
      `,
      "23505",
      "duplicate offer projection",
    );
    await expectPgCode(
      () => sql`
        INSERT INTO public.offer_requests (
          booking_request_id, client_name, client_phone, event_date, status
        ) VALUES (2147483647, ${`${mark} orphan projection`}, '+37369000002', '2033-01-02', 'new')
      `,
      "23503",
      "orphan offer projection",
    );

    await sql`DELETE FROM public.booking_requests WHERE id = ${keyedBookingId}`;
    const [cascade] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM public.offer_requests
      WHERE booking_request_id = ${keyedBookingId}
    `;
    if (cascade.count !== 0) {
      throw new Error("0033 booking delete did not cascade its CRM projection");
    }
    keyedBookingId = null;

    await sql`DELETE FROM public.artists WHERE id = ${fixtureArtistId}`;
    fixtureArtistId = null;
    await sql`DELETE FROM public.venues WHERE id = ${fixtureVenueId}`;
    fixtureVenueId = null;
    const detachedOffers = await sql<
      {
        id: number;
        bookingRequestId: number | null;
        artistId: number | null;
        venueId: number | null;
      }[]
    >`
      SELECT id, booking_request_id AS "bookingRequestId",
        artist_id AS "artistId", venue_id AS "venueId"
      FROM public.offer_requests
      WHERE id = ANY(${legacyOfferIds})
      ORDER BY id
    `;
    const expectedBookingIds = new Map([
      [legacyOfferIds[0], legacyBookingId],
      [legacyOfferIds[1], detachmentBookingId],
    ]);
    if (
      detachedOffers.length !== 2 ||
      detachedOffers.some(
        (offer) =>
          offer.artistId !== null ||
          offer.venueId !== null ||
          offer.bookingRequestId !== expectedBookingIds.get(offer.id),
      )
    ) {
      throw new Error(
        `0033 target deletes did not preserve/detach offers: ${JSON.stringify(detachedOffers)}`,
      );
    }

    console.log("0033 booking-create idempotency migration verification: OK");
  } finally {
    try {
      await sql`
        ALTER TABLE public.offer_requests
        DROP CONSTRAINT IF EXISTS m33_verify_composite_booking_fk
      `;
      await sql`
        ALTER TABLE public.offer_requests
        DROP CONSTRAINT IF EXISTS m33_verify_extra_artist_fk
      `;
      await sql`DROP INDEX IF EXISTS public.m33_verify_booking_artist_uidx`;
      if (keyedBookingId != null) {
        await sql`DELETE FROM public.booking_requests WHERE id = ${keyedBookingId}`;
      }
      if (legacyOfferIds.length > 0) {
        await sql`DELETE FROM public.offer_requests WHERE id = ANY(${legacyOfferIds})`;
      }
      if (legacyBookingId != null) {
        await sql`DELETE FROM public.booking_requests WHERE id = ${legacyBookingId}`;
      }
      if (detachmentBookingId != null) {
        await sql`DELETE FROM public.booking_requests WHERE id = ${detachmentBookingId}`;
      }
      if (fixtureArtistId != null) {
        await sql`DELETE FROM public.artists WHERE id = ${fixtureArtistId}`;
      }
      if (fixtureVenueId != null) {
        await sql`DELETE FROM public.venues WHERE id = ${fixtureVenueId}`;
      }
      if (privilegeFixtureStarted) {
        await sql`REVOKE INSERT ON TABLE public.offer_requests FROM anon`;
        await sql`REVOKE UPDATE (client_name) ON TABLE public.booking_requests FROM authenticated`;
        await sql`REVOKE SELECT (id) ON TABLE public.offer_requests FROM PUBLIC`;
        await sql`REVOKE SELECT ON SEQUENCE public.booking_requests_id_seq FROM authenticated`;
        await sql`REVOKE USAGE ON SEQUENCE public.offer_requests_id_seq FROM PUBLIC`;
      }
    } finally {
      try {
        await dropInheritedTestRole();
      } finally {
        await sql.end();
      }
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
