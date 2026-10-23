import { defineConfig, devices } from "@playwright/test";
import { INTRO_SEEN_KEY } from "./app/_components/intro-seen";

const baseURL = process.env.BROWSER_TEST_URL ?? "http://localhost";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  retries: 0,
  use: {
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: INTRO_SEEN_KEY, value: "1" }],
        },
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
