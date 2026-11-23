import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { RecordOf } from "../../src/record";
import { fixtureRecords } from "../fixture-records";
import { BASE, NOW, serve } from "./harness";

/**
 * Design review nit on dailies#13: with fewer than 3 Wordle games logged, the distribution must not fill the plot
 * as if it were a full one. Each game is drawn at a fixed unit, a third of the plot height (count width). From 3
 * games on, the chart scales to its tallest bar as before.
 */
const win = fixtureRecords().find((r) => r.game === "wordle") as RecordOf<"wordle">;
const day = (date: string, guesses: number): RecordOf<"wordle"> => ({
  ...win,
  date,
  score: guesses,
  detail: { ...win.detail, guesses: Array(guesses).fill("crane"), evaluations: Array(guesses).fill(["absent", "absent", "absent", "absent", "absent"]) },
});

async function openWordle(page: Page, history: RecordOf<"wordle">[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), { records: [win], history });
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Each bar's height as a share of the plot area its bars stand in. */
const shares = (page: Page) =>
  page.locator('.card[data-game="wordle"] [data-chart] .bars').evaluate((bars) => {
    const h = bars.getBoundingClientRect().height;
    return [...bars.querySelectorAll("[data-bar]")].map((b) => Math.round((b.getBoundingClientRect().height / h) * 100) / 100);
  });

test.describe("Wordle distribution with few games", () => {
  test("with one game the bar is a third of the plot, not its full height", async ({ page }) => {
    await openWordle(page, [win]);
    const s = await shares(page);
    expect(s).toHaveLength(7);
    expect(s[2]).toBeGreaterThan(0.25);
    expect(s[2]).toBeLessThan(0.45);
    expect(s.filter((_, i) => i !== 2)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("with two games each one adds a third", async ({ page }) => {
    await openWordle(page, [day("2026-11-21", 3), win]);
    const s = await shares(page);
    expect(s[2]).toBeGreaterThan(0.6);
    expect(s[2]).toBeLessThan(0.75);
  });

  test("with three or more games the chart scales to its tallest bar, as before", async ({ page }) => {
    await openWordle(page, [day("2026-11-19", 4), day("2026-11-20", 5), day("2026-11-21", 3), win]);
    // Counts: 3 guesses twice, 4 and 5 once each. The tallest fills the plot; the others are half of it.
    const s = await shares(page);
    expect(s[2]).toBeGreaterThan(0.97);
    expect(s[3]).toBeGreaterThan(0.45);
    expect(s[3]).toBeLessThan(0.55);
    expect(s[4]).toBeCloseTo(s[3]!, 2);
    await openWordle(page, [day("2026-11-20", 4), day("2026-11-21", 5), win]);
    // Three games, one per bar: every played bar fills the plot, as it did before the change.
    const t = await shares(page);
    expect([t[2], t[3], t[4]].every((v) => v! > 0.97)).toBe(true);
  });

  test("evidence: the Wordle card with one game", async ({ page }, info) => {
    test.skip(info.project.name.startsWith("1024"), "1440 and 390");
    await openWordle(page, [win]);
    const [width, scheme] = info.project.name.split("-");
    await page.locator('.card[data-game="wordle"]').screenshot({ path: join(import.meta.dirname, "..", "test-results", "screens", "13", `wordle-one-game-${width}-${scheme}.png`) });
  });
});
