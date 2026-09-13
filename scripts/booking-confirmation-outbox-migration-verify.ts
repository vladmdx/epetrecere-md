/**
 * Verifies current 0031 from a disposable local schema with 0030 applied.
 * Refuses an already-0031 schema so the legacy marker backfill is exercised.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";
const client = postgres(config.url, { max: 1, prepare: false, ssl: false });
const migration = "src/lib/db/migrations/manual/0031_booking_confirmation_outbox.sql";

function apply(label: string) {
  console.log(`-- ${label}`);
  execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: config.url },
    stdio: "pipe",
  });
}

async function tableSecurity(table: string, sequence: string) {
  const [security] = await client<{ rls: boolean; grants: number }[]>`
    SELECT c.relrowsecurity AS rls,
      count(p.grantee) FILTER (WHERE p.privilege_type IS NOT NULL)::int AS grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN information_schema.role_table_grants p
      ON p.table_schema = n.nspname
      AND p.table_name = c.relname
      AND p.grantee IN ('anon', 'authenticated')
    WHERE n.nspname = 'public' AND c.relname = ${table}
    GROUP BY c.relrowsecurity
  `;
  const [sequenceSecurity] = await client<{ grants: number }[]>`
    SELECT count(*)::int AS grants
    FROM information_schema.role_usage_grants
    WHERE object_schema = 'public'
      AND object_name = ${sequence}
      AND grantee IN ('anon', 'authenticated')
  `;
  return { ...security, sequenceGrants: sequenceSecurity?.grants ?? 0 };
}

async function shape() {
  const parentColumns = await client<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_effect_outbox'
      AND column_name IN (
        'status', 'attempts', 'next_attempt_at', 'lease_token', 'lease_until',
        'last_error', 'delivered_at', 'updated_at'
      )
    ORDER BY column_name
  `;
  const deliveryColumns = await client<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_effect_deliveries'
    ORDER BY column_name
  `;
  const constraints = await client<{ table_name: string; conname: string; definition: string }[]>`
    SELECT c.conrelid::regclass::text AS table_name,
      c.conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid IN (
      'public.booking_effect_outbox'::regclass,
      'public.booking_effect_deliveries'::regclass
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
  return {
    parentColumns,
    deliveryColumns,
    constraints,
    indexes,
    parentSecurity: await tableSecurity(
      "booking_effect_outbox",
      "booking_effect_outbox_id_seq",
    ),
    deliverySecurity: await tableSecurity(
      "booking_effect_deliveries",
      "booking_effect_deliveries_id_seq",
    ),
  };
}

function requireConstraint(
  constraints: Awaited<ReturnType<typeof shape>>["constraints"],
  name: string,
  definition?: RegExp,
) {
  const row = constraints.find((constraint) => constraint.conname === name);
  if (!row || (definition && !definition.test(row.definition))) {
    throw new Error(`constraint ${name} missing/wrong: ${JSON.stringify(row)}`);
  }
}

async function main() {
  await verifyE2EDatabase(config);
  const [baseline] = await client<{ outbox: boolean; status_column: boolean }[]>`
    SELECT
      to_regclass('public.booking_effect_outbox') IS NOT NULL AS outbox,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'booking_effect_outbox'
          AND column_name = 'status'
      ) AS status_column
  `;
  if (!baseline?.outbox) throw new Error("Migration 0030 must be applied first.");
  if (baseline.status_column) {
    throw new Error("Migration verification requires a disposable pre-0031 schema.");
  }

  const marker = `outbox-migration-${Date.now()}`;
  const [booking] = await client<{ id: number }[]>`
    INSERT INTO booking_requests (client_name, client_phone, event_date, status)
    VALUES (${marker}, '+37360000000', '2028-11-01', 'confirmed_by_client')
    RETURNING id
  `;
  await client`
    INSERT INTO booking_effect_outbox (booking_id, effect_key)
    VALUES (${booking.id}, 'confirm_notify')
  `;

  try {
    apply("0031 first apply");
    const first = await shape();
    if (first.parentColumns.length !== 8) {
      throw new Error(`0031 parent columns missing: ${JSON.stringify(first.parentColumns)}`);
    }
    for (const required of ["attempts", "next_attempt_at", "status", "updated_at"]) {
      if (first.parentColumns.find((column) => column.column_name === required)?.is_nullable !== "NO") {
        throw new Error(`${required} must be NOT NULL`);
      }
    }
    if (first.deliveryColumns.length !== 15) {
      throw new Error(`delivery columns missing: ${JSON.stringify(first.deliveryColumns)}`);
    }
    for (const required of [
      "effect_id",
      "recipient_user_id",
      "channel",
      "dedupe_key",
      "payload",
      "status",
      "attempts",
      "next_attempt_at",
    ]) {
      if (first.deliveryColumns.find((column) => column.column_name === required)?.is_nullable !== "NO") {
        throw new Error(`delivery ${required} must be NOT NULL`);
      }
    }
    requireConstraint(
      first.constraints,
      "booking_effect_outbox_booking_key_unique",
      /UNIQUE \(booking_id, effect_key\)/,
    );
    requireConstraint(
      first.constraints,
      "booking_effect_outbox_booking_fk",
      /FOREIGN KEY \(booking_id\).*ON DELETE RESTRICT/,
    );
    for (const name of [
      "booking_effect_outbox_status_chk",
      "booking_effect_outbox_attempts_chk",
      "booking_effect_outbox_state_chk",
      "booking_effect_deliveries_effect_fk",
      "booking_effect_deliveries_effect_recipient_channel_unique",
      "booking_effect_deliveries_dedupe_unique",
      "booking_effect_deliveries_channel_chk",
      "booking_effect_deliveries_status_chk",
      "booking_effect_deliveries_attempts_chk",
      "booking_effect_deliveries_state_chk",
    ]) requireConstraint(first.constraints, name);
    if (first.indexes.length !== 4) {
      throw new Error(`outbox indexes missing: ${JSON.stringify(first.indexes)}`);
    }
    for (const security of [first.parentSecurity, first.deliverySecurity]) {
      if (!security?.rls || security.grants !== 0 || security.sequenceGrants !== 0) {
        throw new Error(`outbox security wrong: ${JSON.stringify(security)}`);
      }
    }
    const [backfilled] = await client<{
      status: string;
      attempts: number;
      next_attempt_at: Date | null;
      updated_at: Date | null;
      delivered_at: Date | null;
    }[]>`
      SELECT status, attempts, next_attempt_at, updated_at, delivered_at
      FROM booking_effect_outbox
      WHERE booking_id = ${booking.id}
    `;
    if (
      backfilled?.status !== "pending"
      || backfilled.attempts !== 0
      || !backfilled.next_attempt_at
      || !backfilled.updated_at
      || backfilled.delivered_at
    ) {
      throw new Error(`legacy row was not safely re-queued: ${JSON.stringify(backfilled)}`);
    }

    // Simulate the exact historical drift: generated UNIQUE name + CASCADE FK.
    await client.unsafe(`
      ALTER TABLE booking_effect_outbox
        RENAME CONSTRAINT booking_effect_outbox_booking_key_unique
        TO booking_effect_outbox_booking_id_effect_key_key;
      ALTER TABLE booking_effect_outbox
        DROP CONSTRAINT booking_effect_outbox_booking_fk;
      ALTER TABLE booking_effect_outbox
        ADD CONSTRAINT booking_effect_outbox_booking_id_fkey
        FOREIGN KEY (booking_id) REFERENCES booking_requests(id) ON DELETE CASCADE;
    `);
    apply("0031 second apply (idempotent + self-healing)");
    const second = await shape();
    requireConstraint(
      second.constraints,
      "booking_effect_outbox_booking_key_unique",
      /UNIQUE \(booking_id, effect_key\)/,
    );
    requireConstraint(
      second.constraints,
      "booking_effect_outbox_booking_fk",
      /FOREIGN KEY \(booking_id\).*ON DELETE RESTRICT/,
    );
    if (second.constraints.some((row) =>
      row.conname === "booking_effect_outbox_booking_id_effect_key_key"
      || row.conname === "booking_effect_outbox_booking_id_fkey"
    )) {
      throw new Error("0031 did not heal historical generated constraints");
    }
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`0031 shape drifted:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`);
    }
    let bookingDeleteBlocked = false;
    try {
      await client`DELETE FROM booking_requests WHERE id = ${booking.id}`;
    } catch (error) {
      bookingDeleteBlocked = (error as { code?: string }).code === "23503";
    }
    if (!bookingDeleteBlocked) {
      throw new Error("booking deletion must not cascade away durable outbox evidence");
    }
    console.log("0031 verify PASS");
  } finally {
    const [deliveryTable] = await client<{ exists: boolean }[]>`
      SELECT to_regclass('public.booking_effect_deliveries') IS NOT NULL AS exists
    `;
    if (deliveryTable?.exists) {
      await client`DELETE FROM booking_effect_deliveries
        WHERE effect_id IN (SELECT id FROM booking_effect_outbox WHERE booking_id = ${booking.id})`;
    }
    await client`DELETE FROM booking_effect_outbox WHERE booking_id = ${booking.id}`;
    await client`DELETE FROM booking_requests WHERE id = ${booking.id}`;
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
