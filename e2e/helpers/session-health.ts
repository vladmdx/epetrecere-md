import fs from "node:fs";
import type { BrowserContext, APIRequestContext } from "@playwright/test";

/**
 * Returns true if the stored Playwright `storageState` file still carries
 * a Clerk session that the API recognises. Handy for gracefully skipping
 * auth-gated describes when the saved session has expired — re-running
 * the `setup` project refreshes it.
 *
 * We don't just trust the file's cookie expiry because Clerk's session
 * TOKEN (embedded inside the cookie value) can expire long before the
 * cookie TTL. So we do a cheap ping to an auth-gated endpoint.
 */
export async function isSessionLive(
  storageStatePath: string,
  baseURL: string,
): Promise<boolean> {
  if (!fs.existsSync(storageStatePath)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(storageStatePath, "utf8")) as {
      cookies: Array<{ name: string; value: string }>;
    };
    const cookieHeader = state.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await fetch(`${baseURL}/api/me/referral`, {
      headers: { cookie: cookieHeader },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Extract the plain cookie header from a Playwright storage state file.
 *  Useful for direct fetch() calls that don't go through Playwright's
 *  `request` fixture. */
export function cookieHeaderFromState(storageStatePath: string): string {
  if (!fs.existsSync(storageStatePath)) return "";
  const state = JSON.parse(fs.readFileSync(storageStatePath, "utf8")) as {
    cookies: Array<{ name: string; value: string }>;
  };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// Re-exports to keep helper surface tidy (unused imports silence linter).
export type { BrowserContext, APIRequestContext };
