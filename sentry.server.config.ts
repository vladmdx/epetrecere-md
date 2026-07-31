// Sentry server-side config.
// Captures unhandled exceptions from server components, route handlers,
// and middleware. DSN comes from SENTRY_DSN (server-only, not exposed
// to the browser — different var name from the client config).

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",

    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    beforeSend(event) {
      // Never leak DB connection strings or API keys in breadcrumbs.
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          ["token", "email", "phone", "api_key", "password"].forEach((k) =>
            u.searchParams.delete(k),
          );
          event.request.url = u.toString();
        } catch {
          /* ignore */
        }
      }

      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["set-cookie"];
      }

      // Request bodies can contain booking contact details and private chat.
      delete event.request?.data;
      return event;
    },
  });
}
