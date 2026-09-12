/**
 * Verifies migration 0031 from a disposable local schema with 0030 applied.
 * Refuses an already-0031 schema so the legacy-row backfill is genuinely tested.
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

async function shape() {
  const columns = await client<{ column_name: string; is_nullable: string }[]>`
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
  const constraints = await client<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.booking_effect_outbox'::regclass
      AND conname IN (
        'booking_effect_outbox_status_chk',
        'booking_effect_outbox_attempts_chk',
        'booking_effect_outbox_state_chk'
      )
    ORDER BY conname
  `;
  const [index] = await client<{ indexdef: string }[]>`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'booking_effect_outbox_due_idx'
  `;
  const [security] = await client<{ rls: boolean; grants: number }[]>`
    SELECT c.relrowsecurity AS rls,
      count(p.grantee) FILTER (WHERE p.privilege_type IS NOT NULL)::int AS grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN information_schema.role_table_grants p
      ON p.table_schema = n.nspname
      AND p.table_name = c.relname
      AND p.grantee IN ('anon', 'authenticated')
    WHERE n.nspname = 'public' AND c.relname = 'booking_effect_outbox'
    GROUP BY c.relrowsecurity
  `;
  const [sequenceSecurity] = await client<{ grants: number }[]>`
    SELECT count(*)::int AS grants
    FROM information_schema.role_usage_grants
    WHERE object_schema = 'public'
      AND object_name = 'booking_effect_outbox_id_seq'
      AND grantee IN ('anon', 'authenticated')
  `;
  return {
    columns,
    constraints,
    index: index?.indexdef ?? null,
    security,
    sequenceGrants: sequenceSecurity?.grants ?? 0,
  };
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
    if (first.columns.length !== 8) {
      throw new Error(`0031 columns missing: ${JSON.stringify(first.columns)}`);
    }
    for (const required of ["attempts", "next_attempt_at", "status", "updated_at"]) {
      if (first.columns.find((column) => column.column_name === required)?.is_nullable !== "NO") {
        throw new Error(`${required} must be NOT NULL`);
      }
    }
    if (first.constraints.length !== 3) {
      throw new Error(`0031 constraints missing: ${JSON.stringify(first.constraints)}`);
    }
    if (!first.index?.includes("effect_key, status, next_attempt_at")) {
      throw new Error(`due index missing/wrong: ${first.index}`);
    }
    if (!first.security?.rls || first.security.grants !== 0 || first.sequenceGrants !== 0) {
      throw new Error(`outbox security wrong: ${JSON.stringify({
        table: first.security,
        sequenceGrants: first.sequenceGrants,
      })}`);
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

    apply("0031 second apply (idempotent)");
    const second = await shape();
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`0031 shape drifted:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`);
    }
    console.log("0031 verify PASS");
  } finally {
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
