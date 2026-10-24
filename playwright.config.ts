import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/capture",
  outputDir: "./.playwright/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm --filter @velachess/web dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "account",
      testDir: "./e2e/account",
      // A cold dev server compiles the settings route on first visit.
      expect: { timeout: 30_000 },
      use: {
        ...devices["Desktop Chrome"],
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
    {
      name: "site-capture",
      testDir: "./e2e/capture",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "analysis-review",
      testDir: "./e2e/analysis",
      // A depth-14 pass over a real Worker outlasts the 30s/5s defaults,
      // and every wait here is an auto-retrying assertion rather than a
      // sleep.
      timeout: 120_000,
      expect: { timeout: 30_000 },
      use: {
        ...devices["Desktop Chrome"],
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
  ],
});
