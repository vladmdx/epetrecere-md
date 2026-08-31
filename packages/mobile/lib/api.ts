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

/**
 * Turns a failed response into a thrown error, which is what React Query needs
 * in order to have a failure at all.
 *
 * The client never throws — on a 404, a 500 or a dead network it returns
 * `{ ok: false, data: null }`. Screens were written as
 * `queryFn: async () => (await api.get(path)).data`, so a failure resolved
 * *successfully* with `data === null`. `isLoading` went false, `isError` stayed
 * false, and the usual guard `if (isLoading || !data) return <Spinner/>` never
 * opened again: seven detail screens spun forever on any failure, and no error
 * could ever be displayed because none was ever raised.
 *
 * Wrap every read in this and React Query gets its error, retries work, and
 * `isError` means something.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
  /** A signed-out or expired session, which callers may want to treat apart. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

export function unwrap<T>(res: {
  ok: boolean;
  status: number;
  data: T | null;
  error: { code: string; message: string } | null;
}): T {
  if (!res.ok || res.data === null) {
    throw new ApiError(
      res.error?.message ?? "Ceva nu a mers. Încearcă din nou.",
      res.status,
      res.error?.code ?? "unknown",
    );
  }
  return res.data;
}
