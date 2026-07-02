# Database migrations — current state & how to apply

> Read this before running any `drizzle-kit` command. The migration history
> here is **not** fully tracked by Drizzle, and running the wrong command can
> produce a desynchronized snapshot.

## The layout

| Location | Tracked by Drizzle journal? | How it's applied |
|---|---|---|
| `0000_*.sql` … `0005_*.sql` | ✅ yes (`meta/_journal.json`) | `drizzle-kit migrate` / historical |
| `0006_add_booking_completed_status.sql` | ❌ no (orphan in root) | applied manually |
| `manual/0007_*.sql` … `manual/0015_*.sql` | ❌ no | hand-written, applied manually |

`meta/_journal.json` stops at **0005**. Everything after it (the root `0006`
and the whole `manual/` set) was written and applied by hand, outside
Drizzle's tracking. In practice the schema is kept in sync with prod via
`drizzle-kit push`, and `src/lib/db/schema.ts` is the source of truth.

## ⚠️ Do NOT run `drizzle-kit generate` blindly

Because the journal baseline is 0005, `drizzle-kit generate` would diff the
current `schema.ts` against the **0005** snapshot and emit one enormous
"catch-up" migration that redefines everything added in 0006–0015. Don't
commit that. If you need generated migrations again, first reconcile the
baseline (see "Future consolidation").

## Applying schema changes

### Preferred for day-to-day: `drizzle-kit push`
```bash
npx drizzle-kit push   # (npm run db:push)
```
Syncs `schema.ts` straight to the DB. **Caveat:** it prompts interactively
about the `users.referral_code` unique constraint, so it can't run
non-interactively / in CI.

### Non-interactive (CI, prod, or when push stalls): apply a `manual/*.sql`
```bash
DATABASE_URL=… npx tsx scripts/apply-sql-file.ts \
  src/lib/db/migrations/manual/<file>.sql
# or, if you have psql:
psql "$DATABASE_URL" -f src/lib/db/migrations/manual/<file>.sql
```
All `manual/*.sql` files are written idempotently (`IF NOT EXISTS` / guarded
`DO` blocks), so re-running them is a no-op.

## 🔴 Pending on prod: `push_tokens`

The mobile app's push tokens table (`push_tokens`) exists in `schema.ts` but
has **no applied migration on prod** — `drizzle-kit push` stalled on the
interactive prompt, so it was never created. Until it's applied, the mobile
app can't persist Expo push tokens and push notifications won't reach devices.

Apply it (non-interactive):
```bash
DATABASE_URL=<prod> npx tsx scripts/apply-sql-file.ts \
  src/lib/db/migrations/manual/0015_push_tokens.sql
```

## Future consolidation (optional, do deliberately)

To get back to a clean, Drizzle-tracked history:
1. Confirm exactly what's applied on prod (inspect the live schema).
2. Wipe `migrations/` + `meta/`, then `drizzle-kit generate` a single fresh
   `0000` baseline from the current `schema.ts`.
3. Mark that baseline as already-applied on every existing DB (so Drizzle
   doesn't try to replay it) via the `__drizzle_migrations` bookkeeping table.
4. Delete `scripts/apply-migration.ts` (superseded; also references a table
   that no longer exists) and keep `scripts/apply-sql-file.ts` for one-offs.

Until then, treat `push` + `manual/*.sql` as the real workflow.
