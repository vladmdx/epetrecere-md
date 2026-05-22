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
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useMemo } from "react";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applyPersistedLocale } from "../lib/i18n";
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
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

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
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <StatusBar style="light" />
              <PushSetup />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0D0D0D" },
                  animation: "slide_from_right",
                }}
              />
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
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
