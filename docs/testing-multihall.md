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

| Command | Required starting snapshot |
| --- | --- |
| `npm run test:multihall:migration` | through `0027`, before `0028` |
| `npm run test:multihall:migration0029` | through `0028`, before `0029` |
| `npm run test:multihall:migration0030` | through `0029`, before `0030` |
| `npm run test:booking-outbox:migration` | through `0030`, before `0031` |
| `npm run test:multihall:migration0032` | post-`0028`, with `0032` absent; the verifier rebuilds its exact pre-`0032` shape |

Migration `0032` also verifies the legacy-gallery repair, organization/Venue/
Hall idempotency keys, personal Venue uniqueness, RLS, and removal of all
`anon`/`authenticated` table, column, and sequence privileges from `venues`
and `venue_images`.

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
npm run test:booking-outbox:policy
npm run test:legal-pack
```

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
