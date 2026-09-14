/**
 * Verify 0039 only on a guarded disposable loopback database.
 *
 * The verifier requires the exact canonical pre-0039 delivery queue, applies
 * the migration twice around safe constraint/index/RLS/policy/ACL drift, and
 * proves incompatible catalog lookalikes fail closed transactionally.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0039 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0039_legal_contract_delivery_privacy.sql";
const targetTable = "legal_contract_delivery_outbox";
const targetSequence = "legal_contract_delivery_outbox_id_seq";
const parentRole = "epetrecere_0039_browser_parent";
const grandparentRole = "epetrecere_0039_browser_grandparent";
const driftPolicy = "epetrecere_0039_drift_policy";
const lookalikeTable = "epetrecere_0039_index_lookalike";
const deadLetterFixtureUserId = "39000000-0000-4000-8000-000000000039";
const deadLetterFixtureSessionId = "39000000-0000-4000-8000-000000003900";
const deadLetterFixtureEmail = "dead-letter-0039@example.invalid";
const auditedRoles = [
  "anon",
  "authenticated",
  parentRole,
  grandparentRole,
] as const;

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

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "Do not apply to Preview/Production without an explicit rollout",
    "0039 found a non-canonical legal delivery column shape",
    "0039 found unexpected legal delivery constraints",
    "0039 found unexpected legal delivery indexes",
    "0039 refuses same-name foreign index object",
    "0039 failed exact catalog verification for index",
    "legal_contract_delivery_recipient_state_chk",
    "non-live session signer",
    "WITH RECURSIVE browser_role_tree",
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0039 source guarantee missing: ${guarantee}`);
    }
  }

  const sql = postgres(config.url, { max: 1, prepare: false, ssl: false });
  const migrationBody = source
    .replace(/^BEGIN;\s*/i, "")
    .replace(/\s*COMMIT;\s*$/i, "");

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

  async function dropLookalike(): Promise<void> {
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
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]::text[])
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[])
      ), sequence_privileges(privilege) AS (
        SELECT unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']::text[])
      )
      SELECT target_role.role_name AS "roleName",
        'table'::text AS "objectKind",
        'public.legal_contract_delivery_outbox'::text AS "objectName",
        table_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN table_privileges AS table_privilege
      WHERE has_table_privilege(
        role.rolname, 'public.legal_contract_delivery_outbox',
        table_privilege.privilege
      )
      UNION ALL
      SELECT target_role.role_name, 'column',
        format('public.legal_contract_delivery_outbox.%I', column_info.column_name),
        column_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN information_schema.columns AS column_info
      CROSS JOIN column_privileges AS column_privilege
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = 'legal_contract_delivery_outbox'
        AND has_column_privilege(
          role.rolname, 'public.legal_contract_delivery_outbox',
          column_info.column_name, column_privilege.privilege
        )
      UNION ALL
      SELECT target_role.role_name, 'sequence',
        'public.legal_contract_delivery_outbox_id_seq',
        sequence_privilege.privilege
      FROM target_roles AS target_role
      JOIN pg_roles AS role ON role.rolname = target_role.role_name
      CROSS JOIN sequence_privileges AS sequence_privilege
      WHERE has_sequence_privilege(
        role.rolname, 'public.legal_contract_delivery_outbox_id_seq',
        sequence_privilege.privilege
      )
      ORDER BY 1, 2, 3, 4
    `;
  }

  async function currentShape() {
    const columns = await sql<{
      name: string;
      dataType: string;
      nullable: string;
      defaultValue: string | null;
    }[]>`
      SELECT column_name AS name, data_type AS "dataType",
        is_nullable AS nullable, column_default AS "defaultValue"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'legal_contract_delivery_outbox'
      ORDER BY column_name
    `;
    const constraints = await sql<{
      name: string;
      type: string;
      definition: string;
      validated: boolean;
    }[]>`
      SELECT conname AS name, contype::text AS type,
        lower(pg_get_constraintdef(oid)) AS definition,
        convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      ORDER BY conname
    `;
    const indexes = await sql<{
      name: string;
      definition: string;
      valid: boolean;
      ready: boolean;
      live: boolean;
    }[]>`
      SELECT index_relation.relname AS name,
        lower(pg_get_indexdef(index_relation.oid)) AS definition,
        index_catalog.indisvalid AS valid,
        index_catalog.indisready AS ready,
        index_catalog.indislive AS live
      FROM pg_index AS index_catalog
      JOIN pg_class AS index_relation
        ON index_relation.oid = index_catalog.indexrelid
      WHERE index_catalog.indrelid =
        'public.legal_contract_delivery_outbox'::regclass
      ORDER BY index_relation.relname
    `;
    const [relation] = await sql<{
      kind: string;
      persistence: string;
      partition: boolean;
      rowSecurity: boolean;
      forceRowSecurity: boolean;
      policyCount: number;
      serialSequence: string | null;
    }[]>`
      SELECT relation.relkind::text AS kind,
        relation.relpersistence::text AS persistence,
        relation.relispartition AS partition,
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity",
        (SELECT count(*)::int FROM pg_policy
         WHERE polrelid = relation.oid) AS "policyCount",
        pg_get_serial_sequence(
          'public.legal_contract_delivery_outbox', 'id'
        ) AS "serialSequence"
      FROM pg_class AS relation
      WHERE relation.oid = 'public.legal_contract_delivery_outbox'::regclass
    `;
    const privileges = await privilegeViolations();
    return { columns, constraints, indexes, relation, privileges };
  }

  async function assertDeadLetterMinimized(id: number, label: string): Promise<void> {
    const [row] = await sql<{
      status: string;
      recipientUserId: string | null;
      recipientEmail: string | null;
      recipientKey: string;
      lockedAt: Date | null;
      leaseToken: string | null;
      deadLetteredAt: Date | null;
      lastError: string | null;
    }[]>`
      SELECT status,
        recipient_user_id AS "recipientUserId",
        recipient_email AS "recipientEmail",
        recipient_key AS "recipientKey",
        locked_at AS "lockedAt",
        lease_token AS "leaseToken",
        dead_lettered_at AS "deadLetteredAt",
        last_error AS "lastError"
      FROM public.legal_contract_delivery_outbox
      WHERE id = ${id}
    `;
    if (
      !row
      || row.status !== "dead_letter"
      || row.recipientUserId !== null
      || row.recipientEmail !== null
      || row.recipientKey !== `retired:${id}`
      || row.lockedAt !== null
      || row.leaseToken !== null
      || row.deadLetteredAt === null
      || row.lastError?.includes(deadLetterFixtureEmail)
    ) {
      throw new Error(`${label}: dead-letter PII was not minimized`);
    }

    let constraintRejected = false;
    try {
      await sql`
        UPDATE public.legal_contract_delivery_outbox
        SET recipient_email = ${deadLetterFixtureEmail}
        WHERE id = ${id}
      `;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "23514") throw error;
      constraintRejected = true;
    }
    if (!constraintRejected) {
      throw new Error(`${label}: state CHECK accepted dead-letter recipient PII`);
    }
  }

  function assertHardened(
    shape: Awaited<ReturnType<typeof currentShape>>,
    label: string,
  ): void {
    const expectedColumns = [
      "acceptance_session_id", "anchor_acceptance_id", "attempts",
      "cancelled_at", "channel", "created_at", "dead_lettered_at",
      "delivered_at", "id", "last_error", "lease_token", "locked_at",
      "next_attempt_at", "recipient_email", "recipient_key",
      "recipient_role_snapshot", "recipient_user_id", "status", "updated_at",
    ];
    const expectedConstraints = [
      "legal_contract_delivery_anchor_session_fk",
      "legal_contract_delivery_channel_chk",
      "legal_contract_delivery_outbox_pkey",
      "legal_contract_delivery_recipient_state_chk",
      "legal_contract_delivery_recipient_unique",
      "legal_contract_delivery_recipient_user_fk",
      "legal_contract_delivery_role_snapshot_chk",
      "legal_contract_delivery_status_chk",
    ];
    const expectedIndexes = [
      "legal_contract_delivery_outbox_pkey",
      "legal_contract_delivery_pending_idx",
      "legal_contract_delivery_recipient_unique",
      "legal_contract_delivery_recipient_user_idx",
      "legal_contract_delivery_session_idx",
    ];
    assertEqual(shape.columns.map((row) => row.name), expectedColumns, `${label} columns`);
    assertEqual(shape.constraints.map((row) => row.name), expectedConstraints, `${label} constraints`);
    assertEqual(shape.indexes.map((row) => row.name), expectedIndexes, `${label} indexes`);
    if (shape.constraints.some((row) => !row.validated)) {
      throw new Error(`${label}: an unvalidated constraint remains`);
    }
    if (shape.indexes.some((row) => !row.valid || !row.ready || !row.live)) {
      throw new Error(`${label}: an invalid/unready index remains`);
    }
    if (
      !shape.relation
      || shape.relation.kind !== "r"
      || shape.relation.persistence !== "p"
      || shape.relation.partition
      || !shape.relation.rowSecurity
      || shape.relation.forceRowSecurity
      || shape.relation.policyCount !== 0
      || !shape.relation.serialSequence?.endsWith(
        ".legal_contract_delivery_outbox_id_seq",
      )
    ) {
      throw new Error(`${label}: non-canonical relation security/serial shape`);
    }
    if (shape.privileges.length > 0) {
      throw new Error(
        `${label}: effective browser privileges remain ${JSON.stringify(shape.privileges)}`,
      );
    }
    const state = shape.constraints.find(
      (row) => row.name === "legal_contract_delivery_recipient_state_chk",
    )?.definition ?? "";
    for (const fragment of [
      "recipient_user_id is not null",
      "recipient_email is not null",
      "status = 'processing'::text",
      "status = 'dead_letter'::text",
      "recipient_user_id is null",
      "recipient_key = ('retired:'::text || (id)::text)",
      "status = 'cancelled'::text",
    ]) {
      if (!state.includes(fragment)) {
        throw new Error(`${label}: state constraint is missing ${fragment}`);
      }
    }
  }

  async function expectTransactionalDriftRejected(
    label: string,
    setup: string,
    expectedFailure: RegExp,
  ): Promise<void> {
    try {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(setup);
        await transaction.unsafe(migrationBody);
      });
    } catch (error) {
      const output = [
        (error as Error).message,
        (error as { detail?: string }).detail,
        (error as { hint?: string }).hint,
      ].filter(Boolean).join("\n");
      if (!expectedFailure.test(output)) {
        throw new Error(`${label}: rejected for an unexpected reason\n${output}`, {
          cause: error,
        });
      }
      console.log(`-- ${label}: rejected and rolled back as expected`);
      return;
    }
    throw new Error(`${label}: incompatible catalog drift was accepted`);
  }

  try {
    await dropFixtureRoles();
    await dropLookalike();

    const baselineColumns = await sql<{
      name: string;
      dataType: string;
      nullable: string;
      defaultValue: string | null;
    }[]>`
      SELECT column_name AS name, data_type AS "dataType",
        is_nullable AS nullable, column_default AS "defaultValue"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'legal_contract_delivery_outbox'
      ORDER BY column_name
    `;
    const expectedBaselineColumns = [
      ["acceptance_session_id", "uuid", "NO", null],
      ["anchor_acceptance_id", "integer", "NO", null],
      ["attempts", "integer", "NO", "0"],
      ["channel", "text", "NO", null],
      ["created_at", "timestamp with time zone", "NO", "now()"],
      ["dead_lettered_at", "timestamp with time zone", "YES", null],
      ["delivered_at", "timestamp with time zone", "YES", null],
      [
        "id",
        "integer",
        "NO",
        "nextval('legal_contract_delivery_outbox_id_seq'::regclass)",
      ],
      ["last_error", "text", "YES", null],
      ["lease_token", "uuid", "YES", null],
      ["locked_at", "timestamp with time zone", "YES", null],
      ["next_attempt_at", "timestamp with time zone", "NO", "now()"],
      ["recipient_email", "text", "NO", null],
      ["recipient_key", "text", "NO", null],
      ["status", "text", "NO", "'pending'::text"],
      ["updated_at", "timestamp with time zone", "NO", "now()"],
    ];
    const normalizedBaselineColumns = baselineColumns.map((column) => [
      column.name,
      column.dataType,
      column.nullable,
      column.defaultValue?.replace(/^nextval\('public\./, "nextval('") ?? null,
    ]);
    if (
      JSON.stringify(normalizedBaselineColumns)
        !== JSON.stringify(expectedBaselineColumns)
    ) {
      throw new Error("0039 verifier requires the exact pre-0039 baseline");
    }
    console.log("-- 0039 exact pre-migration baseline confirmed");

    await sql`
      INSERT INTO public.users (id, clerk_id, email, role)
      VALUES (
        ${deadLetterFixtureUserId}::uuid,
        'fixture_0039_dead_letter',
        ${deadLetterFixtureEmail},
        'user'
      )
      ON CONFLICT (id) DO NOTHING
    `;
    const insertedAcceptance = await sql<{ id: number }[]>`
      INSERT INTO public.legal_acceptances (
        user_id, subject_type, document_slug, document_version, pack_version,
        acceptance_session_id, locale, signature_name, accepted_at, email
      ) VALUES (
        ${deadLetterFixtureUserId}::uuid,
        'artist',
        'fixture-0039-dead-letter',
        '1.0',
        'fixture-0039',
        ${deadLetterFixtureSessionId}::uuid,
        'ro',
        'Fixture 0039',
        '2026-09-14T00:00:00Z'::timestamptz,
        ${deadLetterFixtureEmail}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    const [existingAcceptance] = insertedAcceptance.length > 0
      ? insertedAcceptance
      : await sql<{ id: number }[]>`
          SELECT id FROM public.legal_acceptances
          WHERE acceptance_session_id = ${deadLetterFixtureSessionId}::uuid
            AND document_slug = 'fixture-0039-dead-letter'
        `;
    if (!existingAcceptance) throw new Error("0039 dead-letter acceptance fixture failed");
    const insertedDelivery = await sql<{ id: number }[]>`
      INSERT INTO public.legal_contract_delivery_outbox (
        acceptance_session_id, anchor_acceptance_id, channel,
        recipient_key, recipient_email, status, attempts,
        dead_lettered_at, last_error
      ) VALUES (
        ${deadLetterFixtureSessionId}::uuid,
        ${existingAcceptance.id},
        'signer',
        ${deadLetterFixtureUserId},
        ${deadLetterFixtureEmail},
        'dead_letter',
        8,
        '2026-09-14T00:10:00Z'::timestamptz,
        ${`legacy provider response for ${deadLetterFixtureEmail}`}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    const [deadLetterFixture] = insertedDelivery.length > 0
      ? insertedDelivery
      : await sql<{ id: number }[]>`
          SELECT id FROM public.legal_contract_delivery_outbox
          WHERE acceptance_session_id = ${deadLetterFixtureSessionId}::uuid
            AND channel = 'signer'
            AND recipient_key = ${deadLetterFixtureUserId}
        `;
    if (!deadLetterFixture) throw new Error("0039 dead-letter delivery fixture failed");

    await sql.unsafe(`CREATE ROLE "${grandparentRole}" NOLOGIN`);
    await sql.unsafe(`CREATE ROLE "${parentRole}" NOLOGIN`);
    await sql.unsafe(`GRANT "${grandparentRole}" TO "${parentRole}"`);
    await sql.unsafe(`GRANT "${parentRole}" TO anon, authenticated`);
    await sql.unsafe(
      `GRANT SELECT, UPDATE ON public.${targetTable} TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT SELECT (recipient_email) ON public.${targetTable} TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT USAGE, SELECT ON SEQUENCE public.${targetSequence} TO "${grandparentRole}"`,
    );
    const memberships = await membershipShape();

    applyMigration(config.url, "0039 first apply");
    const first = await currentShape();
    assertHardened(first, "0039 first apply");
    await assertDeadLetterMinimized(deadLetterFixture.id, "0039 first apply");

    // Only migration-owned objects and security state are drifted. Reapply
    // must heal them without changing role topology or unrelated evidence.
    await sql.unsafe(`
      ALTER TABLE public.${targetTable}
        DROP CONSTRAINT legal_contract_delivery_recipient_state_chk,
        DROP CONSTRAINT legal_contract_delivery_role_snapshot_chk,
        DROP CONSTRAINT legal_contract_delivery_recipient_user_fk,
        DROP CONSTRAINT legal_contract_delivery_status_chk;
      ALTER TABLE public.${targetTable}
        ADD CONSTRAINT legal_contract_delivery_recipient_state_chk CHECK (true),
        ADD CONSTRAINT legal_contract_delivery_role_snapshot_chk CHECK (true),
        ADD CONSTRAINT legal_contract_delivery_recipient_user_fk
          FOREIGN KEY (recipient_user_id) REFERENCES public.users(id)
          ON DELETE CASCADE,
        ADD CONSTRAINT legal_contract_delivery_status_chk CHECK (true);
      DROP INDEX public.legal_contract_delivery_pending_idx;
      CREATE INDEX legal_contract_delivery_pending_idx
        ON public.${targetTable} (created_at);
      DROP INDEX public.legal_contract_delivery_recipient_user_idx;
      CREATE INDEX legal_contract_delivery_recipient_user_idx
        ON public.${targetTable} (created_at);
      ALTER TABLE public.${targetTable} FORCE ROW LEVEL SECURITY;
      CREATE POLICY ${driftPolicy} ON public.${targetTable}
        FOR SELECT TO PUBLIC USING (true);
      GRANT SELECT, UPDATE ON public.${targetTable} TO "${grandparentRole}";
      GRANT SELECT (recipient_email) ON public.${targetTable}
        TO "${grandparentRole}";
      GRANT USAGE, SELECT ON SEQUENCE public.${targetSequence}
        TO "${grandparentRole}";
    `);

    applyMigration(
      config.url,
      "0039 second apply after constraint/index/RLS/policy/ACL drift",
    );
    const second = await currentShape();
    assertHardened(second, "0039 second apply");
    await assertDeadLetterMinimized(deadLetterFixture.id, "0039 second apply");
    assertEqual(second, first, "0039 complete catalog convergence");
    assertEqual(await membershipShape(), memberships, "0039 memberships after reapply");

    await expectTransactionalDriftRejected(
      "0039 incompatible-column lookalike",
      `ALTER TABLE public.${targetTable} ADD COLUMN epetrecere_0039_extra text`,
      /non-canonical legal delivery column shape/i,
    );
    await expectTransactionalDriftRejected(
      "0039 extra-constraint lookalike",
      `ALTER TABLE public.${targetTable}
       ADD CONSTRAINT epetrecere_0039_extra_chk CHECK (true)`,
      /unexpected legal delivery constraints/i,
    );
    await expectTransactionalDriftRejected(
      "0039 extra-index lookalike",
      `CREATE INDEX epetrecere_0039_extra_idx
       ON public.${targetTable} (created_at)`,
      /unexpected legal delivery indexes/i,
    );
    await expectTransactionalDriftRejected(
      "0039 foreign same-name index lookalike",
      `DROP INDEX public.legal_contract_delivery_recipient_user_idx;
       CREATE TABLE public.${lookalikeTable} (recipient_user_id uuid);
       CREATE INDEX legal_contract_delivery_recipient_user_idx
         ON public.${lookalikeTable} (recipient_user_id)`,
      /same-name foreign index object/i,
    );

    console.log("0039 legal delivery migration verification passed");
  } finally {
    await dropLookalike().catch(() => undefined);
    await dropFixtureRoles().catch(() => undefined);
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
