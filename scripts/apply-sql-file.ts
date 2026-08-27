// Applies a single .sql migration file to the database over a real TCP
// pool (Neon serverless driver). This is the non-interactive escape hatch
// for the `manual/` migration set: unlike `drizzle-kit push`, it never
// prompts (push stalls on the users.referral_code unique-constraint
// question), so it works locally and in CI.
//
// Usage:
//   DATABASE_URL=… npx tsx scripts/apply-sql-file.ts <path-to.sql>
//
// Example — the push_tokens table needed by the mobile app:
//   DATABASE_URL=… npx tsx scripts/apply-sql-file.ts \
//     src/lib/db/migrations/manual/0015_push_tokens.sql
//
// The whole file is sent as ONE multi-statement query (simple query
// protocol), so it may carry its own BEGIN/COMMIT and dollar-quoted DO
// blocks. Always write files idempotently (IF NOT EXISTS / guarded DO
// blocks) so a re-run is a no-op. If the serverless driver ever rejects a
// multi-statement batch, fall back to: psql "$DATABASE_URL" -f <file>.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";
import postgres from "postgres";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: npx tsx scripts/apply-sql-file.ts <path-to.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const path = resolve(process.cwd(), fileArg);
const sql = readFileSync(path, "utf8");

(async () => {
  console.log(`Applying ${path} …`);

  // Neon keeps its own pool; every other host — Supabase included — is
  // reached with the ordinary driver. Both send the file as ONE
  // multi-statement query, so a migration may carry its own BEGIN/COMMIT
  // and dollar-quoted DO blocks.
  if (!url!.includes("neon.tech")) {
    const client = postgres(url!, { ssl: "require", max: 1, onnotice: () => {} });
    try {
      await client.unsafe(sql);
      console.log("Done.");
    } catch (err) {
      console.error("FAILED");
      console.error(err);
      process.exitCode = 1;
    } finally {
      await client.end();
    }
    return;
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Done.");
  } catch (err) {
    console.error("FAILED");
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
