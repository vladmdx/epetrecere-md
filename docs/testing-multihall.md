# Multi-hall test environment

The multi-hall database suites are destructive and local-only. They must never
run against Preview, staging, Production, a tunnel, or a shared database.

## Disposable local database

1. Start PostgreSQL directly on a loopback host (`localhost`, `127.0.0.1`, or
   `::1`). A tunnel to a remote database is not a local database.
2. Restore the schema baseline required by the suite.
3. Create the ignored `.env.test.local` file:

```dotenv
E2E_BASE_URL=http://127.0.0.1:3000
E2E_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/epetrecere_e2e
E2E_DB_MARKER=replace-with-a-unique-random-value-at-least-16-characters
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
CLERK_SECRET_KEY=sk_test_REPLACE
```

4. Inspect the URL and database yourself, then initialize the database-resident
   guard marker:

```bash
E2E_CONFIRM_CREATE_GUARD=CREATE_DISPOSABLE_E2E_GUARD npm run test:db:init-guard
```

Every guarded runner validates the loopback host, database name, marker value,
and marker table again. Missing configuration is a successful safety outcome:
the suite must refuse to start before importing application code.

## Migration verifier baselines

Use a fresh disposable restore for every verifier. The verifier mutates its
baseline, applies the migration twice, and checks idempotence.

The pending rollout and verification order is
`0034_notifications_calendar_security.sql` →
`0035_account_erasure_identity_outbox.sql` →
`0036_ai_booking_proposals.sql` →
`0037_account_asset_erasure_outbox.sql` →
`0038_referral_event_atomicity.sql` →
`0039_legal_contract_delivery_privacy.sql`. Migration `0038` does not depend
technically on `0037`; its guarded baseline is only the exact canonical
pre-index referral ledger. Migration `0039` has its own exact canonical
pre-`0039` legal-delivery baseline. None of these changes has been applied by
this branch to a shared Preview, staging, or Production database.

Before any runtime using `0035` starts, configure a dedicated, stable
`ACCOUNT_ERASURE_IDENTITY_SECRET` of at least 32 bytes identically in web,
cron, and worker processes. There is no fallback, and unplanned rotation is
forbidden because existing HMAC tombstones would stop matching late provider
events. A future rotation requires a deliberate multi-key/migration plan.

| Command                                               | Required starting snapshot                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:multihall:migration`                    | through `0027`, before `0028`                                                                                                                                                   |
| `npm run test:multihall:migration0029`                | through `0028`, before `0029`                                                                                                                                                   |
| `npm run test:multihall:migration0030`                | through `0029`, before `0030`                                                                                                                                                   |
| `npm run test:booking-outbox:migration`               | through `0030`, before `0031`                                                                                                                                                   |
| `npm run test:multihall:migration0032`                | post-`0028`, with `0032` absent; the verifier rebuilds its exact pre-`0032` shape                                                                                               |
| `npm run test:booking-create:migration0033`           | real post-`0031` + post-`0032`, before `0033`; the verifier refuses older, partial, or already-`0033` schemas                                                                   |
| `npm run test:notifications:migration0034`            | exact post-`0033`, before `0034`; verifies owner-bypass RLS and zero effective Data API privileges on notifications/calendar events                                             |
| `npm run test:account-erasure-identity:migration0035` | exact post-`0034`, before `0035`; verifies the sequence-free identity tombstone queue, exact catalog convergence, unchanged memberships, and zero effective Data API privileges |
| `npm run test:ai-booking-proposal:migration0036`      | exact post-`0035`, before `0036`; verifies the payload-bound proposal table, owner-bypass RLS, zero policies, and zero effective Data API privileges                            |
| `npm run test:account-asset-erasure:migration0037`    | exact post-`0036`, before `0037`; verifies registry/claims/outbox catalog convergence, inherited ACL removal, fast-path locking, and real claim/orphan/delete races          |
| `npm run test:referral:migration0038`                 | exact canonical pre-`0038` referral ledger; proves evidence-safe uniqueness, nullable `ON DELETE SET NULL` identities, cycle safety, and zero effective Data API privileges     |
| `npm run test:legal-delivery:migration0039`           | exact canonical pre-`0039` legal-delivery queue; proves live recipient binding, terminal PII minimization, catalog convergence, and zero effective Data API privileges          |

Migration `0032` also verifies the legacy-gallery repair, organization/Venue/
Hall idempotency keys, personal Venue uniqueness, RLS, and removal of all
`anon`/`authenticated` table, column, and sequence privileges from `venues`
and `venue_images`.

Migration `0033` verifies exact nullable/no-default/non-generated column
shapes, the all-or-none CHECK, both partial unique indexes, all three relevant
foreign keys, RLS, and zero effective table/column/sequence privileges through
direct and `PUBLIC` grants. Its inherited-parent fixture must make `0033`
reject without changing the parent's ACL or membership; after the fixture is
removed, the valid apply proves zero effective browser-role access. It then
applies the migration twice and exercises CHECK/uniqueness/cascade plus
artist/Venue deletion preserving linked offers with detached target IDs.

`0033` has not been applied to any shared Preview, staging, or Production
database by this branch. On a fresh guarded loopback restore through `0032`,
run the verifier first; it leaves that disposable database on `0033`, ready for
the transactional regression:

```bash
npm run test:booking-create:migration0033
npm run test:booking-create:idempotency
npm run test:notifications:migration0034-source
npm run test:notifications:migration0034
npm run test:account-erasure-identity:migration0035-source
npm run test:account-erasure-identity:migration0035
npm run test:ai-booking-proposal:migration0036-source
npm run test:ai-booking-proposal:migration0036
npm run test:account-asset-erasure:migration0037-source
npm run test:account-asset-erasure:migration0037
npm run test:referral:migration0038-source
npm run test:referral:migration0038
npm run test:legal-delivery:migration0039-source
npm run test:legal-delivery:migration0039
```

The `0035` verifier must start from a fresh disposable database after `0034`.
It applies `0035`, creates a two-level inherited browser-role fixture, injects
policy/RLS/CHECK/index plus table/column ACL drift, and reapplies the migration
to prove complete catalog convergence without changing role membership.
Unlogged/inherited relation drift, dropped-column metadata, and extra column,
constraint, index, and foreign same-name-index lookalikes must fail closed.
`0035` intentionally owns no sequence.

The `0036` verifier must start from a fresh disposable database after `0035`;
it refuses an already-applied or partial proposal schema. It applies `0036`,
adds a two-level inherited browser-role fixture, injects safe
policy/RLS/CHECK/index and ACL drift, reapplies the migration, and proves exact
catalog convergence without modifying role membership. A final extra-column
lookalike check must fail closed. Neither `0036` command is permitted to target
Preview, staging, Production, a tunnel, or any unmarked database.

The `0037` verifier must start from a fresh disposable database after `0036`
and before `0037`; it also refuses a database where `0038` is already present.
The source command needs no PostgreSQL. The DB command first passes through the
loopback URL and database-resident marker guard, then applies `0037`, captures
the complete tables/columns/defaults/PK/FK/CHECK/index/sequence/function/
trigger/RLS/policy/ACL catalog, and runs actual concurrent transactions. It
proves that ordinary non-Blob writes take no global advisory lock; copied
assets survive owner deletion; the final surviving claim queues exactly once;
claim deletion waits behind account deletion; and a claim cannot reattach once
an orphan is queued. Two inherited browser-role levels and repairable catalog
drift must converge exactly on reapply without membership changes. Extra
columns, constraints, indexes, function overloads, protected triggers,
sequence drift, and foreign same-name indexes must fail closed.

No `0037` command may target Preview, staging, Production, a tunnel, or an
unmarked database. If no guarded local PostgreSQL snapshot exists, the DB
verifier must refuse; do not substitute a shared database. Apply `0037` before
deploying registry-aware upload/runtime code. Configure the public and private
Blob tokens first, monitor retry/backlog signals, and do not infer ownership
for historical URLs. Only stale, zero-claim `legal_contract_pending` receipts
are reconciled after at least 24 hours; `public_upload:*` and every other
non-allowlisted provenance are never TTL-deleted.

The `0038` verifier starts only from the exact canonical referral ledger before
the milestone index and does not depend technically on `0037`. Duplicate live
milestones fail closed without deleting or adjusting evidence. The verifier
then proves the exact unique btree arbiter; nullable `ON DELETE SET NULL`
identity links; preserved event/balance data after either account is erased;
source-bounded minimization of arbitrary legacy metadata to `{}` or the sole
non-identifying `onboarding_reconciler` marker;
owner-compatible RLS with zero policies; and zero effective table, column, and
sequence access for `PUBLIC`, Supabase browser roles, and two inherited parent
levels. It also exercises sequential and concurrent two-user cycle attempts
plus a three-user cycle attempt through the same global-lock and recursive-CTE
runtime path. Its fixtures and both migration applications must leave credit
totals unchanged. `0038` has not been applied to any shared Preview, staging,
or Production database by this branch.

The `0039` verifier starts only from the exact canonical pre-`0039` legal
delivery queue. It applies the migration twice, proves that pending recipients
remain bound to a live user while delivered/cancelled/dead-letter rows contain
no address or user identifier, and verifies policy-free RLS plus removal of
direct and inherited browser-role privileges. It fails closed on incompatible
columns, constraints, indexes, serial ownership, and same-name lookalikes.
Run it only through the guarded command on a fresh disposable loopback
database; absence of that database must stop before any connection.

## Pure source and recovery tests

These do not need PostgreSQL and should run first:

```bash
npm run typecheck
npm run test:auth:phone-source
npm run test:multihall:onboarding-create-request
npm run test:multihall:venue-create-request
npm run test:multihall:organization-flow
npm run test:multihall:hall-crud-source
npm run test:multihall:image-locking-source
npm run test:multihall:registration-locking-source
npm run test:multihall:availability-scope-source
npx tsx --test scripts/venue-schedule-block-ical.test.ts
npm run test:wishlist:visibility
npm run test:booking-outbox:policy
npm run test:legal-pack
```

The Vercel project currently uses the Hobby-compatible daily schedule for the
booking-confirmation outbox fallback. Inngest remains the primary five-minute
runner; changing the Vercel expression to a sub-daily interval makes Vercel
reject the deployment before the build starts.

## Post-migration database regressions

Restore a disposable database through `0032`, initialize its guard marker, and
run:

```bash
npm run test:multihall:access
npm run test:multihall:schema
npm run test:multihall:phase3
npm run test:multihall:phase4
npm run test:multihall:flag
npm run test:multihall:approval
npm run test:multihall:onboarding-idempotency
npm run test:multihall:organization-idempotency
npm run test:multihall:complex-security
npm run test:multihall:hall-crud
npm run test:multihall:image-reorder
npm run test:multihall:legal-session
npm run test:multihall:pass2
```

The complex-security suite includes cross-tenant ownership, membership races,
legacy OFF→ON recovery, Hall moderation, organization lifecycle, and concurrent
artist/Venue registration decisions. The Hall and image suites verify that
children, compatibility fields, ordering, and authorization commit atomically.

## Browser API test

After the guarded database is ready, run:

```bash
npm run test:e2e -- e2e/api/venue-multihall-auth.spec.ts
```

Playwright starts its own localhost server with `DATABASE_URL` copied from
`E2E_DATABASE_URL`, `FEATURE_MULTI_HALL=1`, and `reuseExistingServer=false`.
It refuses a server already listening on port 3000 so the browser and test
process cannot accidentally address different databases.
