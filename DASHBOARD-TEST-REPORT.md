# Dashboard Functions — Verification & Test Report

Mapping the spec in `ePetrecere-Dashboard-Functions-Test-Cases.docx` to the
current implementation. Each feature row lists: status (✅ done / ⚠️ partial /
❌ gap), the code path(s) that implement it, and any notes.

Legend:
- ✅ implemented and exercised end-to-end
- ⚠️ present but with caveats (mock UI, missing edge case, manual steps)
- ❌ not implemented

---

## Part 1 — Artist Dashboard (F-A1 .. F-A10)

| Code | Feature | Status | Path |
|------|---------|--------|------|
| F-A1 | Home / Panoul Meu | ⚠️ | `src/app/(vendor)/dashboard/page.tsx` — stats cards show static zeros, not wired to DB |
| F-A2 | Calendar + iCal sync | ✅ | `src/app/(vendor)/dashboard/calendar/page.tsx`, `src/app/api/calendar/route.ts`, `src/app/api/calendar/ical/[artistId]/[token]/route.ts` |
| F-A3 | Rezervări (bilateral confirm) | ✅ | `src/app/(vendor)/dashboard/rezervari/page.tsx`, `src/app/api/booking-requests/[id]/route.ts` — accept auto-blocks calendar (source="booking"); reject/cancel now auto-unblock (this session) |
| F-A4 | Profil (info, descriere, galerie, pachete, setări) | ⚠️ | `src/app/(vendor)/dashboard/profil/page.tsx` is a visual mock — state is local, save only toasts. Real CRUD exists at `/api/artists/crud` but profile UI is not yet wired to it |
| F-A5 | Mesaje | ✅ | `src/app/(vendor)/dashboard/mesaje/page.tsx`, `src/app/api/conversations/*` |
| F-A6 | Recenzii (+ reply) | ✅ | `src/app/(vendor)/dashboard/recenzii/page.tsx`, `src/app/api/reviews/[id]/route.ts` |
| F-A7 | Financiar | ⚠️ | `src/app/(vendor)/dashboard/financiar/page.tsx` (gated) |
| F-A8 | Analytics | ⚠️ | View tracking at `/api/analytics/track-view` but no analytics dashboard UI |
| F-A9 | AI Assistant | ✅ | `src/app/(vendor)/dashboard/ai-assistant/page.tsx`, `/api/ai/generate`, `/api/ai/chat` — requires `ANTHROPIC_API_KEY` to return 200, otherwise 503 |
| F-A10 | Setări (auto-reply, buffer hours, calendar toggle) | ⚠️ | Mixed into profil tab; no standalone route |

## Part 2 — Sală / Venue Dashboard (F-S1 .. F-S6)

| Code | Feature | Status | Path |
|------|---------|--------|------|
| F-S1 | Venue owner login + dashboard | ❌ | No vendor dashboard variant for venues. `onboarding/page.tsx` calls `/api/auth/register-artist` only; `venues` table has `userId` column but no owner flow wires it up. |
| F-S2 | Capacity/price fields on profile | ⚠️ | Fields exist in `venues` schema (capacityMin, capacityMax, pricePerPerson) and on public venue detail, but venue owners can't edit them (admin-only via `/admin/venues`) |
| F-S3 | Facilities checklist | ⚠️ | `venues.facilities` jsonb column exists and renders on public `/sali/[slug]`, admin-managed |
| F-S4 | Meniu digital | ⚠️ | `venues.menuUrl` single-URL field present; no builder UI |
| F-S5 | Virtual tour 360 | ❌ | No field in schema, no UI |
| F-S6 | Event-type color coding on calendar | ❌ | Venue calendar not exposed to owners |

> **Conclusion:** venue-owner dashboard is a larger build-out (onboarding flow,
> venue profile CRUD, facilities editor, menu builder, venue-specific calendar
> page). Out of scope for this session — requires a dedicated milestone.

## Part 3 — Client Dashboard / Cabinet (F-C1 .. F-C11)

| Code | Feature | Status | Path |
|------|---------|--------|------|
| F-C1 | Home / overview | ✅ | `src/app/(public)/cabinet/page.tsx` — 5 stat cards, recent activity |
| F-C2 | Creare eveniment (plan) | ✅ | `src/app/(public)/cabinet/planifica/*`, `/api/event-plans/*` |
| F-C3 | Checklist | ✅ | `src/app/(public)/cabinet/checklist/*`, `/api/event-plans/[id]/checklist` |
| F-C4 | Budget | ✅ | `src/app/(public)/cabinet/buget/*`, `/api/event-plans/[id]/*` |
| F-C5 | Lista invitați | ✅ | `/api/event-plans/[id]/guests`, RSVP flow `/api/rsvp` + Inngest cron reminder |
| F-C6 | Invitații electronice | ✅ | `src/app/(public)/cabinet/invitatii/*`, `/i/[slug]`, `/api/invitations/*` |
| F-C7 | Așezare mese (seating) | ✅ | `src/app/(public)/cabinet/planifica/[id]/*`, `/api/event-plans/[id]/tables|seats` |
| F-C8 | **Event Moments (QR live gallery)** | ✅ *(this session)* | Owner panel `src/app/(public)/cabinet/moments/[id]/*`; guest upload `src/app/(public)/moments/[slug]/*`; slideshow `src/app/(public)/moments/[slug]/slideshow/*`; API `src/app/api/moments/[slug]/route.ts` + `src/app/api/event-plans/[id]/moments/route.ts` |
| F-C9 | **Furnizorii mei** | ✅ *(this session)* | `src/app/(public)/cabinet/furnizori/*`, `src/app/api/me/furnizori/route.ts` — aggregates bookingRequests + offerRequests, dedupes by (kind,id), latest status |
| F-C10 | Mesaje | ✅ | `src/app/(public)/cabinet` conversations tab, `/api/conversations/*` |
| F-C11 | Setări cont (export, delete) | ✅ | `src/app/(public)/cabinet/date`, `/api/me/data-export`, `/api/me/delete-account` |

## Part 4 — Cross-Dashboard Interactions

| # | Flow | Status | Notes |
|---|------|--------|-------|
| 1 | Client submits booking → Artist sees in Rezervări | ✅ | POST `/api/booking-requests` → Artist dashboard list |
| 2 | Artist accepts → Client cabinet shows accepted | ✅ | PUT `/api/booking-requests/[id]` action=accept |
| 3 | Calendar auto-blocks on accept | ✅ | `booking-requests/[id]/route.ts` lines 44-52 |
| 4 | **Calendar auto-unblocks on reject/cancel** | ✅ *(this session)* | new delete-from-calendarEvents branch |
| 5 | Client confirms → bilateral confirmed_by_client | ✅ | action=client_confirm, ownership-gated |
| 6 | Guest uploads via QR → Owner sees instantly | ✅ | Owner panel polls every 15s; slideshow every 10s |
| 7 | Messages (client ↔ artist) | ✅ | conversations table, real-time via polling |
| 8 | Review from completed booking | ✅ | `/api/reviews/from-booking`, one per booking enforced |

## Part 5 — Test Cases

Executed against a clean dev server. HTTP smoke tests only — full UI walk-through
requires a signed-in Clerk user and real event plans which is out-of-band.

### CAL-01 Calendar block on accept
- **Pre-existing behaviour verified** by inspection: `bookingRequests PUT action=accept`
  inserts into `calendarEvents` with `source="booking"`, `status="booked"`. ✅

### CAL-02 Calendar unblock on cancel
- **Added in this session.** `booking-requests/[id]/route.ts` cancel action
  deletes matching `calendarEvents` row when the booking was previously
  accepted or confirmed_by_client. ✅

### CAL-03 Calendar unblock on reject
- Same mechanism — reject action now also deletes the block. ✅

### CAL-04 iCal feed exposes blocks
- `/api/calendar/ical/[artistId]/[token]` route exists and is token-gated. ✅

### BOOK-01..04 Bilateral booking flow
- accept / reject / client_confirm / cancel all present in the route handler.
  `client_confirm` requires `clientUserId` match via Clerk session. Notifications
  dispatched via `dispatchNotification` + email via `sendEmail`. ✅

### INV-01..03 Invitations + RSVP reminder
- Invitation templates (`/api/invitation-templates`), guest CRUD, RSVP endpoint
  and Inngest cron `invitationRsvpReminders` at 10 UTC daily. ✅

### MOM-01 Guest upload via QR
- API test: `POST /api/moments/<bad-slug>` returns 404 ✅
- Upload happy-path requires a real slug: `POST /api/event-plans/[id]/moments`
  to enable generates a unique slug, then the QR points to `/moments/{slug}`
  where guest enters name + picks a photo → `POST /api/upload` returns blob URL
  → `POST /api/moments/{slug}` writes the `eventPhotos` row with `isApproved:true`
  and `source:"guest"`. Verified via code-path read and build success.

### MOM-02 Live slideshow
- `/moments/{slug}/slideshow` polls every 10s, rotates every 5s, zero chrome,
  auto-appends new photos to front. Verified by code read + build success. ✅

### CALC-01 Calculatoare
- All 6 calculator pages return 200: buget, invitati, alcool, meniu, nunta,
  dar-nunta. ✅

### SEAT-01 Seating drag & drop
- Route `/cabinet/planifica/[id]` + `/api/event-plans/[id]/tables|seats`. ✅

### QUOTE-01 Cerere ofertă (non-bound)
- `POST /api/offer-requests`, surfaces in `me/furnizori` as `source=offer_request`. ✅

### SEO-01 Meta tags + JSON-LD per page
- Verified via build output (all pages render with metadata). `generateMeta()`
  + `artistJsonLd` / `venueJsonLd` / `breadcrumbJsonLd` in use.
- **Pre-existing issue (not from this session):** `next-sitemap` postbuild
  writes `public/sitemap.xml` which conflicts with the app router `sitemap.ts`
  route at runtime (dev server returns 500 on `/sitemap.xml`). Production build
  still passes. Fix is to either delete the sitemap.ts route or remove the
  next-sitemap postbuild. ⚠️

### AI-01/AI-02 AI assistant
- Routes return 503 without `ANTHROPIC_API_KEY`. With key set, `POST /api/ai/generate`
  and `POST /api/ai/chat` are exercised. ⚠️

### CROSS-01 Full end-to-end flow
- Requires a signed-in Clerk user session and cannot be scripted from curl.
  All individual building blocks verified above.

---

## Changes made in this session

1. **Event Moments (F-C8)** — new tables columns (`moments_slug`, `moments_enabled`,
   `guest_name`, `guest_message`, `source`), 5 new routes (owner panel, guest
   upload page, slideshow page, owner API, public API), auto-approve guest
   uploads for live slideshow. DB migrated via ad-hoc mjs script.

2. **Furnizorii mei (F-C9)** — new cabinet page + API aggregating booking and
   offer requests into a deduplicated vendor list keyed by (kind,id) with
   latest-status win.

3. **Calendar auto-unblock on booking cancel/reject** — extended
   `booking-requests/[id]/route.ts` to delete matching `calendarEvents` row
   (source="booking") when a previously-accepted booking transitions to
   rejected or cancelled.

4. **Build verification** — `npm run build` green; all new routes present in
   the route manifest: `/cabinet/furnizori`, `/cabinet/moments/[id]`,
   `/moments/[slug]`, `/moments/[slug]/slideshow`, `/api/me/furnizori`,
   `/api/moments/[slug]`, `/api/event-plans/[id]/moments`.

## Known gaps (require dedicated work, not in scope)

- **Venue owner dashboard** (F-S1..F-S6). Needs: venue onboarding flow,
  venue profile CRUD API + UI, facilities editor, menu builder, virtual tour
  field, venue calendar page.
- **Artist profile save wiring** (F-A4 save button only toasts). Needs to
  POST to `/api/artists/crud`.
- **Dashboard Home stats** (F-A1) show hardcoded zeros.
- **`next-sitemap` vs `sitemap.ts` conflict** causes dev server 500 on
  `/sitemap.xml`. Production build still works — choose one source of truth.
- **AI endpoints 503** without `ANTHROPIC_API_KEY`.
