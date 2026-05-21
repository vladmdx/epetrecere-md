/// <reference types="expo/types" />

// Public env variables — Expo inlines EXPO_PUBLIC_* into the JS bundle.
// Keep this list in sync with .env, eas.json env blocks, and the
// `extra` field in app.json.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL: string;
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
    EXPO_PUBLIC_SENTRY_DSN?: string;
    EXPO_PUBLIC_POSTHOG_KEY?: string;
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  }
}
