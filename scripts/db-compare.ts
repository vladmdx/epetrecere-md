// Compares two PostgreSQL databases structurally and by content, and exits
// non-zero on any difference. This is what turns "the import ran without an
// error" into "the copy is faithful" — the migration is only finished when
// this prints no differences.
//
// Checks, in order: enums and their labels, tables, every column's type,
// nullability and default, constraints, indexes, functions, triggers,
// sequence positions, row counts, and a content digest per table.
//
// The digest is md5 over each row's text representation, aggregated in a
// fixed order, so it is independent of physical row order but sensitive to
// any changed byte in any column.
//
// Usage:
//   SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… npx tsx scripts/db-compare.ts

import "dotenv/config";
import postgres from "postgres";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL must both be set");
}

type Row = Record<string, unknown>;
const differences: string[] = [];

function compare(label: string, a: Row[], b: Row[], key: (r: Row) => string) {
  const ma = new Map(a.map((r) => [key(r), JSON.stringify(r)]));
  const mb = new Map(b.map((r) => [key(r), JSON.stringify(r)]));
  for (const [k, v] of ma) {
    if (!mb.has(k)) differences.push(`${label}: missing in target — ${k}`);
    else if (mb.get(k) !== v) {
      differences.push(
        `${label}: differs — ${k}\n    source: ${v}\n    target: ${mb.get(k)}`,
      );
    }
  }
  for (const k of mb.keys()) {
    if (!ma.has(k)) differences.push(`${label}: extra in target — ${k}`);
  }
}

const QUERIES: { label: string; sql: string; key: (r: Row) => string }[] = [
  {
    label: "enum",
    // Position, not enumsortorder. A label added later with ALTER TYPE … ADD
    // VALUE BEFORE gets a fractional sortorder (2.5); recreating the type
    // renumbers it to a plain integer. The order is identical and so is the
    // behaviour, so comparing the raw number would report a difference that
    // is not one.
    sql: `SELECT t.typname, e.enumlabel,
                 row_number() OVER (PARTITION BY t.typname
                                    ORDER BY e.enumsortorder) AS position
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public'`,
    key: (r) => `${r.typname}.${r.position}`,
  },
  {
    label: "column",
    sql: `SELECT c.relname AS tbl, a.attname AS col,
                 format_type(a.atttypid, a.atttypmod) AS coltype,
                 a.attnotnull,
                 pg_get_expr(d.adbin, d.adrelid) AS coldefault
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE n.nspname = 'public' AND c.relkind = 'r'
             AND a.attnum > 0 AND NOT a.attisdropped`,
    key: (r) => `${r.tbl}.${r.col}`,
  },
  {
    label: "constraint",
    sql: `SELECT rel.relname AS tbl, c.conname,
                 pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = rel.relnamespace
           WHERE n.nspname = 'public'`,
    key: (r) => `${r.tbl}.${r.conname}`,
  },
  {
    label: "index",
    sql: `SELECT tablename, indexname, indexdef
            FROM pg_indexes WHERE schemaname = 'public'`,
    key: (r) => `${r.tablename}.${r.indexname}`,
  },
  {
    label: "function",
    sql: `SELECT p.proname, pg_get_functiondef(p.oid) AS def
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'`,
    key: (r) => String(r.proname),
  },
  {
    label: "trigger",
    sql: `SELECT t.tgname, pg_get_triggerdef(t.oid) AS def
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
    key: (r) => String(r.tgname),
  },
  {
    label: "sequence",
    sql: `SELECT sequencename, last_value FROM pg_sequences
           WHERE schemaname = 'public'`,
    key: (r) => String(r.sequencename),
  },
];

async function main() {
  const src = postgres(sourceUrl!, { ssl: "require", max: 1, onnotice: () => {}, prepare: false });
  const tgt = postgres(targetUrl!, { ssl: "require", max: 1, onnotice: () => {}, prepare: false });
  try {
    for (const { label, sql: text, key } of QUERIES) {
      const [a, b] = await Promise.all([src.unsafe(text), tgt.unsafe(text)]);
      compare(label, a as Row[], b as Row[], key);
    }

    // Content: a digest per table, order-independent but byte-sensitive.
    const tables = (await src`
      SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`) as { relname: string }[];

    for (const { relname } of tables) {
      const digest = `SELECT count(*)::int AS n,
                             md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS d
                        FROM (SELECT t::text AS x FROM ${'"'}${relname}${'"'} t) s`;
      const [a, b] = await Promise.all([src.unsafe(digest), tgt.unsafe(digest)]);
      const ra = a[0] as unknown as { n: number; d: string };
      const rb = b[0] as unknown as { n: number; d: string };
      if (ra.n !== rb.n) {
        differences.push(`rows: ${relname} — source ${ra.n}, target ${rb.n}`);
      } else if (ra.d !== rb.d) {
        differences.push(`content: ${relname} — ${ra.n} rows, digests differ`);
      }
    }

    if (differences.length === 0) {
      console.log(
        `No differences. ${tables.length} tables matched structurally and by content.`,
      );
    } else {
      console.error(`${differences.length} difference(s):\n`);
      for (const d of differences) console.error(`  ${d}`);
      process.exit(1);
    }
  } finally {
    await src.end();
    await tgt.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
