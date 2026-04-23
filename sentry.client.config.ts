// Sentry client-side config.
// Loaded automatically by @sentry/nextjs on the browser. Controlled via
// NEXT_PUBLIC_SENTRY_DSN — if unset, Sentry is a no-op (safe for dev).
//
// Environment vars required (prod):
//   NEXT_PUBLIC_SENTRY_DSN   — https://<key>@<org>.ingest.sentry.io/<project>
//   NEXT_PUBLIC_SENTRY_ENVIRONMENT  — optional; defaults to NODE_ENV
//
// Dev tip: leave NEXT_PUBLIC_SENTRY_DSN empty locally so your errors
// don't pollute the production Sentry project.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",

    // Performance tracing — lower rate in production to stay within free tier.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session replay — records a short clip of the page on error. Disabled
    // by default to preserve bandwidth + privacy; enable if you need it.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Don't report known noise
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      // Clerk expected transient
      "ClerkNetworkError",
    ],

    // Filter out PII before sending
    beforeSend(event) {
      // Strip any captured URLs that contain tokens/emails in query
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          ["token", "email", "api_key", "password"].forEach((k) =>
            u.searchParams.delete(k),
          );
          event.request.url = u.toString();
        } catch {
          /* ignore */
        }
      }
      return event;
    },
  });
}
