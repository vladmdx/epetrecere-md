import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ARTIST_STATE, CLIENT_STATE } from "./helpers/paths";

fs.mkdirSync(path.dirname(ARTIST_STATE), { recursive: true });

/**
 * Sign in a test persona by driving the existing `/test-login` page.
 * That page fetches a one-shot Clerk ticket from `/api/dev/sign-in-token`,
 * completes the legacy `signIn.create({ strategy: "ticket" })` flow, and
 * redirects to the persona's default destination. When the redirect lands
 * we save the browser `storageState` (cookies + localStorage) for the
 * test context to resume.
 */
async function signInAs(
  page: import("@playwright/test").Page,
  personaRegex: RegExp,
  destMatcher: RegExp,
) {
  // Retry up to 3 times — the ticket flow occasionally races the Clerk
  // frontend SDK bootstrap and fails with "Cannot read properties of
  // undefined (reading 'signIn')" until clerk.client is ready.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto("/test-login", { waitUntil: "domcontentloaded" });

      // Wait for Clerk's frontend SDK to finish initialising `clerk.client`.
      // We poll a window flag rather than a selector because the button
      // always renders; the SDK is what we're actually waiting on.
      await page.waitForFunction(
        () => {
          const w = window as unknown as {
            Clerk?: { loaded?: boolean; client?: unknown };
          };
          return Boolean(w.Clerk?.loaded && w.Clerk.client);
        },
        undefined,
        { timeout: 15_000 },
      );

      await page.getByRole("button", { name: personaRegex }).click();
      await page.waitForURL(destMatcher, { timeout: 30_000 });
      await expect(page).toHaveURL(destMatcher);
      return;
    } catch (e) {
      lastError = e;
      if (attempt < 3) {
        // Small backoff to let Clerk cool off between attempts.
        await page.waitForTimeout(1000);
      }
    }
  }
  throw lastError;
}

setup("sign in as igor (artist)", async ({ page }) => {
  await signInAs(page, /Igor Nedoseikin/i, /\/dashboard/);
  await page.context().storageState({ path: ARTIST_STATE });
});

setup("sign in as client", async ({ page }) => {
  await signInAs(page, /Test Client/i, /\/cabinet/);
  await page.context().storageState({ path: CLIENT_STATE });
});
