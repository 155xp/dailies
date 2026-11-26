import { expect, test, type Page } from "@playwright/test";
import { GAMES } from "../src/games";
import { BASE, open, WEEK, withState } from "./harness";

const row = (page: Page, id: string) => page.locator(`.row[data-game="${id}"]`);
const title = (page: Page) => page.locator("#today-title");
const search = (page: Page) => new URL(page.url()).search;
const prev = (page: Page) => page.getByRole("button", { name: "Previous day" });
const next = (page: Page) => page.getByRole("button", { name: "Next day" });

test.describe("day view", () => {
  test("today has no day in the URL, Next is disabled, and Previous opens yesterday with its own results", async ({ page }) => {
    await open(page, { ext: withState(WEEK) });
    await expect(title(page)).toHaveText("Today");
    expect(search(page)).toBe("");
    await expect(next(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveCount(0);
    await expect(row(page, "wordle").locator(".result")).toHaveText("3/6");

    await prev(page).click();
    await expect(title(page)).toHaveText("Yesterday");
    await expect(page.locator(".today-head .meta")).toHaveText("Saturday, November 21");
    expect(search(page)).toBe("?day=2026-11-21");
    await expect(next(page)).toBeEnabled();
    await expect(row(page, "wordle").locator(".result")).toHaveText("X/6");
    await expect(row(page, "travle").locator(".status")).toHaveText("Played");
    await expect(row(page, "spelling-bee").locator(".status")).toHaveText("Played, not logged");
    await expect(row(page, "mini").locator(".status")).toHaveText("Not played");
    // The nudge to play is for today only.
    await expect(page.locator(".hint")).toHaveCount(0);

    await next(page).click();
    await expect(title(page)).toHaveText("Today");
    expect(search(page)).toBe("");
  });

  test("an older day is titled by its date with how long ago under it, and Today brings the view back", async ({ page }) => {
    await open(page, { ext: withState(WEEK), search: "?day=2026-11-20" });
    await expect(title(page)).toHaveText("Friday, November 20");
    await expect(page.locator(".today-head .meta")).toHaveText("2 days ago");
    await expect(row(page, "krillion").locator(".result")).toHaveText("405 points");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(title(page)).toHaveText("Today");
    expect(search(page)).toBe("");
  });

  test("the left and right arrow keys page days; Right stops at today; arrows on a chart stay the chart's", async ({ page }) => {
    await open(page, { ext: withState(WEEK) });
    await page.keyboard.press("ArrowRight");
    await expect(title(page)).toHaveText("Today");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(title(page)).toHaveText("Friday, November 20");
    expect(search(page)).toBe("?day=2026-11-20");
    await page.keyboard.press("ArrowRight");
    await expect(title(page)).toHaveText("Yesterday");

    await row(page, "wordle").getByRole("button", { name: "Details" }).click();
    const slider = row(page, "wordle").getByRole("slider");
    await slider.focus();
    const before = await slider.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowLeft");
    await expect(title(page)).toHaveText("Yesterday");
    expect(await slider.getAttribute("aria-valuenow")).not.toBe(before);
  });

  test("the selected day survives a reload; a future or malformed day falls back to today", async ({ page }) => {
    await open(page, { ext: withState(WEEK), search: "?day=2026-11-21" });
    await expect(title(page)).toHaveText("Yesterday");
    await page.reload();
    await expect(title(page)).toHaveText("Yesterday");
    await expect(row(page, "wordle").locator(".result")).toHaveText("X/6");

    for (const bad of ["?day=2026-11-30", "?day=2026-02-31", "?day=yesterday"]) {
      await page.goto(BASE + bad);
      await expect(title(page)).toHaveText("Today");
      expect(search(page)).toBe("");
    }
  });

  test("jumping to a date opens it, and Back returns to the day before the jump", async ({ page }) => {
    await open(page, { ext: withState(WEEK) });
    await expect(page.locator(".nav-pick input")).toHaveAttribute("max", "2026-11-22");
    await page.locator(".nav-pick input").fill("2026-11-18");
    await expect(title(page)).toHaveText("Wednesday, November 18");
    expect(search(page)).toBe("?day=2026-11-18");
    await expect(row(page, "connections").locator(".status")).toHaveText("Played");
    await page.goBack();
    await expect(title(page)).toHaveText("Today");
  });

  test("a day with nothing logged lists every game as not played, quietly", async ({ page }) => {
    await open(page, { ext: withState(WEEK), search: "?day=2026-11-19" });
    await expect(title(page)).toHaveText("Thursday, November 19");
    for (const g of GAMES) {
      await expect(row(page, g.id).locator(".status")).toHaveText("Not played");
      await expect(row(page, g.id).locator(".status")).toHaveClass(/idle/);
    }
    await expect(page.locator(".rows .disclosure")).toHaveCount(0);
  });

  test("a past day's card draws that day's record, with its history as it stood that day", async ({ page }) => {
    await open(page, { ext: withState(WEEK), search: "?day=2026-11-21" });
    await row(page, "wordle").getByRole("button", { name: "Details" }).click();
    const card = row(page, "wordle").locator(".card");
    await expect(card.locator("[data-figure]")).toHaveAttribute("data-value", "wordle figure X/6");
    await expect(card.locator("[data-guess-row][data-state=filled]")).toHaveCount(6);
    // Nov 20 (a 3) and Nov 21 (an X): today's game is not in the distribution yet.
    const bars = await card.locator("[data-bar]").evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));
    expect(bars.filter((h) => h !== "0%")).toHaveLength(2);
    // Paging keeps the card open on the next day's result.
    await next(page).click();
    await expect(card.locator("[data-figure]")).toHaveAttribute("data-value", "wordle figure 3/6");
  });

  test("a square in History opens its day, outlined in the grid; Back returns to today", async ({ page }) => {
    await open(page, { ext: withState(WEEK) });
    const sq = page.locator('[data-history-row="wordle"] .sq[aria-label*="November 21"]');
    await expect(sq).toHaveAttribute("href", /\?day=2026-11-21$/);
    await sq.click();
    await expect(title(page)).toHaveText("Yesterday");
    expect(search(page)).toBe("?day=2026-11-21");
    await expect(sq).toHaveAttribute("data-selected", "true");
    await expect(page.locator(".sq[data-selected]")).toHaveCount(GAMES.length);
    await expect(page.locator(".sq[data-today]:not([data-selected])")).toHaveCount(GAMES.length);
    await expect(title(page)).toBeFocused();
    await expect(title(page)).toBeInViewport();
    await page.goBack();
    await expect(title(page)).toHaveText("Today");
  });

  test("a played day in a game's 30-day list opens that day, a 44pt row on a phone", async ({ page }, info) => {
    await open(page, { ext: withState(WEEK) });
    await page.locator('[data-history-row="travle"] .hist-label').click();
    const link = page.locator(".days .day-link", { hasText: "Friday, November 20" });
    if (info.project.name.startsWith("390")) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(title(page)).toHaveText("Friday, November 20");
    await expect(link).toHaveAttribute("aria-current", "date");
  });

  test("day controls are 44pt targets on a phone and never move when Today appears", async ({ page }, info) => {
    await open(page, { ext: withState(WEEK) });
    const boxes = async () => Promise.all([prev(page), page.getByRole("button", { name: "Go to a date" }), next(page)].map(async (b) => (await b.boundingBox())!));
    const before = await boxes();
    await prev(page).click();
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
    expect(await boxes()).toEqual(before);
    if (info.project.name.startsWith("390")) {
      for (const b of [prev(page), next(page)]) {
        const hit = await b.evaluate((e) => {
          const r = e.getBoundingClientRect();
          const after = getComputedStyle(e, "::after");
          return { w: r.width - 2 * parseFloat(after.left), h: r.height - 2 * parseFloat(after.top) };
        });
        expect(hit.w).toBeGreaterThanOrEqual(44);
        expect(hit.h).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    }
  });
});
