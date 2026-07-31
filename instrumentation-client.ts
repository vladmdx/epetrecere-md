import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      "top.GLOBALS",
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      "ClerkNetworkError",
    ],
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          ["token", "email", "phone", "api_key", "password"].forEach((key) =>
            url.searchParams.delete(key),
          );
          event.request.url = url.toString();
        } catch {
          // Keep reporting even when a browser supplies a relative URL.
        }
      }

      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["set-cookie"];
      }

      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
