import postgres from "postgres";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test.local", override: true });

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parsedUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}

export function localE2EBaseUrl(): string {
  const value = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  const url = parsedUrl(value, "E2E_BASE_URL");
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      "Destructive Playwright tests may target only a loopback HTTP server. Remote/staging URLs are refused.",
    );
  }
  if (url.port && url.port !== "3000") {
    throw new Error("E2E_BASE_URL must use the isolated test server on port 3000.");
  }
  return url.origin;
}

export type E2EDatabaseConfig = { url: string; marker: string };

export function assertE2EClerkEnvironment(): void {
  const secret = process.env.CLERK_SECRET_KEY ?? "";
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (!secret.startsWith("sk_test_") || !publishable.startsWith("pk_test_")) {
    throw new Error(
      "E2E requires Clerk test-instance keys (sk_test_ / pk_test_) in .env.test.local.",
    );
  }
}

export function e2eDatabaseConfig(): E2EDatabaseConfig {
  const url = process.env.E2E_DATABASE_URL;
  const marker = process.env.E2E_DB_MARKER;
  if (!url || !marker || marker.length < 16) {
    throw new Error(
      "E2E_DATABASE_URL and a unique E2E_DB_MARKER (at least 16 characters) are required in .env.test.local.",
    );
  }
  const parsed = parsedUrl(url, "E2E_DATABASE_URL");
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error("E2E_DATABASE_URL must point to a loopback PostgreSQL server.");
  }
  if (
    process.env.E2E_RUNTIME === "1" &&
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== url
  ) {
    throw new Error(
      "DATABASE_URL differs from E2E_DATABASE_URL. Refusing a split-brain test run.",
    );
  }
  return { url, marker };
}

export async function verifyE2EDatabase(config = e2eDatabaseConfig()): Promise<void> {
  const client = postgres(config.url, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
  });
  try {
    const rows = await client<{ marker: string }[]>`
      SELECT marker
      FROM public.epetrecere_e2e_guard
      WHERE singleton = true
      LIMIT 1
    `;
    if (rows[0]?.marker !== config.marker) {
      throw new Error("Disposable database marker does not match E2E_DB_MARKER.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `E2E database guard verification failed: ${message}. Initialize only a disposable local database with npm run test:db:init-guard.`,
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}
