# Database migrations — current state & how to apply

> Read this before running any `drizzle-kit` command. The migration history
> here is **not** fully tracked by Drizzle, and running the wrong command can
> produce a desynchronized snapshot.

## The layout

| Location                                | Tracked by Drizzle journal?   | How it's applied                   |
| --------------------------------------- | ----------------------------- | ---------------------------------- |
| `0000_*.sql` … `0005_*.sql`             | ✅ yes (`meta/_journal.json`) | `drizzle-kit migrate` / historical |
| `0006_add_booking_completed_status.sql` | ❌ no (orphan in root)        | applied manually                   |
| `manual/0007_*.sql` … current           | ❌ no                         | hand-written, applied manually     |

`meta/_journal.json` stops at **0005**. Everything after it (the root `0006`
and the whole `manual/` set) was written and applied by hand, outside
Drizzle's tracking. Until the history is consolidated, the ordered, reviewed
`manual/*.sql` files are the DDL source of truth. `src/lib/db/schema.ts` is the
runtime/type mirror, but cannot represent every PostgreSQL detail (including
column-specific composite-FK delete actions).

## ⚠️ Do NOT run `drizzle-kit generate` blindly

Because the journal baseline is 0005, `drizzle-kit generate` would diff the
current `schema.ts` against the **0005** snapshot and emit one enormous
"catch-up" migration that redefines everything added in 0006–0015. Don't
commit that. If you need generated migrations again, first reconcile the
baseline (see "Future consolidation").

## Applying schema changes

Do **not** run `drizzle-kit push` or `drizzle-kit generate` against any shared
database. Both package scripts were removed because the incomplete journal can
silently generate or apply destructive drift.

Apply a reviewed `manual/*.sql` file explicitly:

```bash
DATABASE_URL=… npx tsx scripts/apply-sql-file.ts \
  src/lib/db/migrations/manual/<file>.sql
# or, if you have psql:
psql "$DATABASE_URL" -f src/lib/db/migrations/manual/<file>.sql
```

New manual migrations must be transactional, idempotent and verified on a
disposable baseline database before staging. A re-run must converge without
changing historical evidence or financial totals.

## Pending rollout: `0033_booking_request_creation_idempotency.sql`

Migration `0033` adds the durable booking-create idempotency identity and the
one-to-one `booking_requests` → `offer_requests` projection link. It also
changes the legacy offer-to-artist/Venue foreign keys from cascade deletion to
`ON DELETE SET NULL`, enables RLS on both request tables, and removes effective
browser-role table, column, and sequence access.

The migration revokes only direct grants from `PUBLIC`, `anon`, and
`authenticated`. If access remains through a parent, owner, superuser, or broad
predefined role, it aborts with `42501`; it never changes a parent role's ACL,
because that role may serve unrelated members.

It has **not** been applied to any shared Preview, staging, or Production
database by this branch. Verify it only on a fresh disposable loopback restore
through `0032`:

```bash
npm run test:booking-create:migration0033
npm run test:booking-create:idempotency
```

Both commands use `scripts/run-guarded-db-test.ts`; do not replace the guarded
runner with a direct invocation. The migration verifier requires the real
post-`0031` + post-`0032` / pre-`0033` catalog, applies `0033` twice, and leaves
that disposable database ready for the regression command.

## Pending rollout: `0034_notifications_calendar_security.sql`

Migration `0034` treats `notifications` and `calendar_events` as private,
server-managed tables. It enables RLS while preserving trusted owner access,
and removes table, column,
and sequence privileges from `PUBLIC`, `anon`, `authenticated`, and every
transitive parent role from which either browser role can inherit access.
Unlike `0033`, this migration intentionally removes target-object ACLs from
those parent roles; it does not change role membership or unrelated ACLs.

It has **not** been applied to any shared Preview, staging, or Production
database by this branch. First run the source-only test, then verify only on a
fresh disposable loopback database after `0033`:

```bash
npm run test:notifications:migration0034-source
npm run test:notifications:migration0034
```

The guarded verifier requires the exact post-`0033` / pre-`0034` catalog,
creates a two-level inherited-role fixture, applies `0034`, introduces RLS and
ACL drift, and reapplies it to prove convergence. The guarded runner validates
the loopback URL and database-resident `E2E_DB_MARKER` before importing the
verifier, so missing guard configuration causes a safe refusal without a
database connection.

## Pending rollout: `0035_account_erasure_identity_outbox.sql`

Migration `0035` creates the durable, server-only Clerk identity-deletion
outbox and permanent keyed identity tombstone. It has no sequence. The table
uses owner-bypass RLS with no policies and removes every effective table and
column privilege held by `PUBLIC`, `anon`, `authenticated`, or a transitive
parent of either browser role. Reapplying it repairs only its named CHECKs and
indexes, policy/RLS state, defaults, and target-object ACLs; incompatible
columns, extra constraints/indexes, and foreign same-name index objects fail
closed.

The runtime prerequisite is a dedicated, stable
`ACCOUNT_ERASURE_IDENTITY_SECRET` of at least 32 bytes. Configure the exact
same value for every web, cron, and worker process. There is no fallback, and
an unplanned rotation is forbidden: changing the HMAC key makes existing
tombstones unable to recognize a late Clerk webhook. Any future rotation needs
an explicit multi-key/migration plan before the old value is removed.

Apply and verify the pending migrations strictly in this order:
`0034_notifications_calendar_security.sql` →
`0035_account_erasure_identity_outbox.sql` →
`0036_ai_booking_proposals.sql` →
`0037_account_asset_erasure_outbox.sql` →
`0038_referral_event_atomicity.sql` →
`0039_legal_contract_delivery_privacy.sql`.

This branch has not applied `0035` to any shared Preview, staging, or
Production database. Run the source test first, then use only a fresh guarded
loopback restore after `0034` and before `0035`:

```bash
npm run test:account-erasure-identity:migration0035-source
npm run test:account-erasure-identity:migration0035
```

The verifier requires the exact post-`0034` / pre-`0035` catalog, applies
`0035`, creates a two-level inherited browser-role fixture, injects
policy/RLS/CHECK/index and direct/inherited table and column ACL drift, and
reapplies it. It compares the complete catalog shape and proves role membership
did not change. Unlogged/inherited relation drift, dropped-column metadata,
extra-column, extra-constraint, extra-index, and foreign same-name-index probes
must fail closed. The guarded runner checks the loopback URL and
database-resident marker before importing the verifier.

## Pending rollout: `0036_ai_booking_proposals.sql`

Migration `0036` creates the short-lived, server-only authorization records
used by AI booking proposals. A record binds a one-time random-token digest to
the exact user, plan, artist, category, and canonical booking payload. The
table lives in the exposed `public` schema, but has no RLS policies and grants
no effective table, column, or sequence privilege to `anon`, `authenticated`,
or any role they inherit. RLS is enabled with `NO FORCE` deliberately: the
trusted postgres.js runtime connects as the table owner and needs owner-bypass.

The migration refuses a lookalike table with extra/missing columns, incorrect
defaults, primary key, serial ownership, or foreign keys. It transactionally
repairs only safe drift: its named CHECK/indexes, policies, owner-compatible
RLS state, and target-object ACLs.

It has **not** been applied to any shared Preview, staging, or Production
database by this branch. Run the source test first, then use only a fresh
guarded loopback restore after `0035` and before `0036`:

```bash
npm run test:ai-booking-proposal:migration0036-source
npm run test:ai-booking-proposal:migration0036
```

The verifier requires the exact post-`0035` / pre-`0036` catalog, applies the
migration, injects policy/RLS/index/CHECK and direct/inherited ACL drift, then
applies it a second time and compares the complete hardened shape. It also
proves that an unexpected extra column is rejected. The guarded runner checks
the loopback URL and database-resident marker before importing any DB code.

## Pending rollout: `0037_account_asset_erasure_outbox.sql`

Migration `0037` makes Vercel Blob account cleanup provenance-based. A URL in
an application row, even one inside an ePetrecere store, is never deletion
authority. New server uploads first create an `account_blob_assets` receipt;
triggers then maintain `account_blob_asset_claims` for every supported live
reference. Account deletion can enqueue only an active `account_erasure`
receipt owned by that user and having no claim that survives the account.
Copied/shared references therefore retain the object. Legacy URLs without a
receipt are deliberately not deleted automatically.

The durable `account_asset_erasure_outbox` uses skip-locked leases and a lease
token fence. Provider failures keep the exact payload and retry indefinitely
with exponential backoff capped at 24 hours; no terminal dead-letter state can
hide an undeleted object. Successful delivery clears the URL from both queue
and registry. A deferred, globally fenced orphan path covers the race where a
shared asset loses its owner during account deletion and its last surviving
claim disappears later. Reattachment after the registry becomes `queued` is
rejected. Ordinary source-row writes with no registered Blob use a fast path
and never take the global asset advisory lock.

Vercel Blob and PostgreSQL cannot participate in one distributed transaction.
The upload helper therefore validates the exact SDK receipt, records it before
returning the URL, and on registry failure compensates only that exact object
with the matching token/store. An unconfirmed or mismatched receipt is never
treated as deletion authority.

Only `legal_contract_pending` is eligible for TTL reconciliation when an
upload process dies after storing its receipt but before linking the booking.
The sweep is bounded, requires at least 24 hours of age and zero claims, and
uses the same advisory/row fence. `public_upload:*` (including generic form
uploads) and every other provenance are excluded because an unlinked URL may
still be held in a legitimate form.
Contract PDFs are private and are served only by the authenticated dynamic
endpoint. Existing legacy/public contract URLs are not fetched or erased by
this migration and need a separate, evidence-backed reconciliation plan.

The three tables use owner-compatible RLS with zero policies. `PUBLIC`,
`anon`, `authenticated`, and every transitive parent of either browser role
have zero effective table, column, sequence, and helper-function privileges.
The migration validates exact permanent-table columns/defaults, PK/UNIQUE/FK/
CHECK shapes, serial ownership, btree indexes, trigger coverage, function
security/search paths, RLS/policies, and ACLs. Extra columns, constraints,
indexes, function overloads, protected triggers, and foreign same-name index
objects fail closed.

This branch has not applied `0037` to any shared Preview, staging, or
Production database. Run the pure source tests first, then use only a fresh
guarded loopback restore after `0036` and before `0037`:

```bash
npm run test:account-asset-erasure:migration0037-source
npm run test:account-asset-erasure:migration0037
```

The DB verifier refuses a missing, partial, or already-applied baseline. It
applies `0037`, captures the complete protected catalog, proves a non-Blob row
does not take the advisory lock, and exercises registered, legacy, shared,
last-claim, account-delete, orphan, and reattachment races with real concurrent
transactions. It then creates a two-level inherited browser-role fixture,
injects safe CHECK/index/function/trigger/RLS/policy/ACL drift, reapplies the
migration, and requires exact catalog convergence without membership changes.
Separate destructive lookalike probes must be rejected. The guarded runner
checks both the loopback host and database-resident marker before the verifier
is imported; absence of a marked local database is a required safe refusal,
not a reason to use Preview.

Rollout order is strict: configure the public Blob token plus the dedicated
private Moments/legal token(s), apply and verify `0037`, then deploy the web,
cron, and worker runtime that writes registry receipts. Monitor failed leases,
full-batch backlog, and pending reconciliation. Do not deploy registry-aware
uploads before the migration and do not backfill legacy URLs as “owned” from
URL shape alone.

## Pending rollout: `0038_referral_event_atomicity.sql`

Migration `0038` makes the referral ledger both atomic and private. It creates
the exact unique btree arbiter used by the live
`(referrer_user_id, referred_user_id, event_type)` conflict target. Existing
duplicate live milestones abort the transaction for explicit reconciliation;
the migration never inserts/deletes evidence or changes parties, event type,
credit, or timestamps. Its sole evidence-row `UPDATE` minimizes arbitrary
legacy JSON to `{}` or the allowlisted non-identifying
`onboarding_reconciler` recovery marker.

For account erasure, both user references become nullable and both foreign
keys use `ON DELETE SET NULL`. Deleting the referee therefore retains the
milestone and the referrer's credited balance; deleting the referrer retains
the ledger row with its event type, amount, minimized metadata, and timestamp. The
ordinary unique index continues to deduplicate live rows, whose two user IDs
are non-null, while minimized historical rows use PostgreSQL's normal distinct
NULL semantics.

Referral capture is serialized by one stable transaction-scoped graph lock
before deterministic user locks and row locks. In the same transaction, a
bounded recursive CTE follows `referred_by_code` from the proposed referrer;
it rejects a path back to the target user, an already-corrupt cycle, or an
abnormally deep chain before the immutable edge is written.

The ledger is server-only. `0038` enables owner-compatible RLS with no
policies, then removes effective table, column, and
`referral_events_id_seq` privileges from `PUBLIC`, `anon`, `authenticated`,
and their transitive parent roles. It does not depend technically on `0037` or
inspect any `0037` object; its only baseline is the exact canonical
`referral_events` schema before the milestone index.

This branch has not applied `0038` to any shared Preview, staging, or
Production database. Run the source test first, then use only a fresh guarded
loopback database with the canonical pre-`0038` referral ledger:

```bash
npm run test:referral:migration0038-source
npm run test:referral:migration0038
```

The verifier first proves duplicate evidence fails closed without changing
row counts or credit totals. It applies `0038`, validates both nullable
`SET NULL` foreign keys and the exact arbiter, exercises deletion of each test
user, injects index/RLS/policy/table/column/sequence ACL drift through a
two-level role hierarchy, and reapplies the migration. The complete catalog,
role memberships, unrelated `users` security, and financial totals must
remain stable. It also exercises sequential and concurrent two-user cycles and
a three-user cycle through the runtime capture helper, and proves that extra
column/constraint/index lookalikes fail closed. The guarded runner verifies the
loopback URL and database marker before importing the verifier.

## Pending rollout: `0039_legal_contract_delivery_privacy.sql`

Migration `0039` binds every retryable signed-contract delivery to a live
application user and a minimal signer/admin role snapshot. The worker
revalidates both the recipient and the session signer immediately before a
provider send. Delivered rows clear the address; account erasure cancels and
minimizes the erased account's own rows plus every still-sendable signer/admin
copy belonging to a session that account signed.

The migration accepts only the exact canonical `0030` delivery table or its
fully hardened `0039` shape. It fails closed on incompatible/extra columns,
unknown constraints or indexes, a foreign same-name index object, a wrong
serial dependency, and non-canonical fixed evidence/FK/index shapes. Reapply
repairs only the four migration-owned constraints, the pending/recipient
indexes, policy/RLS state, and target-object ACLs. A database CHECK requires
every non-cancelled retryable row to retain both its live user binding and
address, while cancelled/delivered states are minimized.

The queue remains server-only with owner-compatible, policy-free RLS. `0039`
removes table, column, and sequence privileges from `PUBLIC`, `anon`,
`authenticated`, and every transitive parent of a browser role without
changing role membership.

This branch has not applied `0039` to any shared Preview, staging, or
Production database. Run the source test first, then verify only on a fresh
guarded loopback restore with the canonical pre-`0039` legal delivery queue:

```bash
npm run test:legal-delivery:migration0039-source
npm run test:legal-delivery:migration0039
```

The guarded verifier checks the database marker before opening its connection,
applies `0039`, injects migration-owned constraint/index and
RLS/policy/direct+inherited ACL drift, then reapplies and compares the complete
hardened catalog. It also proves incompatible column, extra constraint/index,
and foreign same-name-index probes are rejected transactionally.

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

Until then, only reviewed `manual/*.sql` migrations are the real workflow.
