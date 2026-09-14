/**
 * Verifies migration 0030 (legal session uniqueness, notification dedupe,
 * booking effect outbox, venue-only conversations) on the disposable local E2E database.
 * Applies 0030 twice, asserts unique-index shape and session column.
 *
 * Do NOT apply this file to Preview or Production.
 * Run: npm run test:multihall:migration0030
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { e2eDatabaseConfig, verifyE2EDatabase } from "../e2e/helpers/safety";

const config = e2eDatabaseConfig();
process.env.DATABASE_URL = config.url;
process.env.E2E_RUNTIME = "1";
const client = postgres(config.url, { max: 1, prepare: false, ssl: false });
const migration = "src/lib/db/migrations/manual/0030_legal_acceptance_session.sql";
const log = (message: string) => console.log(message);

function apply(label: string) {
  log(`-- ${label}`);
  try {
    const output = execFileSync("npx", ["tsx", "scripts/apply-sql-file.ts", migration], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: config.url },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (output.trim()) log(output.trim());
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    throw error;
  }
}

async function indexShape() {
  const rows = await client<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'legal_acceptances_unique',
        'legal_acceptances_org_unique',
        'legal_acceptances_session_document_unique',
        'legal_acceptances_id_session_unique',
        'notifications_user_dedupe_unique'
      )
    ORDER BY indexname
  `;
  return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
}

async function sessionColumn() {
  const [row] = await client<{ column_name: string; is_nullable: string; data_type: string }[]>`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'legal_acceptances'
      AND column_name = 'acceptance_session_id'
  `;
  return row;
}

async function outboxExists() {
  const [row] = await client<{ booking: boolean; legal: boolean }[]>`
    SELECT
      to_regclass('public.booking_effect_outbox') IS NOT NULL AS booking,
      to_regclass('public.legal_contract_delivery_outbox') IS NOT NULL AS legal
  `;
  return row;
}

async function legalConstraintShape() {
  const rows = await client<{ conname: string; definition: string }[]>`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid IN (
      'public.legal_acceptances'::regclass,
      'public.legal_contract_delivery_outbox'::regclass
    )
      AND conname IN (
        'legal_acceptances_org_subject_chk',
        'legal_contract_delivery_status_chk',
        'legal_contract_delivery_channel_chk',
        'legal_contract_delivery_recipient_unique',
        'legal_contract_delivery_outbox_pkey',
        'legal_contract_delivery_anchor_session_fk'
      )
    ORDER BY conname
  `;
  return Object.fromEntries(rows.map((row) => [row.conname, row.definition]));
}

async function legalOutboxRls() {
  const [row] = await client<{ enabled: boolean }[]>`
    SELECT relrowsecurity AS enabled
    FROM pg_class
    WHERE oid = 'public.legal_contract_delivery_outbox'::regclass
  `;
  return Boolean(row?.enabled);
}

async function legalOutboxColumns() {
  const rows = await client<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }[]>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'legal_contract_delivery_outbox'
      AND column_name IN (
        'id', 'acceptance_session_id', 'channel', 'recipient_key',
        'recipient_email', 'next_attempt_at', 'lease_token', 'dead_lettered_at'
      )
    ORDER BY column_name
  `;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
}

async function legalOutboxIndexShape() {
  const rows = await client<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'legal_contract_delivery_pending_idx',
        'legal_contract_delivery_session_idx'
      )
    ORDER BY indexname
  `;
  return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
}

async function legalOutboxPrivileges() {
  const rows = await client<{
    role_name: string;
    table_select: boolean;
    sequence_usage: boolean;
  }[]>`
    SELECT role_name,
      has_table_privilege(role_name, 'public.legal_contract_delivery_outbox', 'SELECT') AS table_select,
      has_sequence_privilege(role_name, 'public.legal_contract_delivery_outbox_id_seq', 'USAGE') AS sequence_usage
    FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
    WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
    ORDER BY role_name
  `;
  if (rows.length !== 2) throw new Error("0030 privilege test requires anon and authenticated roles");
  return rows;
}

async function assertOutboxDenied(role: "anon" | "authenticated") {
  try {
    await client.begin(async (sql) => {
      await sql.unsafe(`SET LOCAL ROLE ${role}`);
      await sql`SELECT id FROM public.legal_contract_delivery_outbox LIMIT 1`;
    });
    throw new Error(`${role} unexpectedly selected legal delivery outbox`);
  } catch (error) {
    if ((error as Error).message.includes("unexpectedly selected")) throw error;
    if ((error as { code?: string }).code !== "42501") {
      throw new Error(`${role} expected table denial 42501, got ${(error as { code?: string }).code}`);
    }
  }
  try {
    await client.begin(async (sql) => {
      await sql.unsafe(`SET LOCAL ROLE ${role}`);
      await sql`SELECT nextval('public.legal_contract_delivery_outbox_id_seq')`;
    });
    throw new Error(`${role} unexpectedly used legal delivery sequence`);
  } catch (error) {
    if ((error as Error).message.includes("unexpectedly used")) throw error;
    if ((error as { code?: string }).code !== "42501") {
      throw new Error(`${role} expected sequence denial 42501, got ${(error as { code?: string }).code}`);
    }
  }
}

async function conversationsArtistNullable() {
  const [row] = await client<{ is_nullable: string }[]>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'artist_id'
  `;
  return row;
}

async function conversationsVendorCheck() {
  const [row] = await client<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname = 'conversations_vendor_required_chk'
  `;
  return row;
}

async function main() {
  await verifyE2EDatabase(config);
  const [state] = await client<{
    has_legal: boolean;
    has_session: boolean;
    has_outbox: boolean;
  }[]>`
    SELECT
      to_regclass('public.legal_acceptances') IS NOT NULL AS has_legal,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'legal_acceptances'
          AND column_name = 'acceptance_session_id'
      ) AS has_session,
      to_regclass('public.legal_contract_delivery_outbox') IS NOT NULL AS has_outbox
  `;
  if (!state?.has_legal) {
    throw new Error("0030 verification requires legal_acceptances (post-0017/0028).");
  }
  if (state.has_session || state.has_outbox) {
    throw new Error("0030 verification requires a disposable, genuine pre-0030 baseline.");
  }

  const mark = `m30_${Date.now()}_`;
  const [fixtureUser] = await client<{ id: string }[]>`
    INSERT INTO users (clerk_id, email, name)
    VALUES (${mark + "owner"}, ${mark + "owner@example.invalid"}, 'M30 Signer')
    RETURNING id
  `;
  const partialRows = await client<{ id: number }[]>`
    INSERT INTO legal_acceptances (
      user_id, subject_type, document_slug, document_version, pack_version,
      locale, signature_name, signature_image, content_hash, accepted_at
    ) VALUES
      (${fixtureUser.id}, 'artist', 'reguli-marketplace', '1.0', 'fixture-partial',
        'ro', 'M30 Signer', 'data:image/png;base64,M30', 'h1', '2026-09-11T07:10:53.123Z'),
      (${fixtureUser.id}, 'artist', 'tarife', '2.1', 'fixture-partial',
        'ro', 'M30 Signer', 'data:image/png;base64,M30', 'h2', '2026-09-11T07:10:53.123Z')
    RETURNING id
  `;
  const partialIds = partialRows.map((row) => row.id);
  const [beforePartial] = await client<{ row_count: number; checksum: string }[]>`
    SELECT count(*)::int AS row_count,
      md5(string_agg(concat_ws(':', id, document_slug, document_version,
        pack_version, signature_name, signature_image, content_hash,
        accepted_at::text), '|' ORDER BY id)) AS checksum
    FROM legal_acceptances WHERE id = ANY(${partialIds})
  `;

  apply("0030 first apply");
  const [afterPartial] = await client<{
    row_count: number;
    session_count: number;
    null_sessions: number;
    checksum: string;
    session_id: string;
  }[]>`
    SELECT count(*)::int AS row_count,
      count(DISTINCT acceptance_session_id)::int AS session_count,
      count(*) FILTER (WHERE acceptance_session_id IS NULL)::int AS null_sessions,
      md5(string_agg(concat_ws(':', id, document_slug, document_version,
        pack_version, signature_name, signature_image, content_hash,
        accepted_at::text), '|' ORDER BY id)) AS checksum,
      min(acceptance_session_id::text) AS session_id
    FROM legal_acceptances WHERE id = ANY(${partialIds})
  `;
  if (
    afterPartial.row_count !== beforePartial.row_count ||
    afterPartial.checksum !== beforePartial.checksum ||
    afterPartial.session_count !== 1 ||
    afterPartial.null_sessions !== 0
  ) {
    throw new Error(`pre-0030 partial evidence changed: ${JSON.stringify({ beforePartial, afterPartial })}`);
  }
  try {
    await client`UPDATE legal_acceptances SET content_hash = 'mutated' WHERE id = ${partialIds[0]}`;
    throw new Error("append-only trigger unexpectedly allowed evidence mutation");
  } catch (error) {
    if ((error as Error).message.includes("unexpectedly allowed")) throw error;
    if ((error as { code?: string }).code !== "42501") {
      throw new Error(`append-only update expected 42501, got ${(error as { code?: string }).code}`);
    }
  }
  const recoverySession = randomUUID();
  await client`
    INSERT INTO legal_acceptances (
      user_id, subject_type, document_slug, document_version, pack_version,
      acceptance_session_id, locale, signature_name, signature_image,
      content_hash, accepted_at
    ) VALUES (
      ${fixtureUser.id}, 'artist', 'reguli-marketplace', '1.0', 'fixture-partial',
      ${recoverySession}, 'ro', 'M30 Signer', 'data:image/png;base64,M30',
      'recovery', '2026-09-11T07:11:53.123Z'
    )
  `;
  try {
    await client`
      INSERT INTO legal_acceptances (
        user_id, subject_type, document_slug, document_version, pack_version,
        acceptance_session_id, locale, signature_name, signature_image,
        content_hash, accepted_at
      ) VALUES (
        ${fixtureUser.id}, 'artist', 'reguli-marketplace', '1.0', 'fixture-partial',
        ${recoverySession}, 'ro', 'M30 Signer', 'data:image/png;base64,M30',
        'duplicate', '2026-09-11T07:12:53.123Z'
      )
    `;
    throw new Error("same-session duplicate unexpectedly succeeded");
  } catch (error) {
    if ((error as Error).message.includes("unexpectedly succeeded")) throw error;
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(`same-session duplicate expected 23505, got ${(error as { code?: string }).code}`);
    }
  }
  const first = await indexShape();
  const colFirst = await sessionColumn();
  if (!colFirst || colFirst.is_nullable !== "NO") {
    throw new Error(`acceptance_session_id must be NOT NULL: ${JSON.stringify(colFirst)}`);
  }
  if (!/uuid/i.test(colFirst.data_type)) {
    throw new Error(`acceptance_session_id must be uuid: ${colFirst.data_type}`);
  }
  if (!first.legal_acceptances_unique?.includes("pack_version")) {
    throw new Error(`legacy unique must include pack_version: ${first.legal_acceptances_unique}`);
  }
  if (!first.legal_acceptances_org_unique?.includes("pack_version")) {
    throw new Error(`org unique must include pack_version: ${first.legal_acceptances_org_unique}`);
  }
  if (!first.legal_acceptances_unique?.includes("acceptance_session_id")) {
    throw new Error(`legacy unique must include session id: ${first.legal_acceptances_unique}`);
  }
  if (!first.legal_acceptances_org_unique?.includes("acceptance_session_id")) {
    throw new Error(`org unique must include session id: ${first.legal_acceptances_org_unique}`);
  }
  if (!first.legal_acceptances_session_document_unique) {
    throw new Error("legal_acceptances_session_document_unique missing");
  }
  if (!first.legal_acceptances_id_session_unique) {
    throw new Error("legal_acceptances_id_session_unique missing");
  }
  if (!first.notifications_user_dedupe_unique) {
    throw new Error("notifications_user_dedupe_unique missing");
  }
  const outboxes = await outboxExists();
  if (!outboxes?.booking || !outboxes.legal) {
    throw new Error(`required outbox missing: ${JSON.stringify(outboxes)}`);
  }
  const legalConstraintsFirst = await legalConstraintShape();
  if (!legalConstraintsFirst.legal_acceptances_org_subject_chk) {
    throw new Error("legal_acceptances_org_subject_chk missing");
  }
  if (!legalConstraintsFirst.legal_contract_delivery_status_chk) {
    throw new Error("legal_contract_delivery_status_chk missing");
  }
  if (!legalConstraintsFirst.legal_contract_delivery_status_chk.includes("dead_letter")) {
    throw new Error("legal delivery status check must include dead_letter");
  }
  if (!legalConstraintsFirst.legal_contract_delivery_channel_chk?.includes("signer") ||
      !legalConstraintsFirst.legal_contract_delivery_channel_chk?.includes("admin")) {
    throw new Error("legal delivery channel check must allow signer/admin only");
  }
  if (!legalConstraintsFirst.legal_contract_delivery_outbox_pkey?.includes("PRIMARY KEY (id)")) {
    throw new Error("legal delivery outbox must use a row id primary key");
  }
  if (!/UNIQUE \(acceptance_session_id, channel, recipient_key\)/i.test(
    legalConstraintsFirst.legal_contract_delivery_recipient_unique ?? "",
  )) {
    throw new Error("legal delivery uniqueness must be per session/channel/recipient");
  }
  if (!/FOREIGN KEY \(anchor_acceptance_id, acceptance_session_id\)/i.test(
    legalConstraintsFirst.legal_contract_delivery_anchor_session_fk ?? "",
  )) {
    throw new Error("legal delivery anchor must belong to its exact acceptance session");
  }
  const columnsFirst = await legalOutboxColumns();
  for (const name of [
    "id",
    "acceptance_session_id",
    "channel",
    "recipient_key",
    "recipient_email",
    "next_attempt_at",
  ]) {
    if (!columnsFirst[name] || columnsFirst[name].is_nullable !== "NO") {
      throw new Error(`legal delivery ${name} must be NOT NULL: ${JSON.stringify(columnsFirst[name])}`);
    }
  }
  if (columnsFirst.lease_token?.data_type !== "uuid" || columnsFirst.lease_token.is_nullable !== "YES") {
    throw new Error(`legal delivery lease_token must be nullable uuid: ${JSON.stringify(columnsFirst.lease_token)}`);
  }
  if (columnsFirst.dead_lettered_at?.is_nullable !== "YES") {
    throw new Error("legal delivery dead_lettered_at must be nullable");
  }
  const outboxIndexesFirst = await legalOutboxIndexShape();
  if (!/\(next_attempt_at, created_at\)/i.test(outboxIndexesFirst.legal_contract_delivery_pending_idx ?? "") ||
      !/delivered_at IS NULL/i.test(outboxIndexesFirst.legal_contract_delivery_pending_idx ?? "") ||
      !/dead_lettered_at IS NULL/i.test(outboxIndexesFirst.legal_contract_delivery_pending_idx ?? "")) {
    throw new Error(`legal pending index shape invalid: ${outboxIndexesFirst.legal_contract_delivery_pending_idx}`);
  }
  if (!/\(acceptance_session_id\)/i.test(outboxIndexesFirst.legal_contract_delivery_session_idx ?? "")) {
    throw new Error("legal delivery session index missing");
  }
  if (!(await legalOutboxRls())) {
    throw new Error("legal_contract_delivery_outbox RLS must be enabled");
  }
  const convFirst = await conversationsArtistNullable();
  if (!convFirst || convFirst.is_nullable !== "YES") {
    throw new Error(`conversations.artist_id must be nullable: ${JSON.stringify(convFirst)}`);
  }
  if (!(await conversationsVendorCheck())) {
    throw new Error("conversations_vendor_required_chk missing");
  }

  const revokedFirst = await legalOutboxPrivileges();
  if (revokedFirst.some((row) => row.table_select || row.sequence_usage)) {
    throw new Error(`0030 must revoke anon/authenticated: ${JSON.stringify(revokedFirst)}`);
  }
  await client`GRANT SELECT ON public.legal_contract_delivery_outbox TO anon, authenticated`;
  await client`GRANT SELECT, USAGE ON SEQUENCE public.legal_contract_delivery_outbox_id_seq TO anon, authenticated`;
  const deliberatelyGranted = await legalOutboxPrivileges();
  if (deliberatelyGranted.some((row) => !row.table_select || !row.sequence_usage)) {
    throw new Error(`privilege grant setup failed: ${JSON.stringify(deliberatelyGranted)}`);
  }

  apply("0030 second apply (idempotent)");
  const second = await indexShape();
  const colSecond = await sessionColumn();
  const legalConstraintsSecond = await legalConstraintShape();
  const columnsSecond = await legalOutboxColumns();
  const outboxIndexesSecond = await legalOutboxIndexShape();
  const convSecond = await conversationsArtistNullable();
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error(`0030 indexes drifted:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`);
  }
  if (JSON.stringify(colFirst) !== JSON.stringify(colSecond)) {
    throw new Error("acceptance_session_id drifted on second apply");
  }
  if (JSON.stringify(legalConstraintsFirst) !== JSON.stringify(legalConstraintsSecond)) {
    throw new Error("legal delivery constraints drifted on second apply");
  }
  if (JSON.stringify(columnsFirst) !== JSON.stringify(columnsSecond)) {
    throw new Error("legal delivery columns drifted on second apply");
  }
  if (JSON.stringify(outboxIndexesFirst) !== JSON.stringify(outboxIndexesSecond)) {
    throw new Error("legal delivery indexes drifted on second apply");
  }
  if (JSON.stringify(convFirst) !== JSON.stringify(convSecond)) {
    throw new Error("conversations.artist_id drifted on second apply");
  }
  const revokedSecond = await legalOutboxPrivileges();
  if (revokedSecond.some((row) => row.table_select || row.sequence_usage)) {
    throw new Error(`0030 reapply must repair grants: ${JSON.stringify(revokedSecond)}`);
  }
  await assertOutboxDenied("anon");
  await assertOutboxDenied("authenticated");
  log("idempotent: unique indexes, session column, and conversations.artist_id unchanged");
  log("0030 verify PASS");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
