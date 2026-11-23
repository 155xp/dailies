import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]] : "list",
  use: { trace: "retain-on-failure" },
});
