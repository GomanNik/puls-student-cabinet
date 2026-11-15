import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { existsSync } from "node:fs";
config({ path: ".env.test.local", override: true, quiet: true });
const browserPath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync);
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0, timeout: 30000,
  globalSetup: "./tests/e2e/setup.ts", reporter: "list",
  use: { baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true, trace: "off", screenshot: "off", video: "off",
    launchOptions: browserPath ? { executablePath: browserPath } : {},
  },
  webServer: { command: "node scripts/e2e-server.mjs", url: `${process.env.APP_ORIGIN}/api/health/live`, ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 60000 },
});
