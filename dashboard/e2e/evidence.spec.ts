import { join } from "node:path";
import { test } from "@playwright/test";
import { open, STATES, withState } from "./harness";

/** Evidence only: 3x zoom stills and a frame-by-frame look at the motion. Runs once per scheme at 1440. */
const OUT = join(import.meta.dirname, "..", "test-results", "screens");

test.describe("evidence", () => {
  test.beforeEach(() => test.skip(!test.info().project.name.startsWith("1440"), "1440 only"));

  test("3x zooms of a tile strip, a card corner and a chart edge", async ({ browser }, info) => {
    const scheme = info.project.name.split("-")[1] as "light" | "dark";
    const context = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1440, height: 900 }, colorScheme: scheme, locale: "en-US", timezoneId: "America/New_York" });
    const page = await context.newPage();
    await open(page, { ext: withState(STATES.done) });
    const tiles = page.locator('.row[data-game="krillion"] .tile');
    const [first, last] = [(await tiles.first().boundingBox())!, (await tiles.last().boundingBox())!];
    await page.screenshot({ path: join(OUT, `zoom-strip-${scheme}.png`), clip: { x: first.x - 6, y: first.y - 6, width: last.x + last.width - first.x + 12, height: first.height + 12 } });
    await page.locator(".hist-card").scrollIntoViewIfNeeded();
    const grid = (await page.locator(".hist-card").boundingBox())!;
    await page.screenshot({ path: join(OUT, `zoom-chart-edge-${scheme}.png`), clip: { x: grid.x + grid.width - 140, y: grid.y - 8, width: 148, height: 120 } });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    const card = (await page.locator('.row[data-game="wordle"] .card').boundingBox())!;
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `zoom-card-corner-${scheme}.png`), clip: { x: card.x - 8, y: card.y - 8, width: 120, height: 72 } });
    await context.close();
  });

  test("frame by frame: card expand at a twentieth of real speed, and a recorded pass over every motion", async ({ browser }, info) => {
    test.skip(info.project.name !== "1440-light", "once");
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "America/New_York", recordVideo: { dir: join(OUT, "video"), size: { width: 1440, height: 900 } } });
    const page = await context.newPage();
    await open(page, { ext: withState(STATES.done) });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
    const row = (await page.locator('.row[data-game="wordle"]').boundingBox())!;
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    for (let i = 0; i < 16; i++) {
      await page.screenshot({ path: join(OUT, "frames", `expand-${String(i).padStart(2, "0")}.png`), clip: { x: row.x, y: row.y, width: 420, height: 200 } });
      await page.waitForTimeout(200);
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await page.locator('.row[data-game="travle"] a.link').hover();
    await page.waitForTimeout(400);
    await page.locator('[data-history-row="globle"] .sq[data-today]').hover();
    await page.waitForTimeout(400);
    const pill = (await page.locator(".pill").boundingBox())!;
    await page.mouse.move(pill.x + 20, pill.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(400);
    await context.close();
  });
});
