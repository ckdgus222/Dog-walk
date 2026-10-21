import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  retries: 0,
  use: {
    baseURL: process.env.BROWSER_TEST_URL ?? "http://localhost",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
