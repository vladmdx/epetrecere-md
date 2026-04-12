/**
 * Centralized environment variable validation.
 *
 * Import this module early (e.g. in layout.tsx or instrumentation.ts) to
 * fail-fast at startup when required env vars are missing, instead of
 * getting cryptic runtime errors later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        `Add it to .env.local or your deployment environment.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

// ═══════════════════════════════════════════════════════
// Required — app will not function without these
// ═══════════════════════════════════════════════════════
export const env = {
  /** Neon PostgreSQL connection string */
  DATABASE_URL: required("DATABASE_URL"),

  /** Clerk authentication */
  CLERK_SECRET_KEY: required("CLERK_SECRET_KEY"),

  // ═══════════════════════════════════════════════════════
  // Optional — features degrade gracefully without these
  // ═══════════════════════════════════════════════════════

  /** Public-facing app URL (used for absolute links, OG images, emails) */
  NEXT_PUBLIC_APP_URL: optional("NEXT_PUBLIC_APP_URL", "https://epetrecere.md"),

  /** Clerk webhook secret for user sync */
  CLERK_WEBHOOK_SECRET: optional("CLERK_WEBHOOK_SECRET"),

  /** Anthropic API key for AI assistant */
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),

  /** Resend email service */
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  EMAIL_FROM: optional("EMAIL_FROM", "noreply@epetrecere.md"),

  /** Cloudflare R2 storage */
  R2_ACCOUNT_ID: optional("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: optional("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: optional("R2_SECRET_ACCESS_KEY"),
  R2_BUCKET_NAME: optional("R2_BUCKET_NAME"),
  R2_PUBLIC_URL: optional("R2_PUBLIC_URL"),

  /** Upstash Redis for rate limiting */
  UPSTASH_REDIS_REST_URL: optional("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: optional("UPSTASH_REDIS_REST_TOKEN"),

  /** Meilisearch for full-text search */
  MEILISEARCH_HOST: optional("MEILISEARCH_HOST"),
  MEILISEARCH_API_KEY: optional("MEILISEARCH_API_KEY"),

  /** Google Calendar OAuth */
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),

  /** iCal subscription HMAC secret */
  ICAL_SECRET: optional("ICAL_SECRET"),

  /** Analytics salt for hashing */
  ANALYTICS_SALT: optional("ANALYTICS_SALT"),

  /** Contact phone shown on site */
  NEXT_PUBLIC_CONTACT_PHONE: optional("NEXT_PUBLIC_CONTACT_PHONE", "+373 60 123 456"),

  /** Enable test login page (development only) */
  ENABLE_TEST_LOGIN: optional("ENABLE_TEST_LOGIN"),
} as const;
