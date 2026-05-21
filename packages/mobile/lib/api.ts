// API client singleton for the mobile app.
//
// Wraps @epetrecere/shared/api with mobile-specific concerns:
//   - Pulls baseUrl from EXPO_PUBLIC_API_URL (different per env)
//   - Pulls the Clerk session token via @clerk/clerk-expo's useAuth
//     hook (factored through ClerkTokenBridge so non-React code paths
//     can still call the API)
//   - Sets a `X-Client` header so the server can log mobile vs. web
//   - Shows a toast on 5xx via the global error handler (wired in M1)
//
// Usage from a React component:
//   const api = useApi();
//   const res = await api.get<BookingRequest[]>(API_PATHS.bookingRequests);

import { createApiClient, type ApiClient } from "@epetrecere/shared/api";
import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
const USER_AGENT = `ePetrecere-${Platform.OS}/${APP_VERSION}`;

/** React hook that returns an authenticated ApiClient. The hook re-
 *  memoizes when the Clerk session changes so the bearer token always
 *  reflects the current state. */
export function useApi(): ApiClient {
  const { getToken } = useAuth();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: BASE_URL,
        getToken: async () => getToken({ template: undefined }),
        userAgent: USER_AGENT,
      }),
    [getToken],
  );
}

/** Same client, but without the Clerk token — for calls that hit
 *  unauthenticated endpoints (sign-in flow, public catalog, etc.). */
export const publicApi = createApiClient({
  baseUrl: BASE_URL,
  userAgent: USER_AGENT,
});
