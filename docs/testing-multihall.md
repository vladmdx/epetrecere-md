# Multi-hall test environment

The multi-hall suites are destructive. They are intentionally local-only and
will not run against staging or production.

## Required local environment

1. Start a disposable PostgreSQL instance on loopback (`localhost`,
   `127.0.0.1` or `::1`). Never tunnel a shared database to this port.
2. Restore the required schema/seed into that database.
3. Create `.env.test.local` (ignored by Git):

```dotenv
E2E_BASE_URL=http://127.0.0.1:3000
E2E_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/epetrecere_e2e
E2E_DB_MARKER=replace-with-a-unique-random-value-at-least-16-characters
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
CLERK_SECRET_KEY=sk_test_REPLACE
```

4. Initialize the database-resident marker only after confirming the database
   is disposable:

```bash
E2E_CONFIRM_CREATE_GUARD=CREATE_DISPOSABLE_E2E_GUARD npm run test:db:init-guard
```

The app server is started automatically by Playwright with
`DATABASE_URL=E2E_DATABASE_URL`, `FEATURE_MULTI_HALL=1`, Clerk test keys, and
`reuseExistingServer=false`. A server already listening on port 3000 makes the
suite fail rather than risking a split database run.

## Commands

Against a post-0028 disposable database:

```bash
npm run test:multihall:access
npm run test:multihall:schema
npm run test:e2e -- e2e/api/venue-multihall-auth.spec.ts
```

Migration verification has a separate requirement: restore a genuine
pre-0028 baseline (through migration 0027) into a fresh disposable local DB,
initialize its marker, then run:

```bash
npm run test:multihall:migration
```

The verifier refuses a database where `partner_organizations` or
`venues.organization_id` already exists. It applies 0028 twice and checks
idempotence, orphan counts, legal-evidence checksums, commission totals, and
overnight/full-day interval conversion.
