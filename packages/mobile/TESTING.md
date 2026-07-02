# Mobile — testing & pre-publish checklist

Client + partner (artist) flows are **code-complete** (no stubs/placeholders
left) and pass `npm run mobile:typecheck`. What remains is **runtime testing
on a device/simulator** and **external config** — neither of which can be done
from code. This is the checklist for both.

## 1. Run it

```bash
cd packages/mobile
npx expo start            # then press i (iOS sim) / a (Android emulator)
# or a real device via Expo Go / a dev build:
# eas build --profile development --platform ios
```

Requires `packages/mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://epetrecere.md/api/v1   # or a local tunnel to :3000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
EXPO_PUBLIC_SENTRY_DSN=…            # optional
EXPO_PUBLIC_POSTHOG_KEY=…           # optional
```

## 2. External config that MUST be live before full testing

These are dashboard/account tasks (not code) — the app has the wiring, but the
providers must be configured:

- **Clerk → Social connections**: enable **Google** and **Apple** in the Clerk
  dashboard (with the respective OAuth credentials). Redirect scheme is already
  `epetrecere://oauth-callback`.
- **Apple sign-in (iOS)**: add `"usesAppleSignIn": true` to `app.json` under
  `ios` (kept out of code because app.json has unrelated staged changes), and
  register Sign in with Apple for `md.epetrecere.app` in the Apple Developer
  portal. The button is already there (iOS-only).
- **Push (Expo)**: run the `push_tokens` migration on prod
  (`scripts/apply-sql-file.ts` — see the DB README) or tokens won't persist.
  Push requires a **dev/EAS build on a real device** (the simulator can't
  receive push). EAS project is already initialised.
- **Backend**: point `EXPO_PUBLIC_API_URL` at a backend where the v1 API is
  deployed (prod, or a tunnel to local `next dev`).

## 3. Client flow — screen checklist

- [ ] **Sign in** — email+password, **Google**, **Apple** (iOS). New OAuth user → role picker.
- [ ] **Onboarding** — welcome → role-picker (pick Client) → lands on client tabs.
- [ ] **Home** (`index`) — categories load; tap a category → search filtered; featured artists.
- [ ] **Search** — text search; **Filtre** chip opens category picker; tap category filters; infinite scroll; pull-to-refresh; artist row → detail.
- [ ] **Artist detail** (`artist/[slug]`) — loads by slug (was 400 before the fix); packages, reviews; “Trimite cerere”.
- [ ] **Venue detail** (`venue/[slug]`) — loads by slug.
- [ ] **Booking new** — type, date, time, guests, message → submit → booking detail.
- [ ] **Cabinet** — empty state → **“Începe să planifici”** → **create-plan** screen; with a plan → hero card, next-step, stat tiles, services strip.
- [ ] **Create plan** (`plan/new`) — title/type/date/guests/budget/venue → creates → opens plan; cabinet refreshes.
- [ ] **Plan detail** (`plan/[id]`) — overview countdown/progress; checklist; guests; **Rezervări tab** (real list now); Photo Moments.
- [ ] **Bookings** list + detail; **Chat** list + thread (send message).
- [ ] **Favorites** (wishlist), **Map**, **Moments**, **Account** (language, sign out).

## 4. Partner (artist) flow — screen checklist

- [ ] **Onboarding** — pick Artist → lands on partner tabs (empty-state CTA to complete profile).
- [ ] **Dashboard** (`index`) — stats, quick actions.
- [ ] **Bookings** tab — list by status; open booking → accept / reject / propose-price.
- [ ] **Calendar** — month grid; booking dots; **tap a free day → Blochează ziua** (red tint + lock); **Deblochează**; days with bookings can't be blocked.
- [ ] **Messages** → chat thread.
- [ ] **Profile** — edit profile / tarife; **“Vezi profilul public”** opens `/artisti/<slug>` in-browser; recenzii; financiar; AI assistant; notifications; **sign out**.

## 5. Push notification test (needs a real device + dev/EAS build)

1. Sign in on the device → confirm a row appears in `push_tokens` (server DB).
2. Trigger a notification (e.g. as a client, send a booking request to this
   artist) → the artist device should get a push.
3. Tap it → deep-links to the right screen (booking → partner bookings,
   message → chat).

## 6. Pre-publish

- [ ] All of §2 configured and §3–§5 passing on both iOS + Android.
- [ ] `TEST_LOGIN_SECRET` + `OPENAI_API_KEY` set on Vercel; `push_tokens` migration applied.
- [ ] App Store: Sign in with Apple working; privacy usage strings present (they are, in `app.json`).
- [ ] `eas build --profile production` → `eas submit` (iOS `appleId/ascAppId/appleTeamId` still TBD in eas.json).
