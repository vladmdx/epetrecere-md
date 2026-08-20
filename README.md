# ePetrecere.md

Marketplace pentru evenimente — web app (Next.js 15) + mobile app
(React Native via Expo) pentru clienți care planifică evenimente și
artiști/săli care le servesc.

## Repo layout — monorepo

```
.                           ← Next.js web app lives here at the root
  src/                      ← web source
  public/, scripts/, …      ← web assets, scripts, configs
  packages/
    shared/                 ← @epetrecere/shared — TS types, Zod
                              validators, helpers used by BOTH web
                              and mobile
    mobile/                 ← @epetrecere/mobile — Expo React Native
                              app for iOS + Android
```

The web continues to live at the repo root so the Vercel deploy keeps
working without any config changes. `packages/*` are siblings managed
via npm workspaces.

## Quick start

```bash
# Install both workspaces
npm install

# Web (existing)
npm run dev

# Mobile (Expo, requires .env first — see packages/mobile/README.md)
npm run mobile
# or
npm run mobile:ios
npm run mobile:android
```

## Workspaces

| Package | Purpose | Docs |
|---|---|---|
| (root) | Next.js 15 web app | This file + `AGENTS.md` |
| `@epetrecere/shared` | Types, Zod schemas, formatters | `packages/shared/src/` |
| `@epetrecere/mobile` | Expo RN app | `packages/mobile/README.md` |

## Common scripts

```bash
npm run dev              # web dev server (port 3000)
npm run build            # web production build (Vercel uses this)
npm run typecheck        # web TS check
npm run mobile           # Expo dev server (Metro)
npm run mobile:typecheck # mobile TS check
npm run db:studio        # Drizzle Studio (web DB)
```

## Deploy

- **Web** → Vercel auto-deploys `main` to `epetrecere.md`. No config
  change from the monorepo migration — workspaces are transparent to
  Next.js builds.
- **Mobile** → EAS Build + EAS Submit. See `packages/mobile/README.md`
  for the full guide.

## Optional public env vars

`.env*` is gitignored, so these are documented here rather than in an
example file. All are optional — the UI simply hides the feature when a
value is missing, which is why the footer no longer shows social icons
that lead nowhere.

| Variable | Effect when set |
| --- | --- |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK` | Shows the Facebook icon in the footer |
| `NEXT_PUBLIC_SOCIAL_INSTAGRAM` | Shows the Instagram icon in the footer |
| `NEXT_PUBLIC_SOCIAL_TIKTOK` | Shows the TikTok icon in the footer |
| `NEXT_PUBLIC_SOCIAL_TELEGRAM` | Shows the Telegram icon in the footer |

## Maps

The public venue map renders with **Google Maps** when
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set, and falls back to Leaflet +
OpenStreetMap otherwise, so the map never goes blank while a key is being
set up. The key must be a **Maps JavaScript API** key from a Google Cloud
project with billing enabled, restricted by HTTP referrer to
`epetrecere.md/*` — it ships to the browser, so a referrer restriction is
the only thing protecting the quota.

`MDL_PER_EUR` (default 19.5) is the single leu→euro rate used by the AI menu
scanner, which has to read menus printed in lei. Nothing else converts.
