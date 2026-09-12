/**
 * Verifies migration 0030 (legal session uniqueness, notification dedupe,
 * booking effect outbox) on the disposable local E2E database.
 * Applies 0030 twice, asserts unique-index shape and session column.
 *
 * Do NOT apply this file to Preview or Production.
 * Run: npm run test:multihall:migration0030
 */
import { execFileSync } from "node:child_process";
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
  const [row] = await client<{ exists: boolean }[]>`
    SELECT to_regclass('public.booking_effect_outbox') IS NOT NULL AS exists
  `;
  return Boolean(row?.exists);
}

async function main() {
  await verifyE2EDatabase(config);
  const [state] = await client<{ has_legal: boolean }[]>`
    SELECT to_regclass('public.legal_acceptances') IS NOT NULL AS has_legal
  `;
  if (!state?.has_legal) {
    throw new Error("0030 verification requires legal_acceptances (post-0017/0028).");
  }

  apply("0030 first apply");
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
  if (!first.legal_acceptances_session_document_unique) {
    throw new Error("legal_acceptances_session_document_unique missing");
  }
  if (!first.notifications_user_dedupe_unique) {
    throw new Error("notifications_user_dedupe_unique missing");
  }
  if (!(await outboxExists())) {
    throw new Error("booking_effect_outbox missing");
  }

  apply("0030 second apply (idempotent)");
  const second = await indexShape();
  const colSecond = await sessionColumn();
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error(`0030 indexes drifted:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`);
  }
  if (JSON.stringify(colFirst) !== JSON.stringify(colSecond)) {
    throw new Error("acceptance_session_id drifted on second apply");
  }
  log("idempotent: unique indexes and session column unchanged");
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
