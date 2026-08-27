# Moving the database from Neon to Supabase

Everything here has been rehearsed end to end against a throwaway copy of the
production database. The tooling is in `scripts/db-export.ts`,
`scripts/db-import.ts` and `scripts/db-compare.ts`; the rehearsal finished
with `No differences. 54 tables matched structurally and by content.`

## What actually moves

| | |
|---|---|
| Data | 54 tables, 24 enum types, 51 sequences, ~2,251 rows, 23 MB |
| Extensions | `plpgsql` only — nothing to install on the other side |
| Functions / triggers | 1 each: the append-only guard on `legal_acceptances` |
| Row-level security | Not in use. Access control is in the application |
| Authentication | **Does not move.** Auth is Clerk, not Supabase Auth |
| Storage / files | **Does not move.** No files live in the database |

## What I need from you

1. A Supabase project (region: choose the one closest to Moldova — `eu-central-1`).
2. The **connection strings**, both of them, from Project Settings → Database:
   - the **pooler** string (port 6543, "Transaction" mode) — this becomes `DATABASE_URL`
   - the **direct** string (port 5432) — used only to create the schema
3. `SUPABASE_URL` and the **service role key** (Project Settings → API). The
   middleware needs these: it runs on the Edge runtime, where TCP sockets do
   not exist, so it reads the redirects table over PostgREST instead.
4. Access to the Vercel project's environment variables, or your willingness
   to paste the four values in yourself.

Hand these over and the cutover takes about fifteen minutes, most of it
verification.

## Why the connection string matters

Point `DATABASE_URL` at the **pooler on 6543**, not the direct connection.
Vercel runs many short-lived instances and a direct connection exhausts the
project's connection limit under any real traffic. Transaction-mode pooling
cannot use prepared statements, which is why the client sets
`prepare: false` — without it, queries begin failing intermittently only
once the pooler starts reusing backends, which is a miserable thing to
diagnose in production. Both settings are already in `src/lib/db/index.ts`.

## The cutover

Run from the repository root.

```bash
# 1. Freeze writes. Put the site in maintenance or accept a short read-only
#    window — the export is a snapshot, and anything written to Neon after it
#    will not travel.

# 2. Export from Neon (about 30 seconds).
DATABASE_URL="<neon-url>" npx tsx scripts/db-export.ts ./dump

# 3. Load into Supabase, using the DIRECT connection (port 5432). The pooler
#    is for the application; schema creation wants a real session.
TARGET_DATABASE_URL="<supabase-direct-url>" npx tsx scripts/db-import.ts ./dump

# 4. Prove the copy is faithful. This must print "No differences".
SOURCE_DATABASE_URL="<neon-url>" \
TARGET_DATABASE_URL="<supabase-direct-url>" \
  npx tsx scripts/db-compare.ts
```

Then set on Vercel (production, preview and development):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooler** string, port 6543 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |

Redeploy, then check: the site answers, a slug redirect under `/sali/` still
returns 308, signing in works, and an admin page that reads the database
renders.

## Rollback

Neon stays untouched and running throughout. If anything looks wrong, put
`DATABASE_URL` back to the Neon string and redeploy — that is the whole
rollback. Keep Neon alive for at least a week before deleting it.

## What the rehearsal caught

Worth knowing, because both would have corrupted data silently:

- **Timestamps shifted by three hours and lost their microseconds.** Reading
  rows through a driver that parses values turns a `timestamp` into a
  JavaScript `Date`; writing it back applies a timezone and truncates to
  milliseconds. A `date` column moved by a whole day. The export now reads
  every column as text and the import casts `$n::text::<type>`, so PostgreSQL
  parses its own output and nothing is interpreted on the way through.
- **`serial` columns need their sequence to exist first.** A column default of
  `nextval('…'::regclass)` is resolved when the table is created, so the
  sequences are emitted before the tables and their ownership attached after.

## Left to do afterwards

These 15 maintenance scripts still import the Neon driver directly and
will not run against Supabase until they are converted the way
`scripts/apply-sql-file.ts` was:

- `scripts/apply-migration.ts`
- `scripts/fix-slugs.mjs`
- `scripts/i18n/backfill-content-translations.ts`
- `scripts/import-artists.ts`
- `scripts/purge-catalog.ts`
- `scripts/seed-category-seo.ts`
- `scripts/seed-page-meta.ts`
- `scripts/seed-prices-and-slots.ts`
- `scripts/seed-slots-for-testing.ts`
- `scripts/seed-slots-full.ts`
- `scripts/seed.ts`
- `scripts/test-flows-abc.ts`
- `scripts/test-flows-de.ts`
- `scripts/test-flows.ts`
- `scripts/translate-artists.ts`

None of them run in production or in CI — they are seeding and one-off
diagnostic tools — so they do not block the cutover. Convert them the next
time one is needed.
