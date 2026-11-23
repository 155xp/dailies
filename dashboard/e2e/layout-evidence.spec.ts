import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** Evidence only: the stills in docs/evidence/layout, one set per project (1440, 1024, 390; light and dark). */
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "layout");
const settle = async (page: Page) => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));
};
const clipBetween = async (page: Page, from: string, to: string) => {
  const [a, b] = [(await page.locator(from).boundingBox())!, (await page.locator(to).boundingBox())!];
  const x = Math.max(0, a.x - 16);
  return { x, y: Math.max(0, a.y - 16), width: Math.min(page.viewportSize()!.width - x, a.width + 32), height: b.y + b.height - a.y + 32 };
};

test.describe("layout evidence", () => {
  test("dashboard with Krillion and enclose.horse expanded", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.done) });
    for (const g of ["krillion", "enclose-horse"]) await page.locator(`.row[data-game="${g}"] .disclosure`).click();
    await settle(page);
    await page.screenshot({ path: join(OUT, `dashboard-expanded-${info.project.name}.png`), fullPage: true });
  });

  test("the /cards/ preview", async ({ page }, info) => {
    await serve(page);
    await page.clock.setFixedTime(NOW);
    await page.goto(BASE + "cards/index.html");
    await page.locator("main[data-status=ready]").waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await settle(page);
    await page.screenshot({ path: join(OUT, `cards-${info.project.name}.png`), fullPage: true });
  });

  test("History with Today above it", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.done) });
    await settle(page);
    await page.screenshot({ path: join(OUT, `history-today-${info.project.name}.png`), fullPage: true, clip: await clipBetween(page, ".rows", ".history") });
  });

  test("Not played yet rows at 390", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("390"), "390 only");
    await open(page, { ext: withState(STATES.partial) });
    await settle(page);
    await page.screenshot({ path: join(OUT, `unplayed-rows-${info.project.name}.png`), fullPage: true, clip: await clipBetween(page, ".rows", ".rows") });
  });
});
