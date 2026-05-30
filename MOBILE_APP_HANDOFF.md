# ePetrecere Mobile App — Handoff & State Document

> **Scop**: Document complet de stare pentru continuarea proiectului aplicației mobile într-un chat nou, fără pierdere de context. Ultima actualizare: după M7 + fix Vercel preview (commit `1465f18`).

---

## 0. TL;DR — unde suntem

- **Web**: Next.js 15 la rădăcina repo-ului `/Users/revencovladislav/Downloads/epetrecere-md/`, live pe `https://epetrecere.md` (Vercel), production stabilă.
- **Mobile**: React Native + Expo SDK 52 în `packages/mobile/`, **M0→M7 complet** (~20k linii, ~150 ecrane, ~55 endpoint-uri API v1). NU e încă buildat/publicat — următorul pas e `eas build`.
- **Shared**: `packages/shared/` — tipuri TS, validatori Zod, helpers, API client folosite de ambele.
- **Branch curent**: `main` (toate M0-M7 merged). Toate commit-urile pushed la `https://github.com/vladmdx/epetrecere-md`.
- **Următorul pas concret**: utilizatorul trimite credențiale (Faza 1 = Expo account name + Clerk publishable key + asseturi vizuale), apoi rulez `eas init` + `eas build`.

---

## 1. Arhitectura monorepo

```
/Users/revencovladislav/Downloads/epetrecere-md/
├── src/                          ← Next.js 15 web app (rădăcină)
│   ├── app/                      ← App Router (web + API)
│   │   ├── (client)/cabinet/     ← dashboard client web (redesignat)
│   │   ├── (vendor)/dashboard/   ← dashboard partener web (redesignat)
│   │   └── api/
│   │       ├── v1/               ← API versionat pentru mobile (alias-uri + endpoint-uri noi)
│   │       └── ... (rute web existente, neversiunate)
│   ├── lib/
│   │   ├── db/                   ← Drizzle ORM + Neon Postgres
│   │   │   ├── schema.ts         ← schema completă (artists, venues, bookingRequests, eventPlans, conversations, chatMessages, pushTokens, etc.)
│   │   │   └── queries/          ← artist-stats.ts, artist-dashboard.ts, venue-stats.ts
│   │   └── push/expo.ts          ← helper server-side Expo Push (M5)
│   └── middleware.ts             ← Clerk auth (NB: /dashboard + /admin returnează 404 pentru anonimi — comportament intenționat al auth.protect())
├── packages/
│   ├── shared/                   ← @epetrecere/shared
│   │   ├── src/types/index.ts    ← toate entitățile domeniu
│   │   ├── src/validators/index.ts ← scheme Zod
│   │   ├── src/utils/index.ts    ← formatMoneyEUR, formatDateRO, eventTypeLabel, relativeTimeRO, normalizeDiacritics, parseIsoDate, initials
│   │   └── src/api/index.ts      ← createApiClient() + API_PATHS (NB: editat de user/linter — păstrează cum e)
│   └── mobile/                   ← @epetrecere/mobile (Expo)
│       ├── app/                  ← expo-router rute
│       ├── components/           ← ui/ primitive + plan/ + ErrorBoundary
│       ├── lib/                  ← api, i18n, push, sentry, posthog, theme, voice-recorder, ai-stream, etc.
│       ├── constants/theme.ts    ← design tokens
│       ├── app.json              ← config Expo (bundle id md.epetrecere.app, permisiuni, deep links)
│       └── eas.json              ← profile build dev/preview/production
├── vercel.json                  ← installCommand (--workspaces=false) + ignoreCommand (skip mobile-only)
└── scripts/vercel-ignore.sh     ← skip build când doar packages/mobile|shared se schimbă
```

**Web NU importă din `@epetrecere/shared`** (verificat cu grep) — de aceea Vercel poate instala cu `--workspaces=false`.

---

## 2. Milestones complete (M0–M7)

### M0 — Monorepo + Expo skeleton
- npm workspaces (`packages/*`), `packages/shared` + `packages/mobile`
- Expo SDK 52, expo-router v4, NativeWind v4, Reanimated 3, Clerk Expo SDK, EAS config
- `app.json`: bundle id `md.epetrecere.app`, permisiuni camera/photo/location/notifications/microphone, universal links + app links pe `epetrecere.md`, ATT description
- `eas.json`: profile development/preview/production, env blocks
- `tsconfig.json` web exclude `packages/mobile`

### M1 — Fundație, auth, onboarding, push, i18n
- Design tokens `constants/theme.ts` (colors gold `#C9A84C`, bg `#0D0D0D`, typography Cormorant+Inter, spacing, motion, shadows)
- 8 primitive UI: Button, Card, Input (floating label), Badge (7 tones), Avatar, ProgressBar, StatTile, SafeScreen
- i18n: i18next + react-i18next, ro/ru/en complet, persistat SecureStore
- Auth: sign-in (email/parolă + Google OAuth), sign-up (2-step + verify cod), forgot-password
- Onboarding: welcome carousel (4 slides), permissions, role-picker
- Push infra: tabel `push_tokens` (schema.ts), `POST/DELETE /api/v1/push-tokens`, `lib/push.ts` registration + tap deep-link

### M2 — Client discovery
- Bottom tabs client: Acasă, Caută, Favorite, Cabinet, Cont
- Home (categorii + featured), artist list cu filtre, artist detail (galerie/recenzii/pachete), venue list + detail, map cu clustering (Google Maps), favorites
- API v1 alias-uri: artists, venues, categories, wishlist, me/role-preference

### M3 — Client cabinet
- Cabinet home (mirror web redesign: hero event + cover, next-step, 3 stat tiles, services strip, recent messages, Buget/Moments card)
- Event plan detail `plan/[id]` (countdown live, progress bars, tabs)
- ChecklistTab (tap-toggle optimistic), GuestsTab (RSVP cycle + add modal)
- My bookings list + detail (status timeline, price offers, confirm)
- Chat list + thread (inverted FlatList, optimistic send, polling 8s)
- Photo Moments (grid + lightbox + camera + QR scanner)
- Booking-new modal (date/time pickers native, Zod validat)
- API v1: event-plans + sub-rute (checklist/[itemId], guests/[guestId])

### M4 — Partener nativ
- Partner bottom tabs: Acasă, Rezervări, Calendar, Mesaje, Profil
- Dashboard partener (hero + profile completion, 4 stat tiles cu deltas, next event, recent requests, shortcuts)
- Bookings inbox (3 tabs Active/Acceptate/Trecute, lead-score Hot/Warm/Cold, inline actions)
- Action modals: accept (+preț), reject (+motiv), propose-price
- Booking detail partener (contacte revealed post-accept)
- Calendar (month grid, day cells colorate după status)
- Tarife CRUD (packages add/edit/delete)
- Profile editor (5 secțiuni: General/Contact/Pricing/Tarife/Notifications)
- Financiar, Recenzii (cu histogramă stele), AI Assistant
- API v1 NOI: `me/artist/dashboard` (endpoint nou, fan-out paralel), me/artist/stats, artists/crud, artist-packages + [id], reviews, ai/chat

### M5 — Cross-cutting
- **Push triggers** wired: `src/lib/push/expo.ts` (sendPushToUser / sendPushToUsers) chemat din:
  - `booking-requests` POST → partener primește push
  - `booking-requests/[id]` PUT → client primește push (accept/reject/propose)
  - `conversations/[id]/messages` POST → celălalt party primește push
- **Offline cache**: PersistQueryClientProvider + AsyncStorage persister (key `epetrecere.rq-cache.v1`, 24h gcTime, buster pe app version, chat threads excluse)
- **Sentry**: `lib/sentry.ts`, init sincron înainte de Clerk, user tagging
- **PostHog**: `lib/posthog.tsx`, screen tracking, user identify
- **Focus sync**: `lib/use-app-focus-sync.tsx`, AppState "active" → invalidează 13 query keys "live"
- **Upload**: `/api/v1/upload` alias, Photo Moments two-step upload (multipart → /upload, apoi JSON URL → photos)

### M6 — AI Assistant streaming
- **Streaming chat**: `POST /api/v1/ai/chat/stream` (SSE, token deltas), `lib/ai-stream.ts` (async generator wrapping react-native-sse), AI Assistant rescris cu bubble token-by-token + markdown render (react-native-markdown-display) + stop button
- **Voice input**: `POST /api/v1/ai/transcribe` (OpenAI Whisper-1, language=ro, rate-limit 60/h), `lib/voice-recorder.ts` (hold-to-record, LOW_QUALITY 22kHz, auto-stop 60s)
- **Smart suggestions**: `GET /api/v1/ai/suggestions?context=partner|client` (curated Romanian prompts pe baza state: pending bookings, profile completion, upcoming events)
- app.json: NSMicrophoneUsageDescription + RECORD_AUDIO

### M7 — Polish
- **Theme provider** `lib/theme.tsx`: light/dark/auto, persistat SecureStore, nativewind colorScheme.set()
- **Error boundary** `components/ErrorBoundary.tsx`: catch + Sentry report + recoverable "Reia" screen, wraps root
- **Skeletons** `components/ui/Skeleton.tsx`: Skeleton + StatTileSkeleton/ListRowSkeleton/CardSkeleton, pulse pe UI thread
- **A11y**: Avatar role=image, ProgressBar role=progressbar + accessibilityValue, ErrorBoundary role=alert
- **Tablet**: `lib/use-device-size.ts` (compact/medium/expanded, isTablet, columns 1/2/3, Material 3 breakpoints)

---

## 3. Bug-uri rezolvate (gotchas importante)

1. **Vercel OOM la build**: workspaces mobile umflau node_modules → webpack epuiza heap-ul. Fix: `vercel.json` → `installCommand: "npm install --workspaces=false --legacy-peer-deps"`.
2. **Rollup binaries lipsă**: `--omit=optional` rupea `@rollup/rollup-linux-x64-gnu`. Fix: scos `--omit=optional`.
3. **`/dashboard` 404 pentru anonimi**: NU e bug — `auth.protect()` din Clerk returnează 404 (security). `/admin` la fel. `/cabinet` folosește redirectToSignIn → 307.
4. **Preview deploy failed pe branch-uri mobile**: Preview env Vercel n-are `DATABASE_URL`. Fix: `vercel.json` → `ignoreCommand: "sh scripts/vercel-ignore.sh"` (skip build când doar packages/mobile|shared se schimbă). Production neafectată.
5. **tanstack persister package name**: corect e `@tanstack/query-async-storage-persister` (fără "react-").
6. **lucide icons în RN**: folosește `lucide-react-native`, NU `@expo/vector-icons/Feather` (import named eșuează). Tip `LucideIcon`.
7. **expo-camera v16**: a scos `requestCameraPermissionsAsync` static — folosește `useCameraPermissions` hook sau import dinamic.
8. **react-native-sse**: tipează cu generic `new EventSource<"token"|"done"|"error">(...)`.
9. **DB migration `push_tokens`**: NU s-a aplicat încă pe prod (drizzle-kit push cerea confirmare interactivă pentru un constraint nelegat `users_referral_code_unique`). Trebuie rulat manual: `set -a; source .env.production.local; set +a; npx drizzle-kit push` și confirmat. **PENDING** — push notifications nu vor scrie tokens până nu se aplică.

---

## 4. Git — branch-uri & commits

Toate merged în `main`, pushed:
- M0: `225aa69` (branch `mobile-app/m0-monorepo-setup`)
- M1: `mobile-app/m1-foundation`
- M2: `mobile-app/m2-client-discovery`
- M3: `mobile-app/m3-client-cabinet`
- M4: `mobile-app/m4-partner-app`
- M5: `mobile-app/m5-cross-cutting`
- M6: `mobile-app/m6-ai-streaming`
- M7: `mobile-app/m7-polish` → `733e7f4`
- Vercel fix: `1465f18` (direct pe main)

Convenție commit: branch per milestone, `--no-ff` merge în main, push. Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## 5. Comenzi utile

```bash
cd /Users/revencovladislav/Downloads/epetrecere-md

# Verificare TS
npx tsc --noEmit                                   # web
npx tsc --noEmit -p packages/mobile/tsconfig.json  # mobile

# Web build local (necesită memorie)
npx next build

# Vercel
npx vercel ls epetrecere-md --prod                 # listă deploy production
npx vercel inspect <url> --logs                    # log-uri deploy

# DB (env din .env.production.local)
set -a; source .env.production.local; set +a; npx drizzle-kit push

# Install (local dev — full workspaces)
npm install
# Install ca Vercel (doar root)
npm install --workspaces=false --legacy-peer-deps

# Mobile (după eas init + .env)
cd packages/mobile
npx eas login
npx eas init
npx eas build --profile development --platform all
```

**NB**: după ce ai rulat install Vercel-style (`--workspaces=false`), mobile TS check va eșua (lipsesc deps mobile). Rulează `npm install` (full) ca să restaurezi.

---

## 6. CREDENȚIALE NECESARE pentru `eas build` (ce aștept de la user)

### 🟢 FAZA 1 — minim ca să pornesc primul build
- [ ] **Expo account name** (handle de pe expo.dev, ex: `epetrecere` sau `vladmdx`)
- [ ] **Clerk publishable key** (`pk_test_...` sau `pk_live_...`) din dashboard.clerk.com → API Keys
  - User trebuie să adauge în Clerk: Native applications cu bundle `md.epetrecere.app`, OAuth redirects `epetrecere://oauth-callback` + `epetrecere://sso-callback`
- [ ] **Asseturi vizuale** (PNG sau SVG vector):
  - `assets/icon.png` 1024×1024 (logo pe `#0D0D0D`, fără transparență/colțuri rotunjite)
  - `assets/adaptive-icon.png` 1080×1080 (foreground transparent)
  - `assets/splash.png` 1284×2778 (logo centrat pe `#0D0D0D`)
  - Alternativ: logo SVG/PNG ≥2048px și le generez eu

### 🟡 FAZA 2 — pentru build instalabil pe device
**iOS:**
- [ ] **Apple Team ID** (10 caractere, din developer.apple.com → Membership)
- [ ] **Apple ID email**
- [ ] User creează App ID `md.epetrecere.app` cu capabilities: Push Notifications, Associated Domains, Sign in with Apple
- [ ] (opțional) acces App Store Connect ca Developer SAU app-specific password

**Android:**
- [ ] **google-play-service-account.json** (Play Console → API access → service account JSON, rol Release manager) → salvez la `packages/mobile/google-play-service-account.json` (gitignored)
- [ ] User creează app în Play Console cu package `md.epetrecere.app`
- [ ] **google-services.json** (Firebase project cu package `md.epetrecere.app` → Add Android app)

**Maps:**
- [ ] **Google Maps API key** (Cloud Console → Maps SDK iOS + Android activate)

### 🔵 FAZA 3 — analytics/errors (opțional la primul build)
- [ ] **Sentry DSN** (sentry.io → React Native project)
- [ ] **PostHog Project API Key** (`phc_...`, același cont ca webul)
- [ ] **OpenAI API key** (`sk-...`, pentru Whisper voice — fără el `/api/v1/ai/transcribe` dă 503)

### Env vars pentru EAS (le setez cu `eas secret:create` sau în eas.json):
```
EXPO_PUBLIC_API_URL=https://epetrecere.md/api/v1
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
EXPO_PUBLIC_SENTRY_DSN=https://...
EXPO_PUBLIC_POSTHOG_KEY=phc_...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

### Env vars pe Vercel (web, pentru M6 voice):
```
OPENAI_API_KEY=sk-...          # PENDING — necesar pentru /api/v1/ai/transcribe
# ANTHROPIC_API_KEY deja există (pentru ai/chat + ai/chat/stream)
```

---

## 7. Ce rulez imediat ce am Faza 1 (fără input suplimentar)

1. `cd packages/mobile && npx eas init` → primesc `projectId`, îl pun în `app.json` (`extra.eas.projectId` + `updates.url` + `owner`)
2. Creez `packages/mobile/.env` cu Clerk key (gitignored)
3. Generez/plasez asseturile în `packages/mobile/assets/`
4. `eas build --profile development --platform all` → 2 build-uri paralele (~10-15min)
5. User primește URL .apk (Android instalabil direct) + .ipa (iOS necesită Faza 2.1)

**Cu Faza 1**: Android build instalabil. **Cu Faza 1+2**: ambele platforme + push funcțional.

---

## 8. Placeholder-uri în config ce trebuie completate (caută `TBD-fill`)

În `packages/mobile/app.json`:
- `extra.eas.projectId` = "TBD-fill-after-eas-init"
- `updates.url` = "https://u.expo.dev/TBD-fill-after-eas-init"
- `owner` = "TBD-fill-with-expo-org-handle"

În `packages/mobile/eas.json`:
- `submit.production.ios.appleId` = "TBD-fill-with-apple-developer-email"
- `submit.production.ios.ascAppId` = "TBD-fill-with-app-store-connect-app-id"
- `submit.production.ios.appleTeamId` = "TBD-fill-with-apple-developer-team-id"

---

## 9. Deep linking (după ce am Apple Team ID + Android SHA-256)
Trebuie servite de pe `epetrecere.md` (le committez în repo web când am datele):
- `https://epetrecere.md/.well-known/apple-app-site-association`
- `https://epetrecere.md/.well-known/assetlinks.json`

---

## 10. Milestone-uri rămase (după build real)

- **M8 — Store submission**: screenshots (iOS 3 mărimi + Android phone/tablet + feature graphic 1024×500), marketing copy ro/ru/en (app name, subtitle, description 4000ch, keywords), Privacy Policy URL (`/confidentialitate`), age rating questionnaire, TestFlight + Internal Testing, submit production.
- Categorii: iOS Lifestyle/Productivity, Google Play Lifestyle/Events. Age rating ~4+/3+.

---

## 11. Stack mobile (referință rapidă)

| Layer | Choice |
|---|---|
| Framework | Expo SDK 52 (managed, EAS Build, OTA) |
| Routing | expo-router v4 (file-based, typed) |
| Styling | NativeWind v4 (Tailwind v3 syntax pe mobile) |
| State | Zustand + TanStack Query (persisted) |
| Auth | @clerk/clerk-expo (SecureStore tokens) |
| Maps | react-native-maps + Google provider |
| Animations | Reanimated 3 + Gesture Handler 2 |
| Camera | expo-camera + expo-image-picker |
| Audio | expo-av (voice recording) |
| Notifications | expo-notifications + Expo Push |
| Crash | @sentry/react-native |
| Analytics | posthog-react-native |
| i18n | i18next + react-i18next |
| Markdown | react-native-markdown-display |
| SSE | react-native-sse |
| Icons | lucide-react-native |

Bundle id (ambele platforme): **`md.epetrecere.app`**
Scheme deep link: **`epetrecere://`**
Minimă OS: iOS 16+ / Android 9+ (recomandat)
