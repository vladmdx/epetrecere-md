// HTTP client factory.
//
// Both the mobile app and any future server-to-server caller use this.
// The web Next.js routes call drizzle directly so they don't go through
// this — but if we ever need a service that talks to our API as a
// client (cron, admin tool), it'd use this same factory.
//
// Design:
//   - You pass a `baseUrl` (`https://epetrecere.md/api/v1` on prod,
//     `http://localhost:3000/api/v1` in dev).
//   - You pass an async `getToken()` that returns the current Clerk
//     bearer token. The client calls it before each request so the
//     token always reflects the latest session.
//   - You optionally pass `onError(status, body)` to centralise
//     handling of 401 / 5xx / network errors (toast, redirect, etc.).
//
// All response bodies are pre-parsed JSON. The caller validates with
// a Zod schema from @epetrecere/shared/validators.

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
  onError?: (status: number, body: unknown) => void;
  /** Optional user-agent suffix appended to every request — mobile
   *  apps set this to "ePetrecere-iOS/1.0" so we can audit traffic by
   *  client on the server side. */
  userAgent?: string;
  /** Hard timeout in ms. Defaults to 30 s. */
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: { code: string; message: string } | null;
}

export function createApiClient(opts: ApiClientOptions) {
  const timeout = opts.timeoutMs ?? 30_000;

  async function request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    init?: { signal?: AbortSignal; query?: Record<string, string | number | boolean | null | undefined> },
  ): Promise<ApiResponse<T>> {
    // Build URL with query string when query params are passed.
    // IMPORTANT: the base must end with "/" AND the path must NOT start with
    // "/", otherwise `new URL("/categories", "https://host/api/v1/")` resolves
    // to the ORIGIN root ("https://host/categories") and silently drops the
    // "/api/v1" base path — breaking every endpoint.
    const base = opts.baseUrl.endsWith("/") ? opts.baseUrl : `${opts.baseUrl}/`;
    const url = new URL(path.replace(/^\/+/, ""), base);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (opts.userAgent) headers["X-Client"] = opts.userAgent;
    const token = await opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", () => controller.abort());
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (!res.ok) {
        const error = {
          code: typeof parsed === "object" && parsed && "code" in parsed
            ? String((parsed as Record<string, unknown>).code)
            : "http_error",
          // The API answers with `{ error: "..." }` — 139 route files do, and
          // exactly one uses `message`. Reading only `message` meant every
          // server explanation was discarded and the user shown the bare
          // status line instead: "HTTP 403" where the server had said why.
          message: (() => {
            if (typeof parsed === "object" && parsed) {
              const o = parsed as Record<string, unknown>;
              for (const key of ["error", "message"]) {
                const v = o[key];
                if (typeof v === "string" && v.trim()) return v;
              }
            }
            if (typeof parsed === "string" && parsed.trim()) return parsed;
            return `HTTP ${res.status}`;
          })(),
        };
        opts.onError?.(res.status, parsed);
        return { ok: false, status: res.status, data: null, error };
      }
      return {
        ok: true,
        status: res.status,
        data: parsed as T,
        error: null,
      };
    } catch (err: unknown) {
      const aborted = err instanceof Error && err.name === "AbortError";
      const code = aborted ? "timeout" : "network_error";
      const message = aborted
        ? "Conexiunea a expirat. Verifică internetul și încearcă din nou."
        : "Nu s-a putut conecta la server.";
      opts.onError?.(0, { code, message });
      return { ok: false, status: 0, data: null, error: { code, message } };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    request,
    get: <T = unknown>(
      path: string,
      init?: Parameters<typeof request>[3],
    ) => request<T>("GET", path, undefined, init),
    post: <T = unknown>(
      path: string,
      body?: unknown,
      init?: Parameters<typeof request>[3],
    ) => request<T>("POST", path, body, init),
    put: <T = unknown>(
      path: string,
      body?: unknown,
      init?: Parameters<typeof request>[3],
    ) => request<T>("PUT", path, body, init),
    patch: <T = unknown>(
      path: string,
      body?: unknown,
      init?: Parameters<typeof request>[3],
    ) => request<T>("PATCH", path, body, init),
    delete: <T = unknown>(
      path: string,
      init?: Parameters<typeof request>[3],
    ) => request<T>("DELETE", path, undefined, init),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// ─── Endpoint paths (v1) ────────────────────────────────────────────
// String constants for every API route the mobile app calls. Keeps
// the typo surface small and makes a future API rename easy to grep.

export const API_PATHS = {
  // Auth + session
  me: "/auth/me",
  myArtist: "/me/artist",
  myVenue: "/me/venue",

  // Your own account — leaving with your data, and erasing it.
  dataExport: "/me/data-export",
  deleteAccount: "/me/delete-account",

  // Legal pack — reading the contract and signing it. Registration is only
  // allowed after a signature exists, so these come before registerArtist.
  legalDocuments: "/legal/documents",
  legalAccept: "/legal/accept",
  registerArtist: "/auth/register-artist",

  // Commissions — what the partner owes the platform on confirmed orders.
  // Scoped server-side to the caller's own artist/venue.
  commissions: "/commissions",

  // Booking requests
  bookingRequests: "/booking-requests",
  bookingRequest: (id: number) => `/booking-requests/${id}`,
  bookingAccept: (id: number) => `/booking-requests/${id}/accept`,
  bookingReject: (id: number) => `/booking-requests/${id}/reject`,
  bookingProposePrice: (id: number) => `/booking-requests/${id}/propose-price`,

  // Conversations + chat
  conversations: "/conversations",
  conversation: (id: number) => `/conversations/${id}`,
  conversationMessages: (id: number) => `/conversations/${id}/messages`,

  // Event plans
  eventPlans: "/event-plans",
  eventPlan: (id: number) => `/event-plans/${id}`,
  eventPlanPhotos: (id: number) => `/event-plans/${id}/photos`,
  eventPlanGuests: (id: number) => `/event-plans/${id}/guests`,
  eventPlanChecklist: (id: number) => `/event-plans/${id}/checklist`,

  // Discovery
  categories: "/categories",
  artists: "/artists",
  artist: (slug: string) => `/artists/${slug}`,
  venues: "/venues",
  venue: (slug: string) => `/venues/${slug}`,
  wishlist: "/wishlist",
  roleReference: "/me/role-preference",

  // Partner dashboard
  artistDashboard: "/me/artist/dashboard",
  venueDashboard: "/me/venue/dashboard",

  // Availability calendar (GET month / POST bulk-set blocked|available days)
  calendar: "/calendar",

  // Settings
  notificationPreferences: "/me/notification-preferences",

  // Photo Moments (public album resolved by QR slug)
  momentsBySlug: (slug: string) => `/moments/${slug}`,

  // Mobile-only
  pushTokens: "/push-tokens",
} as const;
