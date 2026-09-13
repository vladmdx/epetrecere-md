/**
 * Verifies current 0031 on a disposable local database.
 *
 * The script deliberately downgrades the already-applied 0031 shape, keeps
 * delivery rows in several statuses, introduces constraint/index/privilege
 * drift, then proves the current migration heals it without losing history.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";
const client = postgres(config.url, { max: 1, prepare: false, ssl: false });
const migration = "src/lib/db/migrations/manual/0031_booking_confirmation_outbox.sql";
const inheritedRole = "epetrecere_outbox_e2e_inherited";

type ColumnShape = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

type ConstraintShape = {
  table_name: string;
  conname: string;
  definition: string;
};

function apply(label: string) {
  console.log(`-- ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: config.url },
    stdio: "pipe",
  });
}

async function dropInheritedTestRole() {
  const [role] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = ${inheritedRole}
    ) AS exists
  `;
  if (!role?.exists) return;

  const [anon] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'anon'
    ) AS exists
  `;
  if (anon?.exists) {
    await client.unsafe(`REVOKE ${inheritedRole} FROM anon`);
  }
  await client.unsafe(`DROP OWNED BY ${inheritedRole}`);
  await client.unsafe(`DROP ROLE ${inheritedRole}`);
}

async function shape() {
  const columns = await client<ColumnShape[]>`
    SELECT table_name, column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'booking_requests',
        'booking_effect_outbox',
        'booking_effect_deliveries'
      )
    ORDER BY table_name, ordinal_position
  `;
  const constraints = await client<ConstraintShape[]>`
    SELECT c.conrelid::regclass::text AS table_name,
      c.conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid IN (
      'public.booking_requests'::regclass,
      'public.booking_effect_outbox'::regclass,
      'public.booking_effect_deliveries'::regclass
    )
      AND (
        c.conname LIKE 'booking_effect_%'
        OR c.conname = 'booking_requests_artist_fk'
        OR c.conname = 'booking_requests_artist_id_artists_id_fk'
        OR c.conname LIKE 'old_0031_%'
      )
    ORDER BY table_name, c.conname
  `;
  const indexes = await client<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'booking_effect_outbox_due_idx',
        'booking_effect_outbox_expired_lease_idx',
        'booking_effect_deliveries_due_idx',
        'booking_effect_deliveries_expired_lease_idx'
      )
    ORDER BY indexname
  `;
  return { columns, constraints, indexes };
}

function requireColumn(
  columns: ColumnShape[],
  table: string,
  name: string,
  nullable?: "YES" | "NO",
  defaultPattern?: RegExp,
) {
  const row = columns.find(
    (column) => column.table_name === table && column.column_name === name,
  );
  if (
    !row
    || (nullable && row.is_nullable !== nullable)
    || (defaultPattern && !defaultPattern.test(row.column_default ?? ""))
  ) {
    throw new Error(
      `column ${table}.${name} missing/wrong: ${JSON.stringify(row)}`,
    );
  }
}

function requireConstraint(
  constraints: ConstraintShape[],
  name: string,
  definition?: RegExp,
) {
  const row = constraints.find((constraint) => constraint.conname === name);
  if (!row || (definition && !definition.test(row.definition))) {
    throw new Error(`constraint ${name} missing/wrong: ${JSON.stringify(row)}`);
  }
}

function requireIndex(
  indexes: Awaited<ReturnType<typeof shape>>["indexes"],
  name: string,
  definition: RegExp,
) {
  const row = indexes.find((index) => index.indexname === name);
  if (!row || !definition.test(row.indexdef)) {
    throw new Error(`index ${name} missing/wrong: ${JSON.stringify(row)}`);
  }
}

async function assertEffectivePrivilegesRevoked() {
  const roles = await client<{ rolname: string }[]>`
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    ORDER BY rolname
  `;
  if (roles.length !== 2) {
    throw new Error("Disposable Supabase DB must contain anon and authenticated roles.");
  }

  for (const { rolname } of roles) {
    const [tablePrivileges] = await client<{ allowed: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ]) AS privilege(name)
        CROSS JOIN unnest(ARRAY[
          'public.booking_effect_outbox',
          'public.booking_effect_deliveries'
        ]) AS relation(name)
        WHERE has_table_privilege(${rolname}, relation.name, privilege.name)
      ) AS allowed
    `;
    const [columnPrivileges] = await client<{ allowed: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns AS column_info
        CROSS JOIN unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ]) AS privilege(name)
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name IN (
            'booking_effect_outbox',
            'booking_effect_deliveries'
          )
          AND has_column_privilege(
            ${rolname},
            format('%I.%I', column_info.table_schema, column_info.table_name),
            column_info.column_name,
            privilege.name
          )
      ) AS allowed
    `;
    const [sequencePrivileges] = await client<{ allowed: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS privilege(name)
        CROSS JOIN unnest(ARRAY[
          'public.booking_effect_outbox_id_seq',
          'public.booking_effect_deliveries_id_seq'
        ]) AS sequence_name(name)
        WHERE has_sequence_privilege(
          ${rolname},
          sequence_name.name,
          privilege.name
        )
      ) AS allowed
    `;
    if (
      tablePrivileges?.allowed
      || columnPrivileges?.allowed
      || sequencePrivileges?.allowed
    ) {
      throw new Error(
        `${rolname} retains effective outbox privileges: ${JSON.stringify({
          tablePrivileges,
          columnPrivileges,
          sequencePrivileges,
        })}`,
      );
    }

    let setRoleBlocked = false;
    await client`BEGIN`;
    try {
      await client.unsafe(`SET LOCAL ROLE "${rolname}"`);
      await client`SELECT id FROM public.booking_effect_outbox LIMIT 0`;
    } catch (error) {
      setRoleBlocked = (error as { code?: string }).code === "42501";
    } finally {
      await client`ROLLBACK`;
    }
    if (!setRoleBlocked) {
      throw new Error(`SET ROLE ${rolname} could still read the internal outbox.`);
    }
  }
}

async function assertCurrentShape(current: Awaited<ReturnType<typeof shape>>) {
  requireColumn(current.columns, "booking_requests", "artist_id", "YES");
  requireColumn(current.columns, "booking_requests", "artist_name_snapshot", "YES");

  for (const name of [
    "status",
    "attempts",
    "next_attempt_at",
    "referral_status",
    "referral_attempts",
    "referral_next_attempt_at",
    "materialization_status",
    "materialization_attempts",
    "materialization_next_attempt_at",
    "updated_at",
  ]) {
    requireColumn(
      current.columns,
      "booking_effect_outbox",
      name,
      "NO",
    );
  }
  for (const name of [
    "referral_status",
    "materialization_status",
  ]) {
    requireColumn(
      current.columns,
      "booking_effect_outbox",
      name,
      "NO",
      /'pending'::text/,
    );
  }
  for (const name of ["referral_attempts", "materialization_attempts", "attempts"]) {
    requireColumn(
      current.columns,
      "booking_effect_outbox",
      name,
      "NO",
      /0/,
    );
  }
  for (const name of [
    "alerted_at",
    "resolved_at",
    "resolution_note",
  ]) {
    requireColumn(current.columns, "booking_effect_outbox", name, "YES");
  }

  for (const name of [
    "effect_id",
    "recipient_user_id",
    "channel",
    "dedupe_key",
    "payload",
    "status",
    "attempts",
    "next_attempt_at",
    "created_at",
    "updated_at",
  ]) {
    requireColumn(
      current.columns,
      "booking_effect_deliveries",
      name,
      "NO",
    );
  }
  for (const name of ["dispatch_started_at", "cancel_requested_at"]) {
    requireColumn(current.columns, "booking_effect_deliveries", name, "YES");
  }

  requireConstraint(
    current.constraints,
    "booking_requests_artist_fk",
    /FOREIGN KEY \(artist_id\).*ON DELETE SET NULL/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_booking_key_unique",
    /UNIQUE \(booking_id, effect_key\)/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_booking_fk",
    /FOREIGN KEY \(booking_id\).*ON DELETE RESTRICT/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_status_chk",
    /dead_letter/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_attempts_chk",
    /attempts >= 0/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_step_status_chk",
    /referral_status.*materialization_status/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_outbox_step_attempts_chk",
    /referral_attempts.*materialization_attempts/,
  );
  requireConstraint(current.constraints, "booking_effect_outbox_state_chk");
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_effect_fk",
    /FOREIGN KEY \(effect_id\).*ON DELETE RESTRICT/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_effect_recipient_channel_unique",
    /UNIQUE \(effect_id, recipient_user_id, channel\)/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_dedupe_unique",
    /UNIQUE \(dedupe_key\)/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_channel_chk",
    /in_app.*push.*whatsapp.*email/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_status_chk",
    /processing.*dispatching.*dead_letter/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_attempts_chk",
    /attempts >= 0/,
  );
  requireConstraint(
    current.constraints,
    "booking_effect_deliveries_state_chk",
    /dispatching.*dispatch_started_at/,
  );
  if (current.constraints.some((constraint) => constraint.conname.startsWith("old_0031_"))) {
    throw new Error("0031 left drifted constraints in place.");
  }

  if (current.indexes.length !== 4) {
    throw new Error(`outbox indexes missing: ${JSON.stringify(current.indexes)}`);
  }
  requireIndex(
    current.indexes,
    "booking_effect_outbox_due_idx",
    /\(effect_key, status, next_attempt_at, id\).*WHERE.*pending.*failed/,
  );
  requireIndex(
    current.indexes,
    "booking_effect_outbox_expired_lease_idx",
    /\(effect_key, lease_until, id\).*WHERE.*processing/,
  );
  requireIndex(
    current.indexes,
    "booking_effect_deliveries_due_idx",
    /\(status, next_attempt_at, id\).*WHERE.*pending.*failed/,
  );
  requireIndex(
    current.indexes,
    "booking_effect_deliveries_expired_lease_idx",
    /\(lease_until, id\).*WHERE.*processing.*dispatching/,
  );

  const [rls] = await client<{
    parent_rls: boolean;
    child_rls: boolean;
  }[]>`
    SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.booking_effect_outbox'::regclass) AS parent_rls,
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.booking_effect_deliveries'::regclass) AS child_rls
  `;
  if (!rls?.parent_rls || !rls.child_rls) {
    throw new Error(`outbox RLS disabled: ${JSON.stringify(rls)}`);
  }
}

async function main() {
  await verifyE2EDatabase(config);
  const [baseline] = await client<{
    outbox: boolean;
    status_column: boolean;
    artist_id_not_null: boolean;
  }[]>`
    SELECT
      to_regclass('public.booking_effect_outbox') IS NOT NULL AS outbox,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'booking_effect_outbox'
          AND column_name = 'status'
      ) AS status_column,
      COALESCE((
        SELECT is_nullable = 'NO'
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'booking_requests'
          AND column_name = 'artist_id'
      ), false) AS artist_id_not_null
  `;
  if (!baseline?.outbox) throw new Error("Migration 0030 must be applied first.");
  if (!baseline.status_column && !baseline.artist_id_not_null) {
    throw new Error(
      "0030-only baseline must preserve the historical NOT NULL artist_id so 0031 proves the nullable transition.",
    );
  }

  const marker = `outbox-migration-${Date.now()}`;
  let bookingId: number | null = null;
  let artistId: number | null = null;
  let effectId: number | null = null;

  try {
    const [artist] = await client<{ id: number }[]>`
      INSERT INTO artists (name_ro, slug)
      VALUES ('Artist istoric 0031', ${`${marker}-artist`})
      RETURNING id
    `;
    artistId = artist.id;

    const [booking] = await client<{ id: number }[]>`
      INSERT INTO booking_requests (
        artist_id,
        client_name,
        client_phone,
        event_date,
        status
      )
      VALUES (
        ${artist.id},
        ${marker},
        '+37360000000',
        '2028-11-01',
        'confirmed_by_client'
      )
      RETURNING id
    `;
    bookingId = booking.id;

    const [effect] = await client<{ id: number }[]>`
      INSERT INTO booking_effect_outbox (booking_id, effect_key)
      VALUES (${booking.id}, 'confirm_notify')
      RETURNING id
    `;
    effectId = effect.id;

    if (!baseline.status_column) {
      apply("0031 bootstrap from 0030");
      const [backfilled] = await client<{
        status: string;
        attempts: number;
        referral_status: string;
        materialization_status: string;
      }[]>`
        SELECT status, attempts, referral_status, materialization_status
        FROM booking_effect_outbox
        WHERE id = ${effect.id}
      `;
      if (
        backfilled?.status !== "pending"
        || backfilled.attempts !== 0
        || backfilled.referral_status !== "pending"
        || backfilled.materialization_status !== "pending"
      ) {
        throw new Error(`0030 row was not safely re-queued: ${JSON.stringify(backfilled)}`);
      }
    } else {
      apply("0031 normalize current disposable schema");
    }

    await client`
      UPDATE booking_effect_outbox
      SET status = 'failed',
          attempts = 7,
          next_attempt_at = '2028-11-02T10:00:00Z',
          last_error = 'legacy coordinator retry',
          lease_token = NULL,
          lease_until = NULL,
          delivered_at = NULL
      WHERE id = ${effect.id}
    `;

    const recipientA = "10000000-0000-4000-8000-000000000031";
    const recipientB = "20000000-0000-4000-8000-000000000031";
    const recipientC = "30000000-0000-4000-8000-000000000031";
    await client`
      INSERT INTO booking_effect_deliveries (
        effect_id,
        recipient_user_id,
        channel,
        dedupe_key,
        payload,
        status,
        attempts,
        next_attempt_at,
        last_error,
        delivered_at
      ) VALUES
        (
          ${effect.id}, ${recipientA}, 'email', ${`${marker}:email`},
          ${client.json({ userId: recipientA, type: "booking", title: "pending" })},
          'pending', 0, '2028-11-02T11:00:00Z', NULL, NULL
        ),
        (
          ${effect.id}, ${recipientB}, 'push', ${`${marker}:push`},
          ${client.json({ userId: recipientB, type: "booking", title: "failed" })},
          'failed', 3, '2028-11-02T12:00:00Z', 'provider unavailable', NULL
        ),
        (
          ${effect.id}, ${recipientC}, 'in_app', ${`${marker}:in-app`},
          ${client.json({ userId: recipientC, type: "booking", title: "delivered" })},
          'delivered', 1, '2028-11-02T13:00:00Z', NULL, '2028-11-02T09:00:00Z'
        )
    `;

    const legacyRows = await client<{
      recipient_user_id: string;
      channel: string;
      dedupe_key: string;
      payload: unknown;
      status: string;
      attempts: number;
      next_attempt_at: Date;
      last_error: string | null;
      delivered_at: Date | null;
    }[]>`
      SELECT recipient_user_id, channel, dedupe_key, payload, status, attempts,
        next_attempt_at, last_error, delivered_at
      FROM booking_effect_deliveries
      WHERE effect_id = ${effect.id}
      ORDER BY recipient_user_id
    `;

    // Recreate the important drift of an old/partial 0031: missing new
    // columns, generated names, wrong FK actions/checks/index definitions and
    // effective grants inherited from PUBLIC/a parent role.
    await client.unsafe(`
      ALTER TABLE booking_effect_outbox
        DROP CONSTRAINT IF EXISTS booking_effect_outbox_step_status_chk,
        DROP CONSTRAINT IF EXISTS booking_effect_outbox_step_attempts_chk;
      ALTER TABLE booking_effect_outbox
        DROP COLUMN IF EXISTS referral_status,
        DROP COLUMN IF EXISTS referral_attempts,
        DROP COLUMN IF EXISTS referral_next_attempt_at,
        DROP COLUMN IF EXISTS referral_last_error,
        DROP COLUMN IF EXISTS materialization_status,
        DROP COLUMN IF EXISTS materialization_attempts,
        DROP COLUMN IF EXISTS materialization_next_attempt_at,
        DROP COLUMN IF EXISTS materialization_last_error,
        DROP COLUMN IF EXISTS alerted_at,
        DROP COLUMN IF EXISTS resolved_at,
        DROP COLUMN IF EXISTS resolution_note;

      ALTER TABLE booking_requests
        DROP CONSTRAINT booking_requests_artist_fk;
      ALTER TABLE booking_requests
        ADD CONSTRAINT old_0031_booking_artist_fk
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE;
      ALTER TABLE booking_requests
        DROP COLUMN artist_name_snapshot;

      ALTER TABLE booking_effect_outbox
        RENAME CONSTRAINT booking_effect_outbox_booking_key_unique
        TO old_0031_parent_unique;
      ALTER TABLE booking_effect_outbox
        DROP CONSTRAINT booking_effect_outbox_booking_fk;
      ALTER TABLE booking_effect_outbox
        ADD CONSTRAINT old_0031_parent_booking_fk
        FOREIGN KEY (booking_id) REFERENCES booking_requests(id) ON DELETE CASCADE;

      ALTER TABLE booking_effect_deliveries
        DROP CONSTRAINT booking_effect_deliveries_effect_fk,
        DROP CONSTRAINT booking_effect_deliveries_effect_recipient_channel_unique,
        DROP CONSTRAINT booking_effect_deliveries_dedupe_unique,
        DROP CONSTRAINT booking_effect_deliveries_channel_chk,
        DROP CONSTRAINT booking_effect_deliveries_status_chk,
        DROP CONSTRAINT booking_effect_deliveries_attempts_chk,
        DROP CONSTRAINT booking_effect_deliveries_state_chk;
      ALTER TABLE booking_effect_deliveries
        DROP COLUMN dispatch_started_at,
        DROP COLUMN cancel_requested_at;
      ALTER TABLE booking_effect_deliveries
        ALTER COLUMN status SET DEFAULT 'failed',
        ALTER COLUMN status DROP NOT NULL,
        ALTER COLUMN attempts DROP DEFAULT,
        ALTER COLUMN attempts DROP NOT NULL,
        ADD CONSTRAINT old_0031_delivery_effect_fk
          FOREIGN KEY (effect_id) REFERENCES booking_effect_outbox(id) ON DELETE CASCADE,
        ADD CONSTRAINT old_0031_delivery_recipient_unique
          UNIQUE (effect_id, recipient_user_id, channel),
        ADD CONSTRAINT old_0031_delivery_dedupe_unique UNIQUE (dedupe_key),
        ADD CONSTRAINT old_0031_delivery_channel_chk CHECK (channel <> ''),
        ADD CONSTRAINT old_0031_delivery_status_chk
          CHECK (status IN ('pending', 'processing', 'failed', 'delivered', 'cancelled', 'dead_letter')),
        ADD CONSTRAINT old_0031_delivery_attempts_chk CHECK (attempts > -2),
        ADD CONSTRAINT old_0031_delivery_state_chk CHECK (status <> 'impossible');

      DROP INDEX booking_effect_outbox_due_idx;
      CREATE INDEX booking_effect_outbox_due_idx
        ON booking_effect_outbox (status, id);
      DROP INDEX booking_effect_outbox_expired_lease_idx;
      CREATE INDEX booking_effect_outbox_expired_lease_idx
        ON booking_effect_outbox (lease_until);
      DROP INDEX booking_effect_deliveries_due_idx;
      CREATE INDEX booking_effect_deliveries_due_idx
        ON booking_effect_deliveries (next_attempt_at);
      DROP INDEX booking_effect_deliveries_expired_lease_idx;
      CREATE INDEX booking_effect_deliveries_expired_lease_idx
        ON booking_effect_deliveries (id) WHERE status = 'processing';
    `);

    await dropInheritedTestRole();
    await client.unsafe(`CREATE ROLE ${inheritedRole} NOLOGIN`);
    await client.unsafe(`GRANT ${inheritedRole} TO anon`);
    await client.unsafe(`GRANT SELECT ON booking_effect_deliveries TO ${inheritedRole}`);
    await client`GRANT SELECT (id) ON booking_effect_outbox TO authenticated`;
    await client`GRANT INSERT ON booking_effect_deliveries TO authenticated`;
    await client`GRANT SELECT (id) ON booking_effect_deliveries TO PUBLIC`;
    await client`GRANT USAGE, SELECT ON SEQUENCE booking_effect_outbox_id_seq TO PUBLIC`;
    await client`GRANT UPDATE ON SEQUENCE booking_effect_deliveries_id_seq TO anon`;

    apply("0031 upgrade from old/drifted 0031");

    const first = await shape();
    await assertCurrentShape(first);
    await assertEffectivePrivilegesRevoked();

    const repairedRows = await client<typeof legacyRows>`
      SELECT recipient_user_id, channel, dedupe_key, payload, status, attempts,
        next_attempt_at, last_error, delivered_at
      FROM booking_effect_deliveries
      WHERE effect_id = ${effect.id}
      ORDER BY recipient_user_id
    `;
    if (JSON.stringify(repairedRows) !== JSON.stringify(legacyRows)) {
      throw new Error(
        `0031 changed delivery history:\n${JSON.stringify(legacyRows)}\n${JSON.stringify(repairedRows)}`,
      );
    }

    const [parentAfterUpgrade] = await client<{
      status: string;
      attempts: number;
      referral_status: string;
      referral_attempts: number;
      materialization_status: string;
      materialization_attempts: number;
    }[]>`
      SELECT status, attempts, referral_status, referral_attempts,
        materialization_status, materialization_attempts
      FROM booking_effect_outbox
      WHERE id = ${effect.id}
    `;
    if (
      parentAfterUpgrade?.status !== "failed"
      || parentAfterUpgrade.attempts !== 7
      || parentAfterUpgrade.referral_status !== "pending"
      || parentAfterUpgrade.referral_attempts !== 0
      || parentAfterUpgrade.materialization_status !== "pending"
      || parentAfterUpgrade.materialization_attempts !== 0
    ) {
      throw new Error(
        `0031 coupled/reset coordinator history: ${JSON.stringify(parentAfterUpgrade)}`,
      );
    }

    const dispatchRecipient = "40000000-0000-4000-8000-000000000031";
    await client`
      INSERT INTO booking_effect_deliveries (
        effect_id,
        recipient_user_id,
        channel,
        dedupe_key,
        payload,
        status,
        attempts,
        lease_token,
        lease_until,
        dispatch_started_at
      ) VALUES (
        ${effect.id},
        ${dispatchRecipient},
        'whatsapp',
        ${`${marker}:dispatching`},
        ${client.json({ userId: dispatchRecipient, type: "booking", title: "dispatching" })},
        'dispatching',
        1,
        '00000000-0000-4000-8000-000000000031',
        now() + interval '5 minutes',
        now()
      )
    `;

    const [snapshot] = await client<{ artist_name_snapshot: string | null }[]>`
      SELECT artist_name_snapshot
      FROM booking_requests
      WHERE id = ${booking.id}
    `;
    if (snapshot?.artist_name_snapshot !== "Artist istoric 0031") {
      throw new Error(`artist snapshot was not backfilled: ${JSON.stringify(snapshot)}`);
    }

    // This is a real FK action, not a catalog-only assertion. The booking has
    // a RESTRICT-protected outbox row, so CASCADE would fail here; SET NULL
    // succeeds and preserves both historical rows.
    await client`DELETE FROM artists WHERE id = ${artist.id}`;
    artistId = null;
    const [preserved] = await client<{
      booking_exists: boolean;
      artist_id: number | null;
      artist_name_snapshot: string | null;
      outbox_exists: boolean;
    }[]>`
      SELECT
        EXISTS (SELECT 1 FROM booking_requests WHERE id = ${booking.id}) AS booking_exists,
        (SELECT artist_id FROM booking_requests WHERE id = ${booking.id}) AS artist_id,
        (SELECT artist_name_snapshot FROM booking_requests WHERE id = ${booking.id}) AS artist_name_snapshot,
        EXISTS (SELECT 1 FROM booking_effect_outbox WHERE id = ${effect.id}) AS outbox_exists
    `;
    if (
      !preserved?.booking_exists
      || preserved.artist_id !== null
      || preserved.artist_name_snapshot !== "Artist istoric 0031"
      || !preserved.outbox_exists
    ) {
      throw new Error(`artist deletion lost history: ${JSON.stringify(preserved)}`);
    }

    apply("0031 second current apply (idempotent)");
    const second = await shape();
    await assertCurrentShape(second);
    await assertEffectivePrivilegesRevoked();
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(
        `0031 shape drifted on reapply:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`,
      );
    }

    console.log("0031 verify PASS (upgrade, shape, privileges, artist history)");
  } finally {
    const [deliveryTable] = await client<{ exists: boolean }[]>`
      SELECT to_regclass('public.booking_effect_deliveries') IS NOT NULL AS exists
    `;
    if (effectId !== null && deliveryTable?.exists) {
      await client`
        DELETE FROM booking_effect_deliveries WHERE effect_id = ${effectId}
      `;
    }
    if (effectId !== null) {
      await client`DELETE FROM booking_effect_outbox WHERE id = ${effectId}`;
    }
    if (bookingId !== null) {
      await client`DELETE FROM booking_requests WHERE id = ${bookingId}`;
    }
    if (artistId !== null) {
      await client`DELETE FROM artists WHERE id = ${artistId}`;
    }
    await dropInheritedTestRole();
  }
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 1 });
  });
