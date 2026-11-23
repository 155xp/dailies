import { expect, test } from "@playwright/test";
import { GAMES } from "../src/games";
import { open, STATES, withState } from "./harness";

const phone = (name: string) => name.startsWith("390");

test.describe("3c history", () => {
  test("9 games by the last 30 days, 12px squares with a 4px gap", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const rows = page.locator(".history [data-history-row]");
    await expect(rows).toHaveCount(9);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-history-row")))).toEqual(GAMES.map((g) => g.id));
    const squares = rows.first().locator(".sq");
    await expect(squares).toHaveCount(30);
    const [a, b] = [(await squares.nth(0).boundingBox())!, (await squares.nth(1).boundingBox())!];
    expect([a.width, a.height, b.x - a.x]).toEqual([12, 12, 16]);
  });

  test("played squares carry the game color and an aria-label with game, date and result; unplayed are wells", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const played = page.locator('[data-history-row="wordle"] .sq[data-played]');
    await expect(played).toHaveCount(1);
    await expect(played).toHaveAttribute("aria-label", "Wordle, Sunday, November 22, 3/6");
    expect(await played.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(106, 170, 100)");
    const unplayed = page.locator('[data-history-row="wordle"] .sq:not([data-played])').first();
    expect(await unplayed.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgb(106, 170, 100)");
    for (const sq of await page.locator(".sq[data-played]").all()) await expect(sq).toHaveAttribute("aria-label", /^.+, \w+day, November 22, .+$/);
  });

  test("today's column is outlined, so meaning never rests on color alone", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const today = page.locator(".sq[data-today]");
    await expect(today).toHaveCount(9);
    for (const sq of await today.all()) expect(await sq.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none");
    expect(await page.locator(".sq:not([data-today])").first().evaluate((e) => getComputedStyle(e).boxShadow)).not.toMatch(/0px 0px 0px 2px/);
  });

  test("hover or focus on a square shows its date and result", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.done) });
    const sq = page.locator('[data-history-row="connections"] .sq[data-today]');
    await sq.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Sun, Nov 22 · 1 mistake");
    await sq.blur();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    if (!phone(info.project.name)) {
      await page.locator('[data-history-row="travle"] .sq').first().hover();
      await expect(page.getByRole("tooltip")).toHaveText("Sat, Oct 24 · Not played");
    }
  });

  test("current and best streak sit at the right of the History title, and each game shows its own streak", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const title = (await page.getByRole("heading", { name: "History" }).boundingBox())!;
    for (const label of ["Current streak 1", "Best streak 1"]) {
      const fig = (await page.locator(`[data-value="${label}"]`).boundingBox())!;
      expect(fig.x).toBeGreaterThan(title.x + title.width);
      expect(Math.abs(fig.y - title.y)).toBeLessThan(24);
    }
    for (const g of GAMES) await expect(page.locator(`[data-history-row="${g.id}"] .streak`)).toHaveText("Streak 1");
  });

  test("at 390 the grid scrolls in its own container, last 14 days first, no page scroll", async ({ page }, info) => {
    test.skip(!phone(info.project.name), "phone only");
    await open(page, { ext: withState(STATES.done) });
    const box = page.locator(".history [data-scroll-x]");
    const m = await box.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, left: e.scrollLeft, r: e.getBoundingClientRect() }));
    expect(m.sw).toBeGreaterThan(m.cw);
    expect(m.left).toBeGreaterThan(0);
    const squares = page.locator('[data-history-row="krillion"] .sq');
    for (const i of [16, 29]) {
      const s = (await squares.nth(i).boundingBox())!;
      const label = (await page.locator('[data-history-row="krillion"] .hist-label').boundingBox())!;
      expect(s.x).toBeGreaterThanOrEqual(label.x + label.width);
      expect(s.x + s.width).toBeLessThanOrEqual(m.r.right);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test("each history row is a 44pt tap target that opens its last 30 days, no hover needed", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const label = page.locator('[data-history-row="wordle"] .hist-label');
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(label).toHaveAttribute("aria-expanded", "false");
    await label.click();
    await expect(label).toHaveAttribute("aria-expanded", "true");
    const days = page.locator(".days");
    await expect(days.getByRole("heading")).toHaveText("Wordle, last 30 days");
    await expect(days).toContainText("Sunday, November 22");
    await expect(days).toContainText("3/6");
    await expect(days).toContainText("Played 1 of 30 days");
  });
});
