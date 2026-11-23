import { expect, test, type Locator } from "@playwright/test";
import { captureFrom } from "../../extension/src/capture";
import { GAMES } from "../../extension/src/games";
import type { RecordOf } from "../../src/record";
import { liveRecord, liveResponse, liveStorage } from "../../test/wordle-live";
import { open, withState } from "./harness";

/** dailies#11: the day QA won as a guest, mid-afternoon in New York. */
const DAY = "2026-11-23";
const LIVE_NOW = new Date("2026-11-23T20:00:00Z");

/** The record the extension logs from a live guest win: storage plus the solution the XHR hook passed on. */
const record = captureFrom(GAMES.find((g) => g.id === "wordle")!, { storage: liveStorage(DAY), responses: [liveResponse(DAY)], page: {}, indexedDB: {} }) as RecordOf<"wordle">;

const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const LIGHT = { correct: "#6aaa64", present: "#c9b458", absent: "#787c7e" };
const DARK = { correct: "#538d4e", present: "#b59f3b", absent: "#3a3a3c" };

test("a live guest Wordle win draws colored tiles in the today strip and the Wordle card (dailies#11)", async ({ page }) => {
  expect(record).toEqual(liveRecord(DAY));
  await open(page, { ext: withState({ records: [record], misses: [], lastLogAt: LIVE_NOW.toISOString() }) });
  // The harness pins the fixtures' day; move to the live day so this record is today's.
  await page.clock.setFixedTime(LIVE_NOW);
  await page.reload();
  await page.locator("main[data-status]:not([data-status=loading])").waitFor();

  const row = page.locator('.row[data-game="wordle"]');
  await expect(row.locator(".status")).toHaveText("Played");
  await expect(row.locator(".result")).toHaveText("2/6");
  // One strip tile per guess: a row with yellows, then the all-green win.
  const strip = row.locator(".strip > .tile");
  await expect(strip).toHaveCount(2);
  expect([await bg(strip.nth(0)), await bg(strip.nth(1))]).toEqual([rgb(LIGHT.present), rgb(LIGHT.correct)]);

  await row.locator(".disclosure").click();
  const tiles = row.locator(".card [data-tiles] [data-tile]");
  await expect(tiles).toHaveCount(30);
  const palette = (await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)) ? DARK : LIGHT;
  for (const [r, marks] of record.detail.evaluations.entries()) {
    for (const [i, mark] of marks.entries()) {
      await expect(tiles.nth(r * 5 + i)).toHaveAttribute("data-mark", mark);
      expect(await bg(tiles.nth(r * 5 + i))).toBe(rgb(palette[mark]));
    }
  }
  expect(await tiles.nth(10).getAttribute("data-mark")).toBe("empty");
});
