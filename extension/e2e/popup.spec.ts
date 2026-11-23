import type { Page } from "@playwright/test";
import { PARSERS } from "../../src/parsers";
import type { DailyRecord } from "../../src/record";
import { loadCapture } from "../../test/capture";
import { checkGuards } from "./guards";
import { expect, loadFixture, readStore, serveFixture, test } from "./harness";

const NAMES = ["Krillion", "Travle", "enclose.horse", "Wordle", "Connections", "Spelling Bee", "Mini Crossword", "Globle", "Songless"];

const fixture = (game: keyof typeof PARSERS, dir: string) => PARSERS[game](loadCapture(game, dir))!;
const ALL: DailyRecord[] = [
  fixture("krillion", "win-2026-11-22"),
  fixture("travle", "win-2026-11-22"),
  fixture("enclose-horse", "win-2026-11-22"),
  fixture("wordle", "win-2026-11-22"),
  fixture("connections", "win-2026-11-22"),
  fixture("spelling-bee", "partial-2026-11-22"),
  { game: "mini", date: "2026-11-22", puzzleNo: null, status: "won", score: 41, detail: { timeSeconds: 41 } },
  fixture("globle", "win-2026-11-22"),
  fixture("songless", "win-2026-11-22"),
];

/** Seed storage as if these games were logged (or missed) today, at fixed local times. */
async function seed(page: Page, logged: string[], missed: string[] = []) {
  await page.evaluate(
    async ({ all, logged, missed }) => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const at = (h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
      const records: Record<string, unknown> = {};
      const loggedAt: Record<string, string> = {};
      const misses: Record<string, unknown> = {};
      logged.forEach((game, i) => {
        const r = all.find((x) => x.game === game)!;
        records[`${game}:${today}`] = { ...r, date: today };
        loggedAt[`${game}:${today}`] = at(8 + i, (i * 13) % 60);
      });
      for (const game of missed) {
        misses[`${game}:${today}`] = { game, date: today, reason: "The result screen showed, but the saved result could not be read.", at: at(12, 5) };
      }
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ records, loggedAt, misses, ...(logged.length && { lastLogAt: at(9, 41) }) });
    },
    { all: ALL, logged, missed },
  );
}

const STATES: { name: string; logged: string[]; missed?: string[]; init?: string }[] = [
  { name: "empty", logged: [] },
  { name: "mixed", logged: ["krillion", "travle", "enclose-horse", "spelling-bee"], missed: ["wordle"] },
  { name: "all-logged", logged: ALL.map((r) => r.game) },
  { name: "loading", logged: [], init: "chrome.storage.local.get = () => new Promise(() => {});" },
  { name: "error", logged: [], init: "chrome.storage.local.get = () => Promise.reject(new Error('read failed'));" },
];

for (const scheme of ["light", "dark"] as const) {
  for (const s of STATES) {
    test(`popup ${s.name}, ${scheme}: 360px wide and passes every visual guard`, async ({ extPage: page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 640 });
      await seed(page, s.logged, s.missed);
      if (s.init) await page.addInitScript(s.init);
      await page.reload();
      await page.waitForLoadState("load");

      expect(await page.evaluate(() => document.body.getBoundingClientRect().width)).toBe(360);
      if (s.name === "error") {
        await expect(page.getByText("Could not read your results.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      } else {
        await expect(page.getByRole("link")).toHaveText(NAMES);
        if (s.name === "loading") await expect(page.locator("[aria-busy=true]")).toHaveCount(1);
        else {
          await expect(page.getByText(/^Logged \d{1,2}:\d{2}\s?[AP]M$/)).toHaveCount(s.logged.length);
          await expect(page.getByText("Played, not logged")).toHaveCount(s.missed?.length ?? 0);
          await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(s.missed?.length ?? 0);
          await expect(page.getByText("Not played yet")).toHaveCount(9 - s.logged.length - (s.missed?.length ?? 0));
        }
      }
      // Body 17px or more, meta 13px or more, one weight.
      const type = await page.evaluate(() => {
        const els = [...document.body.querySelectorAll("*")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()));
        return els.map((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), weight: getComputedStyle(e).fontWeight, row: !!e.closest("a") }));
      });
      expect(type.every((t) => t.size >= 13)).toBe(true);
      expect(type.filter((t) => t.row).every((t) => t.size >= 17)).toBe(true);
      expect(new Set(type.map((t) => t.weight)).size).toBe(1);

      expect(await checkGuards(page)).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`popup-${s.name}-${scheme}.png`), fullPage: true });
    });
  }
}

test("game names are links that open the game in a new tab, with hover and focus states", async ({ extPage: page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const links = page.getByRole("link");
  await expect(links).toHaveCount(9);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  await expect(links.nth(3)).toHaveAttribute("href", "https://www.nytimes.com/games/wordle/index.html");

  const first = links.first();
  const color = () => first.evaluate((e) => getComputedStyle(e).textDecorationLine + " " + getComputedStyle(e).textDecorationColor);
  const before = await color();
  await first.hover();
  await expect.poll(color).not.toBe(before);

  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  expect(await first.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
});

test("reduced motion swaps movement for a short opacity fade", async ({ extPage: page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, [], ["wordle"]);
  await page.reload();
  const transition = await page.getByRole("button", { name: "Retry" }).evaluate((e) => getComputedStyle(e).transitionProperty);
  expect(transition).not.toMatch(/transform|all/);
});

test("played, not logged: the result shows but nothing is saved in time, the popup says so, and Retry logs it", async ({ context, page, extPage }) => {
  type Fix = { __finish: (o?: { save?: boolean }) => Promise<void>; __save: (viaSetItem?: boolean) => void };
  const f = loadFixture("wordle/win-2026-11-22");
  await serveFixture(context, f);
  await page.goto(f.url);
  // The result screen shows, but the game has not saved; the player clicks on the screen.
  await page.evaluate(() => (window as unknown as Fix).__finish({ save: false }));
  await page.mouse.click(5, 5);
  await expect.poll(async () => Object.values((await readStore(extPage)).misses ?? {}).map((m) => m.game), { timeout: 5000 }).toEqual(["wordle"]);
  expect((await readStore(extPage)).records ?? {}).toEqual({});

  await extPage.setViewportSize({ width: 360, height: 640 });
  await extPage.reload();
  await expect(extPage.getByText("Played, not logged")).toBeVisible();
  await expect(extPage.getByText(/game saved no result/)).toBeVisible();
  await extPage.screenshot({ path: test.info().outputPath("popup-missed.png"), fullPage: true });

  // The game saves late, by property assignment, which the setItem hook cannot see. Retry reads it once.
  await page.evaluate(() => (window as unknown as Fix).__save(false));
  await extPage.getByRole("button", { name: "Retry" }).click();
  await expect(extPage.getByText(/^Logged \d{1,2}:\d{2}\s?[AP]M$/)).toHaveCount(1);
  await expect(extPage.getByText("Played, not logged")).toHaveCount(0);
  const store = await readStore(extPage);
  expect(Object.keys(store.records ?? {})).toEqual(["wordle:2026-11-22"]);
  expect(store.misses).toEqual({});
  await extPage.screenshot({ path: test.info().outputPath("popup-after-retry.png"), fullPage: true });
});
