import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** Evidence only, for dailies#13: stills of the Wordle, enclose.horse and Krillion cards, and the palette setting. */
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "13");

async function openCards(page: Page, contrast: "more" | "no-preference") {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ contrast });
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe("evidence 13", () => {
  test.beforeEach(() => test.skip(test.info().project.name.startsWith("1024"), "1440 and 390"));

  test("Wordle, enclose.horse and Krillion cards, then Wordle and Krillion in the high-contrast palette", async ({ page }, info) => {
    const [width, scheme] = info.project.name.split("-");
    await openCards(page, "no-preference");
    for (const game of ["wordle", "enclose-horse", "krillion"]) {
      await page.locator(`.card[data-game="${game}"]`).screenshot({ path: join(OUT, `${game}-${width}-${scheme}.png`) });
    }
    if (width !== "1440") return;
    await openCards(page, "more");
    for (const game of ["wordle", "krillion"]) {
      await page.locator(`.card[data-game="${game}"]`).screenshot({ path: join(OUT, `${game}-contrast-${width}-${scheme}.png`) });
    }
  });

  test("the palette setting on the dashboard, off and on", async ({ page }, info) => {
    const [width, scheme] = info.project.name.split("-");
    await open(page, { ext: withState(STATES.done) });
    const setting = page.locator(".setting");
    await setting.scrollIntoViewIfNeeded();
    await setting.screenshot({ path: join(OUT, `setting-off-${width}-${scheme}.png`) });
    await page.getByRole("switch", { name: "High-contrast colors" }).click();
    await page.waitForTimeout(300);
    await setting.screenshot({ path: join(OUT, `setting-on-${width}-${scheme}.png`) });
  });
});
