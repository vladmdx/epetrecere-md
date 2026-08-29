import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next.js allows a statically generated page 60 seconds by default, retries
   * three times, then fails the whole export. That budget assumes the database
   * is near the builder. Ours is not: Vercel builds this project in Washington
   * — the region is fixed on the current plan — while the database sits in
   * Frankfurt, so every query pays a transatlantic round trip. Four production
   * deploys died that way, each on a different page as the previous one was
   * made faster.
   *
   * Raising the ceiling does not paper over a hang: the pages still finish,
   * they simply need more than a minute from that distance. The runtime side
   * is being fixed properly by moving the functions to Frankfurt, next to the
   * data; this is what keeps the build honest until the build region can
   * follow them.
   */
  staticPageGenerationTimeout: 300,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // M11 Intern #2 — perf audit. Prefer AVIF where supported, WebP as
    // fallback. Cache optimized images in Next's cache for 24h.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.epetrecere.md",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        // Vercel Blob storage — /api/upload returns URLs on
        // *.public.blob.vercel-storage.com.
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.vercel-storage.com",
      },
      {
        protocol: "http",
        hostname: "artist.md",
      },
      {
        protocol: "https",
        hostname: "artist.md",
      },
    ],
  },
  reactStrictMode: true,
  // M11 Intern #2 — tree-shake big icon libraries so Turbopack doesn't ship
  // the whole catalog to the client bundle.
  experimental: {
    /**
     * One static-generation worker, not one per core.
     *
     * The page that fails has moved every build — /ro, then /servicii, then
     * /ro and /planifica — which is the signature of contention rather than of
     * any one slow page. The queries themselves measure 71ms and 79ms against
     * production.
     *
     * What changed is the driver. Neon was reached over HTTP: every query a
     * stateless request, no sockets held, so parallel workers could not
     * contend for anything. Supabase speaks the ordinary wire protocol, so the
     * workers now share a connection pool — and when it is exhausted the
     * driver waits instead of failing, which turns into a page that never
     * finishes rather than one that errors.
     *
     * Serialising generation removes the variable outright. It costs build
     * time, which is spent once per deploy, and buys back deploys that
     * complete, which had stopped happening.
     */
    cpus: 1,
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
  async headers() {
    return [
      {
        // The hero and CTA background videos never change once deployed.
        // Without this they were revalidated on every visit.
        source: "/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // SAMEORIGIN (not DENY) so same-origin iframes work — e.g. the
          // contract-preview <iframe src="/api/booking-requests/:id/contract">
          // in the sign-contract dialog. External framing is still blocked,
          // so clickjacking protection stays intact.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // SEC — Content Security Policy. Mitigates XSS by whitelisting
            // trusted sources. Key allowances:
            //   - 'unsafe-inline' for styles: Tailwind + Clerk inject inline
            //   - 'unsafe-inline' for scripts: JSON-LD + Next.js inline chunks
            //   - Clerk SDK domains for auth popups/iframes
            //   - YouTube/Vimeo for artist video embeds
            //   - Vercel Blob for image uploads
            //   - Upstash for rate limiting (connect-src)
            //   - Google Maps for the venue map. The loader injects a script
            //     tag, and the Maps SDK then fetches tiles and metadata over
            //     XHR, so it needs BOTH script-src and connect-src. Without
            //     them the browser blocks the injection before any request
            //     leaves, the script's onerror fires, and the map reports
            //     "could not load" with nothing in the network log to explain
            //     it. gstatic.com serves the SDK's own sub-resources.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://clerk.epetrecere.md https://*.clerk.accounts.dev https://challenges.cloudflare.com https://maps.googleapis.com https://maps.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' https:",
              "frame-src https://www.youtube.com https://player.vimeo.com https://clerk.epetrecere.md https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "connect-src 'self' https://clerk.epetrecere.md https://*.clerk.accounts.dev https://*.upstash.io https://*.r2.cloudflarestorage.com https://cdn.epetrecere.md https://*.vercel-storage.com https://maps.googleapis.com https://maps.gstatic.com wss:",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              // 'self' matches the relaxed X-Frame-Options above — allows
              // our own pages to embed our own endpoints (PDF preview, etc.)
              // without giving third-party origins framing rights.
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Sentry config — wraps the Next.js config. Only active when SENTRY_DSN
// env is set; otherwise it's a no-op wrapper. Upload of source maps
// requires SENTRY_AUTH_TOKEN (via Vercel env var), org, and project —
// fall back gracefully if missing so local dev works without Sentry.
import { withSentryConfig } from "@sentry/nextjs";

const sentryEnabled = Boolean(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
);

const config = sentryEnabled ? withSentryConfig(nextConfig, {
  // Suppresses source-map upload logs during build
  silent: true,
  // These can also be set via env; hardcoding for a single-project setup.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only upload source maps in production builds to save time + quota
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: false,
    treeshake: {
      removeDebugLogging: true,
    },
  },
}) : nextConfig;

export default config;
