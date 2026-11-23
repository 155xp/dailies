import { defineConfig } from "@playwright/test";

const widths = [1440, 1024, 390] as const;
const schemes = ["light", "dark"] as const;

/** Every visual test runs at three widths in both color schemes, against the built `dist`. */
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/output",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  use: { locale: "en-US", timezoneId: "America/New_York", deviceScaleFactor: 1 },
  projects: widths.flatMap((width) =>
    schemes.map((colorScheme) => ({
      name: `${width}-${colorScheme}`,
      use: { viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme, hasTouch: width === 390, isMobile: width === 390 },
    })),
  ),
});
