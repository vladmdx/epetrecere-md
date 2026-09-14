/**
 * Verify manual migration 0034 on a guarded disposable loopback database.
 *
 * The guarded runner must validate the E2E marker before importing this file.
 * This verifier requires a genuine post-0033/pre-0034 baseline, injects direct
 * and transitive parent-role grants, applies 0034, introduces ACL/RLS drift,
 * and proves a second application heals it without changing role membership.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "0034 migration verification must run through scripts/run-guarded-db-test.ts",
  );
}

const migration =
  "src/lib/db/migrations/manual/0034_notifications_calendar_security.sql";
const parentRole = "epetrecere_0034_browser_parent";
const grandparentRole = "epetrecere_0034_browser_grandparent";
const targetTables = ["calendar_events", "notifications"] as const;
const targetSequences = [
  "calendar_events_id_seq",
  "notifications_id_seq",
] as const;
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

async function main(): Promise<void> {
  const config = e2eDatabaseConfig();
  await verifyE2EDatabase(config);

  const source = readFileSync(migration, "utf8");
  for (const guarantee of [
    "Do not apply to Preview/Production without an explicit rollout",
    "SET LOCAL lock_timeout = '5s'",
    "0034 requires the canonical post-0033 database baseline",
    "WITH RECURSIVE browser_role_tree",
    "REVOKE ALL PRIVILEGES ON TABLE",
    "REVOKE ALL PRIVILEGES ON SEQUENCE",
    "public.calendar_events NO FORCE ROW LEVEL SECURITY",
    "public.notifications NO FORCE ROW LEVEL SECURITY",
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
  ]) {
    if (!source.includes(guarantee)) {
      throw new Error(`0034 source guarantee missing: ${guarantee}`);
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
          await sql.unsafe(
            `REVOKE "${parentRole}" FROM "${member}"`,
          );
        }
      }
    }
    if (parentExists && grandparentExists) {
      await sql.unsafe(
        `REVOKE "${grandparentRole}" FROM "${parentRole}"`,
      );
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

  async function privilegeViolations(): Promise<PrivilegeViolation[]> {
    return sql<PrivilegeViolation[]>`
      WITH target_roles(role_name) AS (
        SELECT unnest(${[...auditedRoles]}::text[])
      ), target_tables(table_name) AS (
        SELECT unnest(${[...targetTables]}::text[])
      ), table_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]::text[])
      ), column_privileges(privilege) AS (
        SELECT unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ]::text[])
      ), target_sequences(sequence_name) AS (
        SELECT relation.relname
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'S'
          AND relation.relname = ANY(${[...targetSequences]}::text[])
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
        format(
          'public.%I.%I',
          column_info.table_name,
          column_info.column_name
        ),
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
    const rls = await sql<
      { tableName: string; enabled: boolean; forced: boolean }[]
    >`
      SELECT relation.relname AS "tableName",
        relation.relrowsecurity AS enabled,
        relation.relforcerowsecurity AS forced
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${[...targetTables]}::text[])
      ORDER BY relation.relname
    `;
    const sequences = await sql<{ sequenceName: string }[]>`
      SELECT relation.relname AS "sequenceName"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'S'
        AND relation.relname = ANY(${[...targetSequences]}::text[])
      ORDER BY relation.relname
    `;
    const privileges = await privilegeViolations();
    return { rls, sequences, privileges };
  }

  function assertHardened(
    shape: Awaited<ReturnType<typeof currentShape>>,
    label: string,
  ): void {
    if (
      shape.rls.length !== targetTables.length
      || shape.rls.some((row) => !row.enabled || row.forced)
    ) {
      throw new Error(`${label}: RLS owner-bypass shape is non-canonical ${JSON.stringify(shape.rls)}`);
    }
    if (
      JSON.stringify(shape.sequences.map((row) => row.sequenceName))
      !== JSON.stringify([...targetSequences].sort())
    ) {
      throw new Error(
        `${label}: target sequence shape changed ${JSON.stringify(shape.sequences)}`,
      );
    }
    if (shape.privileges.length !== 0) {
      throw new Error(
        `${label}: effective target privileges remain ${JSON.stringify(shape.privileges)}`,
      );
    }
  }

  async function assertBrowserRolesCannotRead(label: string): Promise<void> {
    for (const role of ["anon", "authenticated"]) {
      for (const table of targetTables) {
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

  try {
    const [baseline] = await sql<
      {
        tables: number;
        sequences: number;
        browserRoles: number;
        post0033Columns: number;
        post0033Indexes: number;
        alreadyHardened: number;
      }[]
    >`
      SELECT
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind = 'r'
            AND relation.relname = ANY(${[...targetTables]}::text[])
        ) AS tables,
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind = 'S'
            AND relation.relname = ANY(${[...targetSequences]}::text[])
        ) AS sequences,
        (
          SELECT count(*)::int FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        ) AS "browserRoles",
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'booking_requests' AND column_name IN (
                'creation_scope_hash', 'creation_request_id',
                'creation_payload_hash'
              ))
              OR (
                table_name = 'offer_requests'
                AND column_name = 'booking_request_id'
              )
            )
        ) AS "post0033Columns",
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname IN (
              'booking_requests_creation_scope_request_uidx',
              'offer_requests_booking_request_uidx'
            )
        ) AS "post0033Indexes",
        (
          SELECT count(*)::int
          FROM pg_class AS relation
          JOIN pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = ANY(${[...targetTables]}::text[])
            AND (relation.relrowsecurity OR relation.relforcerowsecurity)
        ) AS "alreadyHardened"
    `;
    if (
      baseline?.tables !== targetTables.length
      || baseline.sequences !== targetSequences.length
      || baseline.browserRoles !== 2
      || baseline.post0033Columns !== 4
      || baseline.post0033Indexes !== 2
      || baseline.alreadyHardened !== 0
    ) {
      throw new Error(
        `0034 verification requires a genuine post-0033/pre-0034 Supabase baseline: ${JSON.stringify(baseline)}`,
      );
    }

    const serials = await sql<{ tableName: string; sequenceName: string | null }[]>`
      SELECT target.table_name AS "tableName",
        pg_get_serial_sequence(
          format('public.%I', target.table_name),
          'id'
        ) AS "sequenceName"
      FROM unnest(${[...targetTables]}::text[]) AS target(table_name)
      ORDER BY target.table_name
    `;
    const expectedSerials = new Map([
      ["calendar_events", "public.calendar_events_id_seq"],
      ["notifications", "public.notifications_id_seq"],
    ]);
    if (
      serials.some(
        (row) => row.sequenceName !== expectedSerials.get(row.tableName),
      )
    ) {
      throw new Error(`0034 baseline serial ownership is non-canonical: ${JSON.stringify(serials)}`);
    }

    await dropFixtureRoles();
    await sql.unsafe(`CREATE ROLE "${grandparentRole}" NOLOGIN INHERIT`);
    await sql.unsafe(`CREATE ROLE "${parentRole}" NOLOGIN INHERIT`);
    await sql.unsafe(
      `GRANT "${grandparentRole}" TO "${parentRole}"`,
    );
    await sql.unsafe(
      `GRANT "${parentRole}" TO "anon", "authenticated"`,
    );

    await sql.unsafe(
      `GRANT SELECT ON TABLE public.notifications TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE (note) ON TABLE public.calendar_events TO "${parentRole}"`,
    );
    await sql.unsafe(
      `GRANT UPDATE ON SEQUENCE public.notifications_id_seq TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT USAGE ON SEQUENCE public.calendar_events_id_seq TO "${parentRole}"`,
    );
    await sql`GRANT INSERT ON TABLE public.notifications TO anon`;
    await sql`GRANT SELECT (message) ON TABLE public.notifications TO authenticated`;
    await sql`GRANT SELECT ON TABLE public.calendar_events TO PUBLIC`;
    await sql`GRANT UPDATE (note) ON TABLE public.calendar_events TO PUBLIC`;
    await sql`GRANT SELECT ON SEQUENCE public.notifications_id_seq TO authenticated`;
    await sql`GRANT USAGE ON SEQUENCE public.calendar_events_id_seq TO PUBLIC`;

    const expectedMemberships = [
      `${grandparentRole}->${parentRole}`,
      `${parentRole}->anon`,
      `${parentRole}->authenticated`,
    ].sort();
    if (
      JSON.stringify(await membershipShape())
      !== JSON.stringify(expectedMemberships)
    ) {
      throw new Error("0034 transitive parent-role fixture is incomplete");
    }
    const seededViolations = await privilegeViolations();
    for (const role of auditedRoles) {
      if (!seededViolations.some((row) => row.roleName === role)) {
        throw new Error(`0034 privilege fixture did not expose ${role}`);
      }
    }

    applyMigration(config.url, "0034 first apply");
    const firstShape = await currentShape();
    assertHardened(firstShape, "0034 first apply");
    await assertBrowserRolesCannotRead("0034 first apply");
    if (
      JSON.stringify(await membershipShape())
      !== JSON.stringify(expectedMemberships)
    ) {
      throw new Error("0034 changed browser parent-role membership");
    }

    // Drift is introduced outside the migration transaction. The second run
    // must converge both tables back to the same hardened shape.
    await sql`ALTER TABLE public.calendar_events DISABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY`;
    await sql.unsafe(
      `GRANT UPDATE ON TABLE public.calendar_events TO "${grandparentRole}"`,
    );
    await sql.unsafe(
      `GRANT SELECT (title) ON TABLE public.notifications TO "${parentRole}"`,
    );
    await sql`GRANT USAGE ON SEQUENCE public.notifications_id_seq TO PUBLIC`;

    applyMigration(config.url, "0034 second apply after ACL/RLS drift");
    const secondShape = await currentShape();
    assertHardened(secondShape, "0034 second apply");
    await assertBrowserRolesCannotRead("0034 second apply");
    if (JSON.stringify(secondShape) !== JSON.stringify(firstShape)) {
      throw new Error(
        `0034 reapply changed catalog shape:\nfirst=${JSON.stringify(firstShape)}\nsecond=${JSON.stringify(secondShape)}`,
      );
    }

    console.log("0034 notifications/calendar security verification passed.");
  } finally {
    await dropFixtureRoles();
    await sql.end({ timeout: 1 });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
