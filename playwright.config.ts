import { defineConfig, devices } from "@playwright/test";
import { localE2EBaseUrl } from "./e2e/helpers/safety";

// ADR 0028 review (Correction Pass 4) — E2E test safety, P0.
// Load ONLY the dedicated test env file. Never `.env.local` /
// `.env.production.local`, so the suite can never inherit production
// credentials. `safety.ts` loads it with override=true so a shell/.env.local
// value cannot silently win. There is no production baseURL fallback.

const baseURL = localE2EBaseUrl();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared test-data invariants: run sequentially
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  webServer: {
    command: "npx tsx scripts/start-e2e-server.ts",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Global setup project signs in both personas and writes storageState files.
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    // API tests only need a signed-in storageState + bare-bones context.
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    // UI tests (slower, drag-drop, full page navigation).
    {
      name: "ui",
      testMatch: /ui\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
