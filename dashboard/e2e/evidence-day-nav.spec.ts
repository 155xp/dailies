import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { open, WEEK, withState } from "./harness";

/** Evidence only, for the day view: today, a past day with its cards open, and a day with nothing logged, from five seeded days. */
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "day-nav");

const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

async function openCards(page: Page, games: string[]) {
  for (const g of games) await page.locator(`.row[data-game="${g}"] .disclosure`).click();
  await expect(page.locator("[data-geo-placeholder]")).toHaveCount(0);
  await settle(page);
  await page.mouse.move(0, 0);
}

test.describe("evidence day view", () => {
  test.beforeEach(() => test.skip(test.info().project.name.startsWith("1024"), "1440 and 390"));

  test("today, a past day, an empty day, and a day opened from History", async ({ page }, info) => {
    const [width, scheme] = info.project.name.split("-");
    const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}-${width}-${scheme}.png`), fullPage: true });

    await open(page, { ext: withState(WEEK) });
    await shot("today");

    await open(page, { ext: withState(WEEK), search: "?day=2026-11-21" });
    await openCards(page, ["travle", "enclose-horse", "wordle", "globle"]);
    await shot("past-day");

    await open(page, { ext: withState(WEEK), search: "?day=2026-11-19" });
    await shot("empty-day");

    await open(page, { ext: withState(WEEK) });
    await page.locator('[data-history-row="wordle"] .sq[aria-label*="November 20"]').click();
    await expect(page.locator("#today-title")).toHaveText("Friday, November 20");
    await page.waitForTimeout(600);
    await page.mouse.move(0, 0);
    await page.locator(".history").screenshot({ path: join(OUT, `history-selected-${width}-${scheme}.png`) });
  });
});
