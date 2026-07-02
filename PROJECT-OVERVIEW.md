# ePetrecere.md — Prezentare generală a proiectului

> Document de onboarding pentru dezvoltatori și pentru Claude Code. Sintetizat exclusiv din hărțile subsistemelor furnizate. Unde ceva nu poate fi confirmat din hărți, este marcat explicit ca **necunoscut / de verificat**.
>
> Rădăcina proiectului: `/Users/revencovladislavicloud.com/Library/Mobile Documents/com~apple~CloudDocs/Documents/epetrecere-md`
>
> **Atenție:** acesta este un proiect DIFERIT de AstroFancy din memoria persistentă. Este marketplace-ul web+mobil de evenimente pentru Moldova, nu app-ul Expo AstroFancy.

---

## 1. Ce este proiectul

**ePetrecere.md** este un marketplace / planificator de evenimente pentru Republica Moldova (nunți, cumetrii, botezuri, aniversări, corporate). Pune în legătură clienții care organizează evenimente cu furnizorii de servicii (artiști/servicii și săli/venue), oferind în același timp unelte complete de planificare a evenimentului.

### Utilizatori (roluri)

- **Client** (organizatorul evenimentului) — descoperă și rezervă artiști/săli, negociază prețul, își planifică evenimentul integral: checklist, invitați + RSVP, așezare la mese, invitații digitale, galerie foto live cu QR ("Photo Moments"), mesagerie, recenzii, favorite, calculatoare.
- **Artist / furnizor de serviciu** — profil public, tarife/pachete pe durată, calendar/disponibilitate, cereri de rezervare cu negociere de preț, mesaje, recenzii, financiar estimativ, asistent AI.
- **Sală / venue** — similar artistului, plus meniu digital, tur virtual 360°, sincronizare Google Calendar, comision și toggle de plată. Rolul "venue" **NU** este o valoare de enum — apartenența de sală se detectează prin `venues.userId`.
- **Admin / super_admin** (+ editor) — backoffice: CRM/leads, aprobări, catalog, conținut/SEO, moderare, import, analitice, audit, setări globale.

### Model de business

- Furnizorii au un profil pe platformă; există o pagină de **pachete hardcodată** (Basic gratuit / Pro 49€ / Premium 129€).
- Există infrastructură pentru un **lead engine cu monetizare pay-per-lead** (`lead_matches`, `vendor_credits`, `credit_transactions`), dar în UI-ul de dashboard modelul este **doar pe jumătate implementat**: se afișează "contacte gratuite" iar API-ul de credite / unlock (402) coexistă neutilizat.
- Sistem de **referral** cu credite (onboarding 5€, prima rezervare 20€).
- **Plăți (Stripe) nu sunt implementate** — sunt doar pregătite în model (`referralCreditCents`, `paidStatus`, `agreedPrice`), menționate ca "future".

---

## 2. Arhitectura & stack-ul

**Monorepo npm workspaces** (`workspaces: ["packages/*"]`), cu trei părți:

| Parte | Locație | Tehnologie |
|---|---|---|
| **Web** (sursa de adevăr a logicii) | rădăcina proiectului (`src/`) | Next.js 15 App Router, React 19, Turbopack |
| **Mobile** | `packages/mobile/` | React Native + Expo SDK 52, expo-router v4 |
| **Shared** | `packages/shared/` (`@epetrecere/shared`) | TypeScript: tipuri, validatori Zod, utils, client HTTP |

Web-ul rulează în producție pe **https://epetrecere.md** (Vercel). Mobile-ul consumă backend-ul prin **API-ul versionat `/api/v1`**.

> **Notă de contradicție:** hărțile menționează atât Neon+Drizzle (predominant, confirmat în stratul de date) cât și, într-un singur loc, "Supabase/Drizzle" în descrierea cabinetului. Sursa de adevăr tehnică este **Neon Postgres + Drizzle** (driver `@neondatabase/serverless`, `drizzle-orm/neon-http`). Referința la Supabase pare o formulare imprecisă.

### Tehnologii cheie și rolul lor

- **Clerk** (`@clerk/nextjs` v7, `@clerk/clerk-expo` pe mobil) — IdP extern pentru autentificare. Web-ul trimite cookie de sesiune, mobilul trimite `Authorization: Bearer <token>`. Ambele rezolvate identic de `clerkMiddleware` + `auth()` (`userId = clerkId`), apoi map `clerkId → users.id`. Sincronizare Clerk→DB prin webhook Svix.
- **Neon Postgres + Drizzle ORM** (^0.45.2, drizzle-kit ^0.31.10) — baza de date serverless (HTTP driver) + ORM. Un singur `schema.ts` monolitic (~1850 linii, 52 tabele, 23 enum-uri).
- **Anthropic AI** (`@anthropic-ai/sdk` ^0.82.0) — asistenți conversaționali cu tool use, smart-search, pricing, generare descrieri/SEO, timeline, scoring lead, OCR meniu, clasificare foto. STT prin **OpenAI Whisper-1** (fetch raw, nu SDK).
- **Meilisearch** — full-text search pentru artiști/săli (client lazy, no-op fără `MEILISEARCH_HOST`).
- **Inngest** (v4) — joburi de fundal event-driven + cron (confirmare lead, follow-up, remindere eveniment/RSVP, expirare rezervări, Google Calendar sync).
- **Resend** — trimitere email (template-uri HTML hand-written, temă dark + accent auriu).
- **Vercel Blob / S3** — hărțile sunt **contradictorii**: comentariile din cod spun "Vercel Blob / AWS S3", dar storage-ul real implementat în `src/lib/storage/upload.ts` este **Cloudflare R2** (S3-compatibil, `@aws-sdk/client-s3`). `/api/upload` menționează Vercel Blob cu fallback disk. **De verificat care e activ în producție.**
- **Sentry** — monitorizare erori pe 3 runtime-uri (server/client/edge) web + mobile; activat doar cu DSN setat.
- **Upstash Redis** — rate limiting (sliding window) partajat între instanțe serverless, cu fallback in-memory pe dev.
- **Playwright** (v1.59) — teste e2e API-first, rulate **default împotriva site-ului live** + DB real.

Alte servicii: **WhatsApp Business Cloud API** (Meta Graph, doar evenimente critice), **Google Calendar OAuth** (sync disponibilitate), **Expo Push** (notificări mobile), **PostHog** (analytics mobile).

---

## 3. Modelul de date

Un singur `src/lib/db/schema.ts` (~1850 linii): **52 tabele, 23 enum-uri Postgres, 17 blocuri de relations** (parțial — multe tabele noi se accesează prin join-uri manuale în `src/lib/db/queries/`).

### Entități principale și relații (pe scurt)

- **users** (PK `uuid`, `clerkId`, `role` enum `super_admin/admin/editor/artist/user`, preferințe notificări jsonb, tokeni Google Calendar, referral). Sursa de adevăr pentru autorizare. Celelalte entități referă user prin `uuid`; restul PK-urilor sunt `serial`.
- **artists** (`userId` unic → un user = max un profil artist; slug, i18n ro/ru/en, `categoryIds int[]`, prețuri, rating, flags active/featured/verified/premium) + `artist_images` / `artist_videos` / `artist_packages` (tarife pe durată cu scope base/weekend/weekday/evening/specific_day) / `artist_availability_slots` / `work_schedule`.
- **venues** (`userId` unic, geo lat/lng, capacitate, working_hours jsonb, facilities, tur virtual) + `venue_images` + meniu digital (`venue_menu_categories/items/packages`) + `menu_scan_cache` (cache AI parsing meniu, keyed SHA-256).
- **categories** (arbore prin `parentId` — fără FK; type artist/service/venue).
- **calendar_events** (polimorfic `entity_type` + `entity_id`, status available/booked/tentative/blocked, source manual/google_sync/booking).
- **leads** + `lead_activities` + `bookings` (legacy) + `offer_requests` (mini-CRM admin).
- **Lead engine (monetizare):** `lead_matches` (matching lead↔vendor cu score/reasons/status) + `vendor_credits` + `credit_transactions`.
- **booking_requests** — tabel **UNIFICAT** artist SAU venue (via `artistId`/`venueId`, exclusivitate impusă doar de aplicație). Flux bilateral: `pending → accepted → confirmed_by_client → rejected/cancelled/completed/expired`; `agreedPrice`, `paidStatus`, `priceOffers` jsonb (istoric negociere), e-signature + `contractPdfUrl`, legătură `eventPlanId`.
- **event_plans** (deținut de user — hub-ul planificatorului; tab-uri opt-in checklist/budget/guests/seating; timeline jsonb; câmpuri Moments) + `checklist_items` + `guest_list` (RSVP) + `seating_tables` + `seat_assignments` + `event_photos` (UGC + upload anonim invitați) + `photo_reactions`.
- **invitations** + `invitation_templates` + `invitation_guests` (rsvpToken one-click, check-in QR).
- **conversations** (1-la-1 client↔vendor, persistent) + `chat_messages` (legat de `bookingRequestId` SAU `conversationId`).
- **reviews** (artist SAU venue, `bookingRequestId` unic pentru verificare).
- **CMS/SEO:** `blog_posts`, `pages`, `page_meta`, `site_settings`, `homepage_sections`, `redirects`.
- **Operațional:** `notifications`, `push_subscriptions` (Web Push VAPID), `push_tokens` (Expo mobil), `ai_conversations`, `admin_audit_log`, `import_batches`, `profile_views`, `profile_clicks`, `wishlist_items` (PK compus).

---

## 4. Subsistemele (rol + stare)

Legendă stare: **Complet** / **Parțial** / **TODO/Stub**.

| Subsistem | Rol | Stare |
|---|---|---|
| **Strat de date** (`src/lib/db`) | Schema Drizzle + queries pe domeniu | **Complet** ca model; **Parțial** la disciplina de migrare (drift — vezi §6) |
| **Web public** (`src/app/(public)`) | Catalog artiști/săli, SEO auto-pages, blog, nunți reale, moments, calculatoare, chestionar, wizard, legale | **Complet** funcțional, cuplat la DB. Zone slabe: social footer `href="#"`, newsletter no-op, contacte placeholder, i18n SEO client-side |
| **Cabinet client** (`src/app/(client)/cabinet`) | Panou complet organizator: plan, rezervări, checklist, invitați, mese, invitații, moments, mesaje, recenzii, GDPR | **Complet** (cel mai matur subsistem). Cod mort de buget, `budgetTarget` nesalvat în SettingsTab |
| **Dashboard vendor** (`src/app/(vendor)/dashboard`) | Panou furnizor | **MIXT**: Venue (`/dashboard/sala/*`) **Complet/matur** (server-side); Artist (`/dashboard/*`) **Parțial** (client-side, financiar estimativ inexact, fără Google sync) |
| **Admin** (`src/app/(admin)/admin`) | Backoffice (21 secțiuni) | **Complet** majoritar. Stub-uri: regenerare AI la import (fake setTimeout), căutare globală topbar (fără handler), SEO scanner (doar navigatoriu), create/delete categorii lipsă din UI |
| **API web** (`src/app/api`, excl. `/ai` și `/v1`) | ~131 route.ts REST | **Complet/matur pentru producție**. Câteva probleme de securitate punctuale (vezi §6) |
| **API v1 mobil** (`src/app/api/v1`) | Contract versionat pentru mobil (shim-uri de re-export) | **Parțial**: funcțional dar cu lipsuri de paritate față de `API_PATHS`, bug slug-vs-id, constante moarte |
| **AI** (`src/lib/ai` + `/api/ai` + `/api/v1/ai`) | Asistenți, search, pricing, generare, STT | **Complet** funcțional. Probleme: ID-uri de model necentralizate, lipsă streaming pe rute grele (risc timeout), parsare JSON fragilă |
| **Servicii backend** (`src/lib/*`) | Email, notificări, push, search, storage, inngest, booking, pricing, leads, referrals, invitations, moments, calendar, geo, contract, seo, calculatoare | **Predominant complet** cu degradare grațioasă. Stub-uri: digest email cron lipsă, pruning tokeni Expo, contract PDF fără pagina 2 |
| **Auth & infra** (middleware, Clerk, Sentry, cron) | Autentificare, gating pe roluri, securitate producție | **Matur/complet**. Lipsuri: `.env.example`, `instrumentation.ts` (posibil Sentry inactiv), câteva riscuri de securitate |
| **Mobile** (`packages/mobile`) | App nativă client + partener | **Foarte avansat** (M0–M7 "complete"), dar **NU curat**: bug-uri de routing post-login (rute inexistente), stub-uri, EAS deja inițializat contrar handoff-ului |
| **Shared** (`packages/shared`) | Sursă unică de tipuri/validatori/API | **Complet ca implementare, sub-utilizat**: consumat DOAR de mobile; web-ul își duplică tipurile |
| **Testare/tooling** (e2e, scripts, config) | Playwright, seed, Vercel, ESLint | **Matur** (web în prod). Risc: e2e rulează default pe prod live + DB real |

---

## 5. Starea generală & istoricul

- **Web**: matur și în **producție stabilă** pe epetrecere.md. `DASHBOARD-TEST-REPORT.md` este documentul autoritar pentru starea funcțională web — declară toate funcțiile de dashboard implementate, cu 3 bug-uri critice de securitate găsite și reparate în timpul testării (invitations 500 uuid vs text, booking-requests accept/reject fără auth, artists/crud deschis anonim). Backlog lint curățat (rămân 84 warnings), typecheck verde, 66 teste verzi la snapshot (dar suita a crescut la 21 fișiere spec).
- **Mobile**: **complet ca și cod** (M0–M7), dar în pragul primului build. `MOBILE_APP_HANDOFF.md` este documentul autoritar pentru mobile. **Handoff-ul e desincronizat cu realitatea** (spune EAS neinițializat și căi `/Users/revencovladislav/Downloads/...`, dar EAS **este** inițializat — projectId real, owner `vladmdx` — și proiectul e în iCloud). Cifrele din handoff (~20k linii, ~150 ecrane) sunt **exagerate**: real ~43 ecrane / ~10.6k linii în `app/`.
- **Branch curent de lucru**: `mobile-app/build-config` — pregătește Faza 1 a build-ului mobile (staged: `app.json`, `eas.json`, 3 assets PNG). **Nimic committat peste `main`** (0/0 ahead/behind) — totul e în staging area + `package-lock.json` modificat nestaged.
- **Istoric git**: web matur (Photo Moments faze 1–5, redesign dashboard-uri) → migrare monorepo (M0) → milestone-uri mobile M1–M7 pe branch-uri `mobile-app/mX-*` merged `--no-ff` în `main`, plus fix-uri Vercel (OOM, rollup). Ultimul commit pe main: `aae85c5` (docs handoff).
- **Consolidat**: tot web-ul + tot codul mobile (în `main`). **În lucru**: primul build EAS + config-ul aferent (necommis).

> Notă: git-ul din contextul de mediu (`astrofancy`, branch `release/testflight-build`) se referă la **alt proiect**. Starea de mai sus e din hărțile ePetrecere.md.

---

## 6. Riscuri, probleme și datorie tehnică

### Securitate (prioritar)

1. **IDOR / scurgere date invitați** — `GET /api/invitations/checkin?invitation_id=N` (`src/app/api/invitations/checkin/route.ts:100-141`) returnează toată lista de invitați (nume, RSVP, plus-one, check-in) pentru **orice** id, fără auth. Enumerare secvențială posibilă. **Cel mai grav issue web.**
2. **Enumerare emailuri + PII** — `GET /api/auth/check-role?email=...` neautenticat returnează rol/onboarding/hasVenue/**telefon** pentru orice email cunoscut (rate-limit doar 15/min/IP).
3. **Recenzii nedeverificate** — `POST /api/reviews` public anonim acceptă orice authorName/rating/artistId (recenzii false, limitat doar de rate-limit + moderare).
4. **Rute de test ce mintează token-uri Clerk reale** — `/api/dev/sign-in-token` + `/(auth)/test-login`, gate doar pe `ENABLE_TEST_LOGIN==="1"`. Dacă flag-ul e setat în prod, login fără parolă ca persona hardcodate. Comentariile chiar sugerează setarea în Vercel.
5. **Lipsă anti-CSRF state pe Google OAuth** — `/api/auth/google/callback` folosește `state` doar ca return-path, nu ca nonce (OAuth CSRF).
6. **Upload validează doar `file.type` declarat de client** (nu magic bytes); SVG whitelisted servit inline → risc XSS stocat.
7. **Google tokens în plaintext** în `users` (compromitere DB = acces calendare Google).
8. **XSS stocat potențial** — blog `dangerouslySetInnerHTML` pe `contentRo`; `custom_head/body_scripts` din setări admin; template-uri email care interpolează fără `escapeHtml` (doar 2 din 7 escapează).
9. **Mesaje de eroare interne** returnate brut la client (`/api/dev/sign-in-token`, `/api/reviews/from-booking`).

### Bug-uri funcționale

- **Mobile routing (crash post-login)** — `app/index.tsx:70-71` și `role-picker.tsx:57-59` fac `<Redirect>` către rute inexistente (`/(partner)/dashboard`, `/(client)/cabinet`). `cabinet.tsx` push către `/(client)/planning` și `/budget-calculator` inexistente. **Push deep-links** (`lib/push.ts`) către `(client)/messages/` inexistent. **Cele mai grave — de reparat înainte de orice build de test.**
- **Bug slug-vs-id API v1** — mobilul apelează `/artists/${slug}`, dar `artists/[id]` face `Number(id)` → HTTP 400 pe slug non-numeric. Ecrane detaliu posibil rupte.
- **`budgetTarget` nesalvat** — SettingsTab din cabinet editează bugetul în state dar nu-l trimite în payload.
- **Digest email daily/weekly se pierde** — `dispatch.ts` sare trimiterea imediată bazându-se pe un cron de digest care **nu există** în `inngest/functions.ts`.
- **Confuzie push web vs mobil** — două funcții `sendPushToUser` (web `push/send.ts` vs Expo `push/expo.ts`); `dispatch.ts` folosește doar web → notificările prin dispatch **nu ajung pe mobil**.

### Datorie tehnică / arhitectură

- **Drift de migrare DB** — `meta/_journal.json` se oprește la 0005; `0006` + directorul `manual/` (0007–0014) sunt în afara tracking-ului Drizzle. Un viitor `drizzle-kit generate` va porni desincronizat. `scripts/apply-migration.ts` e învechit (creează un tabel eliminat).
- **`push_tokens` migrare NEAPLICATĂ pe prod** (cerea confirmare interactivă) — push mobile nu scrie tokeni până la rulare manuală. **Blocant pentru push mobil.**
- **Duplicare de tipuri** — `packages/shared` proiectat ca sursă unică dar consumat doar de mobile; web-ul își duplică tipurile în `src/types/index.ts` și ad-hoc în pagini, cu **divergențe reale** (`UserRole` 5 vs 3 valori, `BookingStatus` valori diferite). Enum-urile DB (`pgEnum`) + union types TS sunt sursă dublă (drift).
- **Duplicare arhitecturală vendor** — două dashboard-uri paralele (artist client-side vs venue server-side) pentru aceleași concepte; paritate asimetrică (venue fără negociere preț; artist fără meniu/Google sync/paidStatus/AI dedicat).
- **Financiar artist inexact** — estimează `priceFrom × nr. evenimente` deși `agreedPrice` există și e folosit corect de venue.
- **AI**: 3 ID-uri de model coexistă necentralizat; rutele grele cu tool use (8–10 iterații) sunt blocante → risc timeout Vercel; parsare JSON prin regex în ~6 rute; enum-uri de status nesincronizate între descrierile tool-urilor și validare.
- **Cod mort**: buget (`buget/client.tsx`, `BudgetTab`, `BudgetProgress`); 4 componente vendor neimportate (ai-calendar-chat, ai-pricing-suggestions, slot-manager, dashboard-bookings-preview); `react-email` instalat dar template-uri HTML brute.
- **Integritate referențială neaplicată** — exclusivitate `artistId/venueId` fără CHECK; FK lipsă pe `calendar_events.bookingId`, `reviews.bookingRequestId`, `categories.parentId`; `chat_messages` permite ambele coloane NULL.
- **Fără FK / persistență fragilă** — buget rămas pe localStorage (per-device); cache-uri fără purjare (menu_scan_cache, admin_audit_log).
- **Testare pe prod live** — Playwright default pe epetrecere.md + DB real; cleanup ratat = gunoi în prod.
- **CI lipsă din checkout** (`.github/workflows` absent deși raportul îl descrie); `eslint.ignoreDuringBuilds=true`.
- **SEO-01**: conflict `next-sitemap` (postbuild `public/sitemap.xml`) vs ruta app-router `sitemap.ts` (500 pe dev).
- **Secret în repo**: Clerk `pk_live_...` inline în `eas.json` (publishable, deci nu critic, dar commis).
- **i18n SEO** doar client-side (același HTML pentru toate limbile, hreflang omis) — ru/en neindexabile separat.

---

## 7. Variabile de mediu & servicii externe necesare

**Nu există `.env.example`** (risc de onboarding — de creat). Variabile deduse din hărți:

**Core / DB / Auth:**
- `DATABASE_URL` (Neon Postgres)
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (+ alte `NEXT_PUBLIC_CLERK_*`), `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_APP_URL` (linkuri absolute email/seo/inngest)

**AI:**
- `ANTHROPIC_API_KEY` (fără el AI dă 503)
- `OPENAI_API_KEY` (Whisper STT — marcat **PENDING pe Vercel**)

**Rate limit / infra:**
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET` (Bearer pentru cron Vercel)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`

**Email / notificări:**
- `RESEND_API_KEY`, `EMAIL_FROM`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (web push)
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`/`_LANG`

**Storage / search:**
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (Cloudflare R2) — și/sau `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — **de clarificat care e activ**
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`

**Integrări / altele:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Calendar sync)
- `ICAL_SECRET` (fallback `CLERK_SECRET_KEY`)
- `ANALYTICS_SALT`
- `ENABLE_TEST_LOGIN` (a **NU** fi `"1"` în prod)
- Inngest — chei proprii de deployment (nu în `env.ts`)

**Mobile (`EXPO_PUBLIC_*`, inlinate în bundle):**
- `EXPO_PUBLIC_API_URL` (default `https://epetrecere.md/api/v1`), `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Pentru `eas submit` iOS: `appleId`, `ascAppId`, `appleTeamId` (actualmente **TBD** — blochează submit iOS)

**Servicii externe necesare:** Clerk, Neon, Anthropic, OpenAI (Whisper), Upstash, Sentry, Resend, Cloudflare R2 (sau Vercel Blob), Meilisearch, Inngest, Google OAuth, Meta WhatsApp, Expo Push, PostHog (mobil), Vercel (hosting + cron).

---

## 8. Cum rulezi

> Comenzile exacte nu sunt toate enumerate în hărți; cele de mai jos sunt deduse. **Verifică `package.json`** pentru scripturile exacte înainte de rulare.

**Web (rădăcină):**
```bash
npm install                 # (pe Vercel: npm install --workspaces=false --legacy-peer-deps)
npm run dev                 # Next.js 15 + Turbopack
npm run build               # eslint.ignoreDuringBuilds=true; typescript.ignoreBuildErrors=false
```

**Bază de date (Drizzle):**
```bash
npx drizzle-kit push        # db:push — sincronizează direct din schema.ts (calea practică actuală)
npx drizzle-kit generate    # ATENȚIE: snapshot desincronizat (drift la 0005)
npx tsx scripts/seed.ts     # seed principal (+ seed-* specializate în scripts/)
```

**Teste e2e (Playwright):**
```bash
npx playwright test                          # DEFAULT: rulează pe https://epetrecere.md + DB PROD (risc!)
E2E_BASE_URL=http://localhost:3000 npx playwright test   # override pentru local
```
Setup-ul de test loghează 2 persona (artist Igor, client) prin `/test-login` (necesită `ENABLE_TEST_LOGIN`). **Nu există persona admin seedată.**

**Mobile (`packages/mobile`):**
```bash
npx expo start              # dev
eas build --profile development|preview|production
eas submit                 # iOS blocat: appleId/ascAppId/appleTeamId = TBD
```

**Shared:** source-only (fără build); `tsc --noEmit` pentru typecheck.

---

## 9. Recomandări pentru pașii următori (prioritizate)

1. **[Securitate — critic] Închide IDOR-ul de la `GET /api/invitations/checkin`** (ownership/auth) și `check-role` (nu returna PII/rol pe param email neautenticat). Elimină/închide definitiv `/api/dev/sign-in-token` + `/test-login` în build-ul de producție. Adaugă anti-CSRF state pe Google OAuth. *(Impact: mare; risc: mic.)*

2. **[Mobile — blocant build] Repară bug-urile de routing** din `app/index.tsx`, `role-picker.tsx`, `cabinet.tsx` și deep-links push (`lib/push.ts`) — rute inexistente fac app-ul nefuncțional post-login. Trebuie rezolvate **înainte** de primul EAS build de test (branch-ul `mobile-app/build-config`). *(Impact: mare; risc: mic.)*

3. **[Infra — blocant push] Aplică migrarea `push_tokens` pe prod** (rulare manuală, evită confirmarea interactivă `users_referral_code_unique`) și **consolidează stratul de migrare Drizzle** (regenerează baseline sau mută complet pe `db:push`, elimină `apply-migration.ts` învechit). Adaugă `OPENAI_API_KEY` pe Vercel. *(Impact: mare; risc: mediu.)*

4. **[AI — pre-scale] Centralizează ID-urile de model** într-o singură constantă, migrează rutele grele cu tool use la streaming + `maxDuration` mărit (evită timeout Vercel), înlocuiește parsarea JSON prin regex cu structured outputs, sincronizează enum-urile de status tool ↔ validare. *(Impact: mediu-mare; risc: mediu.)*

5. **[Coeziune tipuri] Migrează web-ul să importe din `@epetrecere/shared`** (tipuri + validatori Zod) și elimină dublurile din `src/types/index.ts` și din pagini; aliniază `UserRole`/`BookingStatus`. Onorează intenția de sursă unică de adevăr și previne driftul web↔mobile. *(Impact: mediu; risc: mediu.)*

6. **[Config/onboarding] Creează `.env.example`** complet (lista din §7), adaugă `instrumentation.ts` (verifică că Sentry server/edge se încarcă), rezolvă conflictul SEO-01 (sitemap), restabilește CI (`.github/workflows`). *(Impact: mediu; risc: mic.)*

7. **[Curățare cabinet/vendor] Elimină codul mort** (buget: `buget/client.tsx`, `BudgetTab`, `BudgetProgress`; 4 componente vendor neimportate), repară `budgetTarget` nesalvat în SettingsTab, actualizează referințele stale `/cabinet/buget` (inclusiv prompt-ul AI din `public-chat`). Ia în calcul spargerea `planifica/[id]/page.tsx` (~4981 linii) în module. *(Impact: mediu; risc: mic.)*

8. **[Paritate vendor + business] Decide modelul lead engine** (gratuit vs pay-per-lead — elimină sau finalizează codul de credite pe jumătate scos), corectează financiarul artist să folosească `agreedPrice` real, și adu la paritate experiența artist vs venue (negociere preț / Google sync / paidStatus). *(Impact: mediu; risc: mediu.)*

---

### Documente autoritare de consultat

- `DASHBOARD-TEST-REPORT.md` — starea funcțională a web-ului (+ erata spec↔schema).
- `MOBILE_APP_HANDOFF.md` — arhitectură mobile, milestone-uri, gotcha-uri, credențiale EAS (**a nu fi luat literal** — desincronizat: EAS e deja inițializat, căile sunt învechite).
- `AGENTS.md` / `CLAUDE.md` — avertizează că Next.js e o versiune cu breaking changes (citește docs bundled înainte de a edita).
- `src/app/api/v1/README.md` — contractul de rute pentru mobil (`API_PATHS`), parțial documentat.