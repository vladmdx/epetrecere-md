import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// E2E runs against the LIVE site by default so we verify what real users hit.
// Override with E2E_BASE_URL for local dev server runs.
loadEnv({ path: ".env.production.local", override: false });
loadEnv({ path: ".env.local", override: false });

const baseURL = process.env.E2E_BASE_URL || "https://epetrecere.md";

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
