// Loads an export produced by scripts/db-export.ts into an empty PostgreSQL
// database. Speaks the ordinary wire protocol, so it works against Neon,
// Supabase, or anything else — which is what makes a rehearsal on a throwaway
// database a faithful test of the real move.
//
// Order matters and is the point of the split export:
//
//   1. 01-pre.sql   enums, tables, primary and unique keys
//   2. data         every row, in any order at all
//   3. 02-post.sql  foreign keys, checks, indexes, functions, triggers
//   4. sequences    restored to where the source left them
//
// Foreign keys arriving last means rows never have to be inserted in
// dependency order, and it needs no superuser — Supabase does not grant
// session_replication_role, so the usual "just disable triggers" does not
// apply.
//
// Refuses to touch a database that already has tables unless --force says so.
//
// Usage:
//   TARGET_DATABASE_URL=… npx tsx scripts/db-import.ts <export-dir> [--force]

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const dir = process.argv[2];
const force = process.argv.includes("--force");
if (!dir) {
  console.error("Usage: npx tsx scripts/db-import.ts <export-dir> [--force]");
  process.exit(1);
}
const url = process.env.TARGET_DATABASE_URL;
if (!url) throw new Error("TARGET_DATABASE_URL is not set");

type Manifest = {
  tables: string[];
  counts: Record<string, number>;
  sequences: Record<string, string>;
  columnTypes: Record<string, Record<string, string>>;
  totalRows: number;
};
const manifest: Manifest = JSON.parse(
  readFileSync(join(dir, "manifest.json"), "utf8"),
);


async function main() {
  const sql = postgres(url!, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    const existing = await sql`
      SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    if (existing[0].n > 0 && !force) {
      throw new Error(
        `target already has ${existing[0].n} tables — refusing to import. ` +
          `Pass --force only if you mean to add to them.`,
      );
    }

    console.log("1/4  schema (tables, enums, keys) …");
    await sql.unsafe(readFileSync(join(dir, "01-pre.sql"), "utf8"));

    console.log("2/4  rows …");
    let loaded = 0;
    for (const table of manifest.tables) {
      const file = join(dir, "data", `${table}.ndjson`);
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      if (lines.length === 0) continue;
      const types = manifest.columnTypes[table] ?? {};
      const rows = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      const columns = Object.keys(types);

      // Each placeholder is cast text-first: $n::text::<coltype>.
      //
      // The ::text half is load-bearing. Casting straight to the column type
      // tells the driver the parameter IS that type, so it serialises the
      // value itself — a timestamp string goes through a JavaScript Date on
      // the way out, arriving three hours off with its microseconds cut to
      // milliseconds. Declaring the parameter as text hands PostgreSQL the
      // exact bytes the source printed and lets it do its own parsing, which
      // is lossless by construction.
      //
      // The second half is needed too: a text parameter cannot be assigned
      // to jsonb, an enum or an array without a cast.
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const colList = columns.map(q).join(", ");
      // Stay well under PostgreSQL's 65535-parameter ceiling on wide tables.
      const perBatch = Math.max(1, Math.floor(60000 / columns.length));

      for (let i = 0; i < rows.length; i += perBatch) {
        const batch = rows.slice(i, i + perBatch);
        const values: unknown[] = [];
        const tuples = batch.map((r) => {
          const placeholders = columns.map((c) => {
            values.push(r[c] ?? null);
            return `$${values.length}::text::${types[c]}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await sql.unsafe(
          `INSERT INTO ${q(table)} (${colList}) VALUES ${tuples.join(", ")}`,
          values as never[],
        );
      }
      loaded += rows.length;
    }
    console.log(`     ${loaded} rows in ${manifest.tables.length} tables`);

    console.log("3/4  foreign keys, indexes, functions, triggers …");
    await sql.unsafe(readFileSync(join(dir, "02-post.sql"), "utf8"));

    console.log("4/4  sequences …");
    for (const [name, stored] of Object.entries(manifest.sequences)) {
      const [lastValue, isCalled] = stored.split(":");
      await sql`SELECT setval(${name}, ${Number(lastValue)}, ${isCalled === "true"})`;
    }

    console.log(`Done. ${manifest.totalRows} rows expected, ${loaded} loaded.`);
    if (loaded !== manifest.totalRows) {
      throw new Error("row count does not match the manifest");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
