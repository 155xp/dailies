import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, serve } from "./harness";

/** Spamle: the day's gumballs by round, the rarity breakdown, and where a finished Daily landed. */
const win = fixtureRecord("spamle", "win-2026-11-23");
const partial = fixtureRecord("spamle", "partial-2026-11-23");

/** The game's rarity colors, Common to Legendary (fixtures/spamle/win-2026-11-23/colors.json). */
const RARITY = ["#b8b4c8", "#5ddc6a", "#7cc8ff", "#b06cff", "#ffd23f"];
const IDS = ["common", "uncommon", "rare", "epic", "legendary"];

async function openCards(page: Page, records: DailyRecord[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), { records });
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const card = (page: Page) => page.locator('.card[data-game="spamle"]');
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const fill = (l: Locator) => l.evaluate((el) => getComputedStyle(el).fill);

const contrast = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = c.match(/[\d.]+/g)!.map(Number);
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test.describe("Spamle card", () => {
  test("the figure is the day's points, with gumballs and the game's TOP % beside it", async ({ page }) => {
    await openCards(page, [win]);
    await expect(card(page).locator("[data-figure] .figure")).toHaveText("146");
    await expect(card(page).locator("[data-figure] .figure-label")).toHaveText("53 gumballs · Top 5% today");
    await expect(card(page).locator("[data-caption]")).toHaveText("Better than 95% of the 2,429 other players who finished today");
  });

  test("the legend is the rarity breakdown, each with its ball in the game's color", async ({ page }) => {
    await openCards(page, [win]);
    const items = card(page).locator("[data-legend]");
    await expect(items).toHaveCount(5);
    expect(await items.evaluateAll((els) => els.map((e) => e.textContent))).toEqual(["15Common", "4Uncommon", "18Rare", "11Epic", "5Legendary"]);
    for (let i = 0; i < 5; i++) expect(await fill(items.nth(i).locator(".body"))).toBe(rgb(RARITY[i]!));
  });

  test("one row per round: the prompt, its rating and points, and one ball per answer sized by rarity", async ({ page }) => {
    await openCards(page, [win]);
    const rounds = card(page).locator("[data-round]");
    await expect(rounds).toHaveCount(5);
    await expect(rounds.locator(".spam-q")).toHaveText(win.detail.rounds.map((r) => r.prompt!));
    await expect(rounds.locator(".spam-pts")).toHaveText(["28 pts", "31 pts", "30 pts", "27 pts", "30 pts"]);
    await expect(rounds.locator("[data-rating]")).toHaveText(Array(5).fill("Spamtastic"));
    for (let r = 0; r < 5; r++) {
      const balls = rounds.nth(r).locator("[data-ball]");
      expect(await balls.evaluateAll((els) => els.map((e) => e.getAttribute("data-rarity")))).toEqual(win.detail.rounds[r]!.answers.map((a) => a.rarity));
    }
    // Size steps with rarity: 10px Common to 18px Legendary.
    const sizes: Record<string, number> = {};
    for (const b of await card(page).locator("[data-round] [data-ball]").all()) sizes[(await b.getAttribute("data-rarity"))!] = (await b.boundingBox())!.width;
    expect(IDS.map((id) => sizes[id])).toEqual([10, 12, 14, 16, 18]);
    // Each round's balls are also read out as words.
    await expect(rounds.first().locator('[role="img"]')).toHaveAttribute("aria-label", /^Pop, Common; Rock, Common; .*Indigenous music of Canada, Legendary$/);
  });

  test("the readout starts on the day's rarest pull and arrow keys step through every answer", async ({ page }) => {
    await openCards(page, [win]);
    const tray = card(page).locator("[data-tray]");
    const readout = card(page).locator(".spam-readout");
    await expect(readout).toHaveText("Music genres: Indigenous music of Canada, Legendary, +5");
    await expect(card(page).locator("[data-ball][data-active]")).toHaveCount(1);
    await tray.focus();
    await page.keyboard.press("ArrowRight");
    await expect(readout).toHaveText("Pokémon types and moves: Fire, Common, +1");
    await page.keyboard.press("Home");
    await expect(readout).toHaveText("Music genres: Pop, Common, +1");
    await page.keyboard.press("End");
    await expect(readout).toHaveText("Countries with under 1 million people: Nauru, Epic, +4");
    expect(await tray.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  });

  test("pointing at a ball reads it out", async ({ page }, info) => {
    test.skip(!!info.project.use.isMobile, "fine pointer");
    await openCards(page, [win]);
    await card(page).locator('[data-round="4"] [data-index]').nth(3).hover();
    await expect(card(page).locator(".spam-readout")).toHaveText("Harry Potter characters: Vernon Dursley, Uncommon, +2");
  });

  test("the chart is everyone who finished in the game's 50-point buckets, with this score's bucket marked", async ({ page }) => {
    await openCards(page, [win]);
    const chart = card(page).locator("[data-chart]");
    await expect(chart.locator("[data-bar]")).toHaveCount(10);
    await expect(chart.locator("[data-own]")).toHaveCount(1);
    await expect(card(page).locator("[data-chart] ~ [data-readout]")).toHaveText("100 to 149 points: 317 players");
    await chart.focus();
    await page.keyboard.press("End");
    await expect(card(page).locator("[data-chart] ~ [data-readout]")).toHaveText("450 points and up: 5 players");
  });

  test("a partial Daily: its rounds, the rest open, no chart and no standing", async ({ page }) => {
    await openCards(page, [partial]);
    await expect(card(page).locator("[data-figure] .figure-label")).toHaveText("13 gumballs · 2 of 5 rounds");
    await expect(card(page).locator("[data-round]:not([data-open])")).toHaveCount(2);
    await expect(card(page).locator("[data-round][data-open]")).toHaveText(["Round 3Not played yet", "Round 4Not played yet", "Round 5Not played yet"]);
    await expect(card(page).locator("[data-rating]")).toHaveText(["Great", "Spamtastic"]);
    await expect(card(page).locator("[data-chart], [data-caption]")).toHaveCount(0);
    await expect(card(page).locator('[data-legend="epic"]')).toHaveAttribute("data-zero", "");
  });

  test("without the page's words, rounds fall back to their number and answers to the saved keys", async ({ page }) => {
    const bare = structuredClone(win);
    for (const r of bare.detail.rounds) Object.assign(r, { prompt: null, possible: null, great: null, top: null, rating: null });
    await openCards(page, [bare]);
    await expect(card(page).locator(".spam-q").first()).toHaveText("Round 1");
    await expect(card(page).locator("[data-rating]")).toHaveCount(0);
  });

  test("every ball's outline reaches 3:1 on the card, and every text 4.5:1", async ({ page }) => {
    await openCards(page, [win, partial]);
    const surface = await card(page).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const id of IDS) {
      const ball = card(page).first().locator(`[data-ball][data-rarity="${id}"]`).first();
      const edge = await ball.locator(".ring").evaluate((el) => getComputedStyle(el).fill);
      expect(contrast(edge, surface), id).toBeGreaterThanOrEqual(3);
    }
    const texts = await card(page).evaluateAll((cards) =>
      cards.flatMap((c) => {
        const out: { text: string; fg: string; bg: string }[] = [];
        const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent!.trim() || !n.parentElement!.checkVisibility()) continue;
          out.push({ text: n.textContent!.trim(), fg: getComputedStyle(n.parentElement!).color, bg: getComputedStyle(c).backgroundColor });
        }
        return out;
      }),
    );
    expect(texts.filter((t) => contrast(t.fg, t.bg) < 4.5)).toEqual([]);
  });

  test("passes every visual guard, and stills for the PR", async ({ page }, info) => {
    const dir = join(import.meta.dirname, "..", "test-results", "screens", "spamle");
    mkdirSync(dir, { recursive: true });
    for (const [name, record] of [["win", win], ["partial", partial]] as const) {
      await openCards(page, [record]);
      expect(await audit(page), name).toEqual(CLEAN);
      await card(page).screenshot({ path: join(dir, `spamle-${name}-${info.project.name}.png`) });
    }
  });
});
