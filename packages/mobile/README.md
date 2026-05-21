# @epetrecere/mobile

React Native (Expo) app for ePetrecere.md — runs on iOS + Android,
shares types/validators/utils with the web via `@epetrecere/shared`.

## Quick start

```bash
# From the repo root
npm install
cd packages/mobile
cp .env.example .env       # fill in the Clerk publishable key

# Run in Expo Go (limited — no native modules) or via dev client (full)
npm run start
```

For first-time setup of the dev client (one-time, ~10 minutes):

```bash
# Configure EAS (login + project link)
npx eas login
npx eas init                 # links to Expo org "TBD" — fill in app.json
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Then install the resulting `.ipa` / `.apk` on a real device or simulator
and `npm run start` will hot-reload into it.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo SDK 52 | Managed workflow, EAS Build, OTA updates |
| Routing | expo-router v4 | File-based, typed, deep-link aware |
| Styling | NativeWind v4 | Tailwind classes work identically to web |
| State | Zustand + TanStack Query | Same DX as web, persistable cache |
| Auth | @clerk/clerk-expo | First-class SDK, SecureStore tokens |
| Maps | react-native-maps + Google | Native fidelity, same provider as web |
| Animations | Reanimated 3 + Gesture Handler 2 | 60–120fps on UI thread |
| Camera | expo-camera + expo-image-picker | QR scan + Photo Moments upload |
| Notifications | expo-notifications + Expo Push | One API for APNs + FCM |
| Crash reports | Sentry (M5) | Same DSN as the web side |
| Analytics | PostHog (M5) | Same events as web for unified funnel |

## Folder layout

```
app/                  ← expo-router file-based routes
  _layout.tsx         ← root layout: Clerk + safe area + gestures
  index.tsx           ← session-aware redirect to client/partner/auth
  (auth)/sign-in.tsx  ← public group
  (client)/cabinet.tsx← client group (M2–M3)
  (partner)/dashboard.tsx ← partner group (M4)
components/           ← reusable UI primitives (cards, buttons, etc.)
lib/                  ← api client, hooks, push setup, etc.
assets/               ← icons, splash, fonts
constants/            ← static config (colors, breakpoints, copy)
```

## Connecting to the API

We use the shared API client from `@epetrecere/shared/api`. It wraps
fetch with the Clerk token, timeouts, and consistent error parsing.

```ts
import { useApi } from "@/lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

function MyComponent() {
  const api = useApi();
  // …
  const res = await api.get(API_PATHS.bookingRequests);
}
```

## Building for stores

1. Fill in TODOs marked `TBD-fill-…` inside `app.json` and `eas.json`
   (project id, Apple team id, App Store Connect app id).
2. Bump `version` in `app.json` for every store submission. EAS bumps
   `buildNumber` and `versionCode` automatically via `autoIncrement`.
3. `npm run build:ios` → produces a TestFlight-ready archive.
4. `npm run build:android` → produces an AAB upload-ready for Internal
   Testing on Google Play.
5. `npm run submit:ios` / `npm run submit:android` → automated upload.

## Pushing OTA updates

Non-native changes (JS/JSX/CSS) can ship without a new App Store
submission via Expo Updates:

```bash
npm run update           # publishes to channel matching the build profile
```

Native config changes (anything in `app.json` plugins, native modules)
require a new build.
