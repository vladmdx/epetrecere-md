# ADR 0028 — Partner organizations → venues (locations) → halls

- Status: Accepted (implementation in progress — phases 0–2)
- Date: 2026-09-12
- Scope of this ADR + phases 0–2: data model, an idempotent expand migration,
  a single membership-based authorization layer, and a server-side feature
  flag. **No public/UI change, no booking change, no production migration.**

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
- Notification-recipient *email* resolution that still reads the legacy owner
  (not an authorization gate; single-owner-safe today): the vendor-email lookups
  in `booking-requests/[id]`, `chat`, `conversations/[id]/messages`,
  `reviews/from-booking`, `reviews/request`, and `booking-requests/route`
  recipient/creation paths.
- Admin views (phase 6): `admin/contracte`, `admin/registration-requests`
  (still map contracts by legacy owner; org-grouping is phase 6).
- Inngest Google-Calendar sync (`inngest/functions`): kept on the per-user
  legacy owner chain deliberately, so a co-managed org venue is not double-synced
  from multiple members' tokens (phase 6).
- GDPR `me/data-export` and `me/delete-account`: intentionally scoped to venues
  the user *personally* owns (`venues.user_id`), not org venues co-managed with
  others; org-wide export/last-owner-transfer is phase 6.

An IDOR regression (`scripts/venue-multihall-access-regression.test.ts`) proves
organization A cannot reach organization B's venue/hall, that disabled/removed/
demoted members lose access, and that the flag switches the behaviour off.

## 7. Known availability defects to fix in phase 4 (recorded, not fixed here)

Documented so phase 4 addresses them: `checkVenueAvailability()` ignores manual/
Google blocks that search honours; `bulkSetCalendarEvents()` deletes sibling
events; the calendar UI collapses to one event/day; cancellation deletes by
entity+date+source instead of by booking; confirmation does not set
`calendar_events.booking_id`; create/confirm is check-then-write without a
transaction. Out of scope for phases 0–2.
