import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
  async headers() {
    return [
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
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://clerk.epetrecere.md https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' https:",
              "frame-src https://www.youtube.com https://player.vimeo.com https://clerk.epetrecere.md https://*.clerk.accounts.dev https://challenges.cloudflare.com",
              "connect-src 'self' https://clerk.epetrecere.md https://*.clerk.accounts.dev https://*.upstash.io https://*.r2.cloudflarestorage.com https://cdn.epetrecere.md https://*.vercel-storage.com wss:",
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

export default withSentryConfig(nextConfig, {
  // Suppresses source-map upload logs during build
  silent: true,
  // These can also be set via env; hardcoding for a single-project setup.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only upload source maps in production builds to save time + quota
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
