import { expect, test } from "@playwright/test";
import { GAMES } from "../src/games";
import { open, STATES, withState } from "./harness";

const row = (page: import("@playwright/test").Page, id: string) => page.locator(`.row[data-game="${id}"]`);
const fine = (name: string) => !name.startsWith("390");

test.describe("3a shell and today rows", () => {
  test("page title Dailies with the extension pill at its right; Today with the date over a left-aligned 1200px column", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.partial) });
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveText("Dailies");
    await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
    await expect(page.locator(".today-head .meta")).toHaveText("Sunday, November 22");
    const t = (await title.boundingBox())!;
    const pill = (await page.locator(".pill").boundingBox())!;
    expect(pill.x).toBeGreaterThan(t.x + t.width);
    expect(Math.abs(pill.y - t.y)).toBeLessThan(16);
    const list = (await page.locator(".rows").boundingBox())!;
    if (info.project.name.startsWith("1440")) {
      expect(list.x).toBe(48);
      expect(list.width).toBe(1200);
    }
    if (info.project.name.startsWith("390")) expect(list.x).toBe(20);
  });

  test("ten rows in the fixed game order, each name an <a> to the game in a new tab, at least 44px tall", async ({ page }) => {
    await open(page, { ext: withState(STATES.partial) });
    const rows = page.locator(".rows > .row");
    await expect(rows).toHaveCount(GAMES.length);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-game")))).toEqual(GAMES.map((g) => g.id));
    for (const g of GAMES) {
      const a = row(page, g.id).locator("a.link").first();
      await expect(a).toHaveText(g.name);
      await expect(a).toHaveAttribute("href", g.url);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", "noopener");
      await expect(a.locator("svg")).toHaveCount(1);
      expect((await row(page, g.id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(fine(test.info().project.name) ? 24 : 44);
    }
  });

  test("each row shows Played with a tile strip, Not played yet, or Played, not logged", async ({ page }) => {
    await open(page, { ext: withState(STATES.partial) });
    const wordle = row(page, "wordle");
    await expect(wordle.locator(".status")).toHaveText("Played");
    await expect(wordle.locator("[data-tiles] > *")).toHaveCount(3);
    await expect(wordle.locator(".result")).toHaveText("3/6");
    await expect(row(page, "krillion").locator(".result")).toHaveText("50 points");
    await expect(row(page, "mini").locator(".status")).toHaveText("Not played yet");
    await expect(row(page, "mini").locator("[data-tiles]")).toHaveCount(0);
    const bee = row(page, "spelling-bee");
    await expect(bee.locator(".status")).toHaveText("Played, not logged");
    await expect(bee).toContainText("The result screen changed. Open Spelling Bee once more to retry");
    const red = await bee.locator(".status").evaluate((e) => getComputedStyle(e).color);
    const ink = await row(page, "mini").locator(".status").evaluate((e) => getComputedStyle(e).color);
    expect(red).not.toBe(ink);
  });

  test("rows never reorder when statuses change, and at desktop widths never move", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.partial) });
    const tops = () => page.locator(".rows > .row").evaluateAll((els) => els.map((e) => [e.getAttribute("data-game"), Math.round(e.getBoundingClientRect().top)] as const));
    const before = await tops();
    await page.evaluate((s) => (window as never as { __ext: { set(m: unknown): void } }).__ext.set({ kind: "state", state: s }), STATES.done);
    await expect(row(page, "globle").locator(".status")).toHaveText("Played");
    const after = await tops();
    expect(after.map(([g]) => g)).toEqual(before.map(([g]) => g));
    // At 390 a Not played yet row is one line (dailies#3), so a row grows by its second line when a result arrives.
    if (fine(info.project.name)) expect(after).toEqual(before);
  });

  test("game links: underline and ink step on hover over 150ms, 2px focus-visible ring", async ({ page }, info) => {
    await open(page, { ext: withState(STATES.partial) });
    const a = row(page, "travle").locator("a.link");
    const style = () => a.evaluate((e) => { const s = getComputedStyle(e); return { color: s.color, line: s.textDecorationColor, ring: `${s.outlineStyle} ${s.outlineWidth}`, t: s.transition }; });
    const rest = await style();
    expect(rest.t).toContain("color 0.15s");
    if (fine(info.project.name)) {
      await a.hover();
      await page.waitForTimeout(250);
      const hovered = await style();
      expect(hovered.color).not.toBe(rest.color);
      expect(hovered.line).not.toBe("rgba(0, 0, 0, 0)");
    }
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    while (!(await a.evaluate((e) => e === document.activeElement))) await page.keyboard.press("Tab");
    expect((await style()).ring).toBe("solid 2px");
  });
});
