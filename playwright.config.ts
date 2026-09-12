import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// ADR 0028 review (Correction Pass 3, item 1) — E2E test safety, P0.
// Load ONLY the dedicated test env file. Never `.env.local` /
// `.env.production.local`, so the suite can never inherit production
// credentials. There is no production baseURL fallback.
loadEnv({ path: ".env.test.local", override: false });

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
if (/epetrecere\.md/i.test(baseURL)) {
  throw new Error("Playwright baseURL points at production — refusing. Set E2E_BASE_URL to a disposable environment.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared test-data invariants: run sequentially
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
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
