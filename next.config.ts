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
          { key: "X-Frame-Options", value: "DENY" },
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
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
