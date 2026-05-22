// Sentry init — mobile crash reporting + performance traces.
//
// Mirrors the web's @sentry/nextjs configuration so issues raised from
// either surface land in the same Sentry project under different
// tags. EXPO_PUBLIC_SENTRY_DSN gates the init — when unset (e.g., in
// dev or before we provision the project) Sentry stays silent rather
// than throwing about a missing DSN at startup.
//
// Source maps upload via the @sentry/react-native Metro plugin, but
// that's wired through Expo's build process — no manual upload step
// required in CI.

import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;
  Sentry.init({
    dsn: DSN,
    enableAutoSessionTracking: true,
    // Lower traces sample rate on production (TanStack adds chatty
    // network spans we don't want filling the quota).
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    profilesSampleRate: __DEV__ ? 1.0 : 0.1,
    environment: __DEV__ ? "development" : "production",
    release: Constants.expoConfig?.version,
    dist: String(
      (Platform.OS === "ios"
        ? Constants.expoConfig?.ios?.buildNumber
        : Constants.expoConfig?.android?.versionCode) ?? "0",
    ),
    integrations: [
      Sentry.reactNativeTracingIntegration(),
    ],
    // Don't auto-capture console.log — it's noisy and we use it
    // intentionally for dev debugging.
    enableNative: true,
    enableNativeCrashHandling: true,
  });
}

/** Tag the Sentry session with the signed-in user. Call after Clerk
 *  produces a session so crashes can be correlated with a user. */
export function setSentryUser(user: { id: string; email?: string } | null) {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

/** Lightweight breadcrumb helper for one-off events that don't warrant
 *  a full span — e.g., "user opened booking sheet". */
export function breadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}

/** Re-export captureException so call sites don't need to import
 *  Sentry directly — keeps imports clean and lets us add prefix
 *  tags here in one place. */
export const captureException = (err: unknown, extra?: Record<string, unknown>) => {
  if (!initialized) {
    console.error("[error]", err, extra);
    return;
  }
  Sentry.captureException(err, { extra });
};

export { Sentry };
