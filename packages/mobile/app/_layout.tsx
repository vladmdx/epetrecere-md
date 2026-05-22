// Root layout — wraps every route in the app.
//
// Sets up:
//   - Clerk provider with secure-store token cache
//   - SafeAreaProvider for notch/island-aware layouts
//   - GestureHandlerRootView for Reanimated gestures
//   - Status bar (light icons on dark theme)
//   - Tailwind global stylesheet
//
// Navigation tree:
//   /(auth)/sign-in     - public, only when signed-out
//   /(client)/...       - default for user role
//   /(partner)/...      - default for artist role
// We route between them in `app/index.tsx` based on the Clerk session.

import "../global.css";
import "../lib/i18n"; // boots i18next before any screen renders
import { initSentry, setSentryUser } from "../lib/sentry";
// Init Sentry as the very first thing in app boot so any error
// thrown during ClerkProvider hydration gets reported. Idempotent.
initSentry();
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useMemo } from "react";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { applyPersistedLocale } from "../lib/i18n";
import { PostHogProvider } from "../lib/posthog";
import { ThemeProvider } from "../lib/theme";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useAppFocusSync } from "../lib/use-app-focus-sync";
import {
  configureAndroidChannel,
  listenForNotificationTaps,
  registerPushToken,
} from "../lib/push";

// Keep the native splash visible until fonts load + Clerk hydrates so
// users never see a flash of unstyled content.
SplashScreen.preventAutoHideAsync();

// Clerk token cache — uses expo-secure-store on device, NOT
// AsyncStorage, because tokens should land in the iOS Keychain /
// Android Keystore (encrypted, not readable from device backups).
const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // No-op — Clerk handles the rejection by re-auth on next request.
    }
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // We'll ship Cormorant + Inter via expo-google-fonts in M1. For now
    // the system fonts are an acceptable fallback while the project
    // scaffolds.
  });

  // Single QueryClient for the whole app. Sensible defaults:
  //   - 2-min staleTime so card lists don't refetch on every screen
  //     focus (mobile users tab around aggressively).
  //   - 1 retry — the user's network is shaky enough that a single
  //     retry usually wins; more retries delay the error toast.
  //   - 24-hour gcTime so hydrated cache survives long enough to
  //     hand the user content the next time they open the app, even
  //     after a few hours offline.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  // AsyncStorage-backed persister. We bust the cache when the app
  // version bumps so a release with breaking response shapes can't
  // hydrate stale rows into a fresh client.
  const persister = useMemo(
    () =>
      createAsyncStoragePersister({
        storage: AsyncStorage,
        // Throttle writes — TanStack defaults to 1s; bumping to 2s
        // halves the disk churn on chatty screens (chat thread, search).
        throttleTime: 2_000,
        // Key namespaced so other AsyncStorage keys can't collide.
        key: "epetrecere.rq-cache.v1",
      }),
    [],
  );

  const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

  useEffect(() => {
    // Apply persisted locale override before the splash drops so the
    // user never sees a flash of the device-default language.
    void applyPersistedLocale();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!publishableKey) {
    // We refuse to render anything without a Clerk key — better to
    // crash loudly in dev than to render a half-broken auth flow that
    // can't sign anyone in.
    throw new Error(
      "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — set it in .env or eas.json env block.",
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000,
            buster: APP_VERSION,
            // Skip persisting auth-y queries that change session-by-session.
            // The booleans + simple equality keep this dehydrate filter
            // cheap to run for every mutation.
            dehydrateOptions: {
              shouldDehydrateQuery: (q) => {
                const key = q.queryKey?.[0];
                // Don't persist chat threads (they poll constantly and
                // would write to disk every ~8s) or anything tagged
                // explicitly as ephemeral.
                if (
                  typeof key === "string" &&
                  (key === "chat-messages" ||
                    key === "conversation-meta" ||
                    key.startsWith("__ephemeral"))
                ) {
                  return false;
                }
                return q.state.status === "success";
              },
            },
          }}
        >
          <ErrorBoundary>
            <ThemeProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                  <PostHogProvider>
                    <StatusBar style="light" />
                    <PushSetup />
                    <FocusSync />
                    <SentryUserTag />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: "#0D0D0D" },
                        animation: "slide_from_right",
                      }}
                    />
                  </PostHogProvider>
                </SafeAreaProvider>
              </GestureHandlerRootView>
            </ThemeProvider>
          </ErrorBoundary>
        </PersistQueryClientProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

/** Effect-only — kicks the focus sync hook. Must live inside the
 *  PersistQueryClientProvider so useQueryClient resolves. */
function FocusSync() {
  useAppFocusSync();
  return null;
}

/** Tag Sentry with the signed-in user as soon as Clerk produces one. */
function SentryUserTag() {
  const { user } = useUser();
  useEffect(() => {
    setSentryUser(
      user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress,
          }
        : null,
    );
  }, [user]);
  return null;
}

/** Effect-only component that registers the device push token once
 *  Clerk has a session, and tears down the tap-listener on unmount.
 *  Kept separate so it can use the `useAuth` hook (which can't be
 *  called above ClerkProvider). */
function PushSetup() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    void configureAndroidChannel();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void registerPushToken({
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
      getToken: async () => getToken(),
    });
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    return listenForNotificationTaps();
  }, []);

  return null;
}
