# ADR 0028 — Partner organizations → venues (locations) → halls

- Status: Accepted (phases 0–4 implemented on stacked draft PRs; rollout pending)
- Date: 2026-09-12
- Original scope of this ADR + phases 0–2: data model, an idempotent expand
  migration, a single membership-based authorization layer, and a server-side
  feature flag. Later sections record the phase 3–4 implementation status.
  **No production migration or rollout has been performed.**

This ADR is the durable record for the work described in
`INSTRUCTIUNI_CODEX_EPETRECERE_COMPANII_LOCALURI_SALI`. It captures the
canonical model, the inheritance rules, the migration mechanism decision, and
the authorization inventory the later phases must not regress.

## 1. Context — why the current model is insufficient

Today a `venues` row is simultaneously the legal partner, the location, and the
hall:

- `venues.user_id` is `UNIQUE`, so one user can own at most one venue.
- Capacity, price, facilities, working hours, images and menu hang directly off
  `venues`.
- `booking_requests` / legacy `bookings` carry only `venue_id`, never a hall.
- `calendar_events` only knows `artist | venue`; a single block takes the whole
  location offline.
- Ownership is checked ad hoc as `venues.user_id === users.id`, usually with
  `.limit(1)`, in **52 files** (see §6).

Simply adding a `venue_halls` table would leave authorization holes and dozens
of flows still resolving "the first venue".

## 2. Decision — canonical model and vocabulary

```
User account
  ↕ membership + role
Partner organization  (legal / billing holder: individual | sole_trader | company)
  ├── Venue (location / branch)
  │     ├── Hall A
  │     └── Hall B
  └── Venue 2
        ├── Hall C
        └── Hall D
```

Canonical code/DB names: `partner_organizations`, `partner_organization_members`,
`venues` (now "location"), `venue_halls`, `venue_hall_seating_options`,
`venue_hall_menu_sets` / `venue_menu_sets`, `venue_schedule_blocks`,
`venue_hall_conflict_groups` (+ members). UI may say "Companie / proprietar".

Non-negotiable rules (unchanged from the master document):

- The collaboration contract is accepted **once per legal holder**, per relevant
  legal-pack version — at the **organization**, never per hall.
- A user may administer several venues via organization membership.
- A venue has one or more halls; every venue booking must name a concrete hall
  (enforced only after the feature flag is on — a later phase).
- Price, interval, calendar, commercial terms and commission live on the
  booking and are reportable per hall.
- A hall that is new/unapproved never becomes public automatically.
- Historical data, contracts and commissions are never rewritten to fit the new
  model.

### Inheritance rules (explicit)

- `venue_halls.working_hours = NULL` → inherit the venue's working hours.
- `venue_halls.buffer_minutes = NULL` → inherit the venue's buffer.
- A hall uses the venue's default menu set unless it is assigned its own set(s).
- `venue_images.hall_id = NULL` → general/location image; non-null → hall image
  (and the API must verify the hall belongs to the same venue).
- `venue_schedule_blocks.hall_id = NULL` → blocks the whole venue; non-null →
  blocks that hall only.
- Money: new hall/booking money is `numeric(12,2)` + explicit `currency`. Legacy
  integer-EUR columns on `venues` are kept only for compatibility during the
  transition; new features must not write only to them.

## 3. Migration mechanism (verified)

Per `src/lib/db/migrations/README.md`: the Drizzle journal baseline stops at
`0005`; everything after (`0006` and all of `manual/*.sql`) is hand-written,
idempotent SQL applied via `scripts/apply-sql-file.ts` or `psql`, with
`src/lib/db/schema.ts` as the source of truth. `drizzle-kit generate` must not
be run (it would emit a huge catch-up diff against the 0005 snapshot).

Decision: the expand migration is a single idempotent file
`src/lib/db/migrations/manual/0028_partner_organizations_venues_halls.sql`, and
`schema.ts` is kept in sync. It is **not** duplicated into `supabase/migrations`.

Open item / risk: `supabase/migrations/` also holds three recent timestamped
files (wizard idempotency, seating shape, artist event types). The repository
alone cannot prove which mechanism reaches production. The migration is written
idempotently so it is safe under either pipeline; if staging confirms
`supabase/migrations` is the exclusive mechanism, copy the same SQL there under
a new timestamp and update the README (do not double-apply).

## 4. Feature flag

A server-only flag gates every behavioural change of later phases. Default
**off** everywhere (including production) until rollout.

- Module: `src/lib/feature-flags.ts`.
- Flag: `MULTI_HALL` backed by env `FEATURE_MULTI_HALL` (`"1" | "true"` = on).
- The access layer's behavioural change **is switchable** (review item #11):
  `src/lib/venue-access.ts` reads `isMultiHallEnabled()`. With the flag **off**
  (default) the resolvers use the legacy `venues.user_id` owner chain only, i.e.
  exactly current production behaviour, and memberships are ignored. With the
  flag **on**, a venue that has an `organization_id` is membership-only and the
  legacy `user_id` fallback is *not* consulted (review item #1), so a disabled,
  removed or demoted member cannot recover owner access. Org-less venues still
  use the legacy owner as a fallback under either flag state.
- Phases 0–2 do not change public, onboarding, catalog or booking behaviour.

## 5. Backwards compatibility strategy (expand → migrate → contract)

- Expand only: all new tables/columns are additive and nullable; `venues.user_id`
  and its `UNIQUE` constraint are **kept** through phase 2.
- The authorization layer resolves `user → membership → organization → venue →
  hall`, and additionally falls back to the legacy `venues.user_id` chain so
  single-venue accounts created before the backfill keep working.
- `UNIQUE(venues.user_id)` is only dropped in a much later phase, after every
  read path uses membership + hall. Legacy columns are dropped later still.

## 6. Authorization inventory — the phase-2 checklist

Ownership currently flows through `venues.user_id` in **52 files / 73 sites**
(full line-level list captured during phase 0). These must move to the new
membership resolvers. Grouped by zone:

### Dashboard (vendor) — server pages/layouts

- `src/app/[locale]/(vendor)/dashboard/layout.tsx`
- `src/app/[locale]/(vendor)/dashboard/page.tsx`
- `src/app/[locale]/(vendor)/dashboard/analytics/page.tsx`
- `src/app/[locale]/(vendor)/dashboard/sala/layout.tsx`
- `.../sala/page.tsx`, `.../sala/rezervari/page.tsx`, `.../sala/calendar/page.tsx`,
  `.../sala/financiar/page.tsx`, `.../sala/analitice/page.tsx`,
  `.../sala/recenzii/page.tsx`, `.../sala/meniu/page.tsx`, `.../sala/setari/page.tsx`
- `src/app/[locale]/(client)/cabinet/layout.tsx` (partner detection)

### Venue APIs

- `src/app/api/me/venue/route.ts`, `src/app/api/me/venue/stats/route.ts`
- `src/app/api/venues/[id]/route.ts`
- `src/app/api/venue-images/route.ts`, `src/app/api/venue-images/[id]/route.ts`
- `src/app/api/venue-menu/route.ts`, `.../venue-menu/scan/route.ts`,
  `.../venue-menu/import/route.ts`, `.../venue-menu/translate/route.ts`
- `src/app/api/ai/venue-assistant/route.ts`, `.../ai/pricing-suggestions/route.ts`,
  `.../ai/analytics-suggestion/route.ts`

### Auth / onboarding

- `src/app/api/auth/register-venue/route.ts`, `.../auth/select-role/route.ts`,
  `.../auth/check-role/route.ts`, `.../auth/register-artist/route.ts`

### Booking / contracts / chat / reviews / commissions

- `src/app/api/booking-requests/route.ts`, `.../booking-requests/[id]/route.ts`,
  `.../booking-requests/[id]/contract/route.ts`,
  `.../booking-requests/[id]/contract-preview/route.ts`
- `src/app/api/conversations/route.ts`, `.../conversations/[id]/messages/route.ts`,
  `src/app/api/chat/route.ts`
- `src/app/api/reviews/[id]/route.ts`, `.../reviews/from-booking/route.ts`,
  `.../reviews/request/route.ts`
- `src/app/api/commissions/route.ts`
- `src/lib/booking/confirmation-effects.ts`

### Calendar / iCal / Inngest

- `src/app/api/calendar/route.ts`,
  `src/app/api/calendar/venue-ical/[venueId]/[token]/route.ts`
- `src/lib/inngest/functions.ts`

### Admin / legal / privacy / export / delete / planner

- `src/app/[locale]/(admin)/admin/contracte/page.tsx`
- `src/app/api/admin/registration-requests/route.ts`
- `src/app/api/legal/accept/route.ts`
- `src/lib/privacy/notification-view.ts`
- `src/app/api/me/data-export/route.ts`, `src/app/api/me/delete-account/route.ts`
- `src/lib/planner/ownership.ts`, `src/app/[locale]/(public)/planifica/page.tsx`

Phase 2 introduces `src/lib/venue-access.ts` and routes these gates through it.

### Migration status (kept honest — do not claim more than is true)

**Migrated to the central resolver** (`requireVenueAccess` / `requireHallAccess`
for IDOR-sensitive id-from-client gates; `listAccessibleVenueIds` /
`getPrimaryAccessibleVenueId` / `resolveSelectedVenue` for "my venue" reads;
`getVenueOwnerUserIds` for notification recipients):

- Dashboard: `dashboard/layout`, `dashboard/page`, `dashboard/analytics/page`,
  `dashboard/sala/{layout,page,rezervari,calendar,financiar,analitice,recenzii,meniu,setari}`,
  `cabinet/layout` (partner detection).
- Venue APIs: `me/venue`, `me/venue/stats`, `venues/[id]` (PUT),
  `venue-images` (POST/PUT/DELETE), `venue-images/[id]` (PUT/DELETE),
  `venue-menu` (route/scan/import/translate).
- Booking/contracts/chat/reviews/calendar/conversations: `booking-requests/[id]`
  (ownership gate), `booking-requests/[id]/contract`, `.../contract-preview`,
  `chat` (ownership + sender detection), `conversations` (list),
  `conversations/[id]/messages` (party detection), `reviews/[id]` (GET/PATCH),
  `calendar` (write ownership).
- Commissions: `commissions` (vendor scope now spans all accessible venues).
- AI: `ai/venue-assistant`, `ai/pricing-suggestions`, `ai/analytics-suggestion`.
- Notifications/privacy: `booking/confirmation-effects` (recipients),
  `privacy/notification-view` (participant detection).
- Client-blocking: `planner/ownership`, `planifica/page`.
- Detection: `auth/check-role` (hasVenue).

**Not yet migrated (documented, scheduled — NOT claimed as done):**

- Onboarding / role establishment (belongs to phase 3, which is out of scope
  now): `auth/register-venue`, `auth/register-artist`, `auth/select-role`, and
  `api/legal/accept` (still links acceptances via the legacy owner; wiring them
  to write `organization_id` is phase 3 onboarding).
- Admin views (phase 6): `admin/contracte`, `admin/registration-requests`
  (still map contracts by legacy owner; org-grouping is phase 6).
- Inngest Google-Calendar sync (`inngest/functions`): kept on the per-user
  legacy owner chain deliberately, so a co-managed org venue is not double-synced
  from multiple members' tokens (phase 6).
- Organization-wide GDPR export is phase 6. Personal export/deletion now avoids
  organization-owned customer data, exports membership metadata, and blocks a
  last owner until ownership is transferred.

An IDOR regression (`scripts/venue-multihall-access-regression.test.ts`) proves
organization A cannot reach organization B's venue/hall, that disabled/removed/
demoted members lose access, and that the flag switches the behaviour off.

## 6b. Correction Pass 3 (hardening) — status

- **Migration mechanism is singular and canonical:** one idempotent, self-healing
  file `src/lib/db/migrations/manual/0028_*.sql`, applied via
  `scripts/apply-sql-file.ts`; `schema.ts` is kept byte-aligned with it. It is
  **not** duplicated into `supabase/migrations`. `drizzle-kit generate` is not used.
- **Deletes are safe:** `venues.organization_id` is `ON DELETE RESTRICT` (an org
  cannot be deleted while it owns venues → archive instead; the link never nulls
  and never reactivates legacy access). `booking_requests.client_user_id` is
  `ON DELETE SET NULL` so deleting a client anonymizes and retains the booking
  and its commission (commissions never cascade; `booking_request_id` is
  RESTRICT). Hall schedule blocks use `ON DELETE RESTRICT` so a hall with blocks
  must be archived, never silently converted to a whole-venue block; historical
  bookings/commissions/reviews keep `SET NULL (hall_id)` + snapshots.
- **NULL-FK bypass closed:** `CHECK (hall_id IS NULL OR venue_id IS NOT NULL)` on
  booking_requests / venue_images / venue_schedule_blocks / commissions / reviews;
  association tables carry a `NOT NULL venue_id` after backfill.
- **`venues.timezone`** added (default `Europe/Chisinau`) and used to compute
  canonical booking intervals.
- **Intervals are half-open `[starts_at, ends_at)`**: full-day → next day 00:00;
  overnight (`end <= start`) → next day. Legacy calendar backfill covers both
  `blocked` and manual `booked` rows and never duplicates booking-derived
  projections (`booking_id IS NULL`).
- **Owner-less venues** create a persistent row in `partner_admin_review_cases`
  (not a `RAISE NOTICE`).
- **E2E test safety (P0):** the suite loads only `.env.test.local`, accepts only
  a loopback app server and loopback PostgreSQL, verifies a database-resident
  marker against `E2E_DB_MARKER`, starts its own Next server with
  `DATABASE_URL=E2E_DATABASE_URL`, and refuses to reuse an existing server.
  There is no production/staging escape hatch.

### Legacy `bookings` table strategy (CP3 #4)

The old `bookings` table (distinct from `booking_requests`) is still read by some
analytics queries. Strategy for phases 0–2: it is treated as **historical,
read-only** — no new writes, not extended with `hall_id`. All hall-level
reporting derives from `booking_requests.hall_id` (the canonical source going
forward). Migrating or dual-reading the legacy `bookings` rows for hall-aware
analytics is deferred to phase 6 (the analytics/reporting consumer phase); until
then analytics that read `bookings` remain venue-level, which matches their
current behaviour and does not regress.

## 6c. Correction Pass 4 (final phases 0–2 hardening)

- Access now requires both an active membership and an active organization.
  A central capability matrix defines profile/AI/financial/review actions as
  owner/admin, calendar/menu/booking actions as manager+, and private reads as
  staff+.
- All venue notifications resolve active owner/admin members. The transitional
  `venues.user_id` is ignored once a venue belongs to an organization.
- Personal DSR export and account erasure touch only organization-less legacy
  venues. A last organization owner receives
  `LAST_ORG_OWNER_TRANSFER_REQUIRED` before any storage/database mutation.
- Venue iCal URLs are membership-scoped and stop validating when membership is
  removed/deactivated or the organization is suspended. Calendar feeds no
  longer expose phone numbers, request messages, or private blackout notes.
- Destructive E2E is loopback-only, database-marker verified, Clerk-test-key
  verified, and starts its own Next server against the same database.
- Migration 0028 handles ambiguous legacy legal acceptances without deleting
  evidence, uses venue timezones, excludes booking-derived calendar projections
  by source, enables RLS on every new public-schema server table, and includes
  lock/statement timeouts.
- `drizzle-kit push/generate` package scripts were removed. Until migration
  history is consolidated, reviewed manual SQL is the sole DDL authority.

## 7. Phase 4 availability defects — implementation status

The phase 4 implementation replaces the divergent Venue checks with
`src/lib/booking/venue-availability.ts` and coordinated transactional writers.
It now checks bookings, schedule blocks and legacy/manual/Google projections;
uses deterministic advisory locks for booking, block and conflict-group
mutations; preserves sibling Hall events; projects and removes legacy calendar
rows by the exact booking ID; and returns all simultaneous calendar events.

Whole-Venue conflicts are symmetric even when a historical row references a
Hall that later became unusable. Canonical intervals are half-open and
timezone-aware. iCal all-day classification uses actual local-day boundaries,
including zones where a DST jump skips local midnight.

Artist availability still stores a civil `event_date` plus wall-clock times.
Overnight intervals are anchored to adjacent civil dates, but an ambiguous
wall-clock time during a DST fall-back cannot select the first versus second
occurrence. Persisting canonical instants (and an artist timezone) is a schema
backlog item; it must be completed before offering fold-time disambiguation.

## 8. Phase 3–4 implementation and rollout boundary

- Organization → Venue → Hall onboarding is resumable and request-id
  idempotent. The final submit remains actionable and returns structured
  missing-field feedback.
- Canonical `/dashboard/locatii/[venueId]` routes and Hall CRUD use the central
  membership/capability resolver; active Hall edits re-enter moderation without
  exposing draft values publicly.
- Venue bookings carry Hall/scope, canonical interval, currency and commercial
  snapshots. Confirmation/cancellation and their durable external effects are
  transactional and retry-safe.
- Manual whole-Venue/Hall blocks, conflict groups, aggregated calendar and iCal
  are Hall-aware. Inngest is the frequent durable-outbox runner; the Vercel
  Hobby-compatible cron is a daily fallback.
- Manual migrations `0029`–`0033` extend the expand model with Hall-aware
  calendar integrity, legal acceptance sessions, durable booking-effect outbox
  state, onboarding/publication hardening, and durable idempotent creation of a
  booking plus its one-to-one CRM offer projection. Migration `0033` also
  preserves offer history when an artist or Venue is deleted by detaching that
  target instead of cascading the offer.

The feature remains behind `FEATURE_MULTI_HALL`. PostgreSQL migration and
concurrency suites must still pass on a disposable guarded database through
`0033` before Preview/staging. Migration `0033` has not been applied to any
shared Preview, staging, or Production database by this correction branch, and
phase 5 public catalog, venue page and public booking are Hall-aware behind
`FEATURE_MULTI_HALL`. Flag OFF keeps the legacy public contract and does not
query Hall or organization tables. Flag ON publishes only active venues with an
active organization (when set) and at least one active Hall, lists one row per
venue after aggregation, and requires `hallId` on public booking writes.
Anonymous visitors never receive prices. This phase does not add migration
`0040` and does not change the booking write path beyond existing Hall
revalidation.

## 9. Phase 6A.3 — independent Hall approval (local implementation)

- The signed legal package remains scoped to the organization; adding a Venue
  or Hall does not create a new contract. Venue publication requires approval
  of at least one eligible pending Hall. A later pending Hall never removes an
  already published Venue or its active Halls from the catalog.
- Whole-Venue submission advances only eligible draft/rejected Halls. The Hall
  editor submits its own Hall ID; incomplete sibling Halls stay private and
  editable. New Halls require a name, slug, valid min/max capacity and at least
  one Hall-specific photo. The imported legacy-default Hall may inherit the
  Venue gallery.
- An organization-backed admin decision explicitly selects Hall IDs. The
  transaction rechecks pending scope and current content before touching only
  those rows. Unreviewed pending Halls remain in the queue. A selected-Hall
  rejection preserves an already-active Venue and records an editable reason
  on that Hall; resubmission clears the reason.
- Manual migration `0040_hall_review_reason.sql` mirrors the runtime schema,
  stays server-only with RLS and revoked browser-role access, and is not a
  Supabase timestamp migration. It has not been applied to a shared database,
  nor has the code been deployed or pushed. Source/type checks pass; the DB
  regression requires a post-`0040` disposable loopback database.
- A separate legal-entity approval state and full admin reasons/history for
  organization-level rejection remain future work. The current organization
  lifecycle status is still reconciled from active Venues/pending Halls and
  must not be described as an independent legal-review decision.
