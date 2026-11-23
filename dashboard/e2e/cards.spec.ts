import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord, RecordOf } from "../../src/record";
import { fixtureRecord, fixtureRecords } from "../fixture-records";
import { GAMES } from "../src/games";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, serve } from "./harness";

/** What the preview draws: today's records, plus the logged history the cards read their personal charts from. */
interface Preview {
  records: DailyRecord[];
  history?: DailyRecord[];
}

const PREVIEW = BASE + "cards/index.html";
/** The lazy map chunk. Blocking it shows the text and tile fallback these tests were written for. */
const GEO = /\/assets\/geo-[\w-]+\.js$/;
const real = fixtureRecords();
const byGame = <G extends DailyRecord["game"]>(g: G) => real.find((r) => r.game === g) as RecordOf<G>;

/**
 * SYNTHETIC: no Mini result exists in the fixtures (signed out the Mini never loads, fixtures/mini), so the
 * Mini card is drawn from this made-up record and week. It is used only here and named as such in the evidence.
 */
const miniDay = (date: string, timeSeconds: number): RecordOf<"mini"> => ({
  game: "mini",
  date,
  puzzleNo: null,
  status: "won",
  score: timeSeconds,
  detail: { timeSeconds },
});
const MINI_WEEK = [miniDay("2026-11-16", 95), miniDay("2026-11-17", 140), miniDay("2026-11-19", 72), miniDay("2026-11-20", 118), miniDay("2026-11-21", 101), miniDay("2026-11-22", 83)];
const ALL_NINE: Preview = { records: [...real, MINI_WEEK.at(-1)!], history: [...real, ...MINI_WEEK] };

async function openCards(page: Page, preview?: Preview) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  if (preview) await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), preview);
  await page.goto(PREVIEW);
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const card = (page: Page, game: DailyRecord["game"]) => page.locator(`.card[data-game="${game}"]`);
const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const dark = (page: Page) => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);

test.describe("each game has its own card, drawn from a real fixture", () => {
  test("all nine cards render in the fixed game order, each titled with a link to its game", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const cards = page.locator(".card");
    await expect(cards).toHaveCount(9);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-game")))).toEqual(GAMES.map((g) => g.id));
    for (const g of GAMES) {
      const a = card(page, g.id).locator(".card-title a");
      await expect(a).toHaveText(g.name);
      await expect(a).toHaveAttribute("href", g.url);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", "noopener");
    }
  });

  test("the default preview shows the eight games with a real result and no Mini card", async ({ page }) => {
    await openCards(page);
    await expect(page.locator(".card")).toHaveCount(8);
    await expect(card(page, "mini")).toHaveCount(0);
  });

  test("Krillion: seven rows of answer, tier tile in the verified color, tier, points and share", async ({ page }) => {
    await openCards(page);
    const record = byGame("krillion");
    const rows = card(page, "krillion").locator("[data-row]");
    await expect(rows).toHaveCount(7);
    const tiers: Record<string, string> = { plankton: "Plankton", tooclever: "Too Clever", schooler: "Schooler", rare: "Rare", deepcut: "Deep Cut", krillion: "One in a Krillion" };
    for (const [i, a] of record.detail.answers.entries()) {
      const row = rows.nth(i);
      await expect(row.locator(".prompt")).toHaveText(a.prompt);
      await expect(row.locator(".answer")).toHaveText(a.answer ?? "No answer");
      expect(await bg(row.locator("[data-swatch]"))).toBe(rgb(a.color));
      await expect(row.locator(".tier")).toHaveText(a.tier ? tiers[a.tier]! : "Missed");
      await expect(row.locator(".points")).toHaveText(`${a.points} pts`);
      if (a.sharePct !== null) await expect(row.locator(".share")).toHaveText(`${a.sharePct < 1 ? a.sharePct.toFixed(1) : Math.round(a.sharePct)}%`);
    }
    await expect(card(page, "krillion").locator("[data-figure] .figure")).toHaveText("405");
    await expect(card(page, "krillion").locator("[data-figure] .figure-label")).toHaveText("Deep cut");
    await expect(card(page, "krillion").locator("[data-caption]")).toHaveText("Better than 90% of today's players");
  });

  test("Krillion: a miss shows the miss tile and the word Missed", async ({ page }) => {
    const partial = fixtureRecord("krillion", "partial-2026-11-22");
    await openCards(page, { records: [partial] });
    const miss = card(page, "krillion").locator("[data-row]").nth(1);
    expect(await bg(miss.locator("[data-swatch]"))).toBe(rgb("#3d4f6e"));
    await expect(miss.locator(".tier")).toHaveText("Missed");
  });

  test("enclose.horse: the board is redrawn from the map with the player's walls", async ({ page }) => {
    await openCards(page);
    const record = byGame("enclose-horse");
    const cells = card(page, "enclose-horse").locator("[data-board] [data-cell]");
    await expect(cells).toHaveCount(record.detail.rows * record.detail.cols);
    const kinds = await cells.evaluateAll((els) => els.map((e) => e.getAttribute("data-cell")));
    const walls = kinds.flatMap((k, i) => (k === "wall" ? [i] : []));
    expect(walls).toEqual(record.detail.walls);
    const glyphs = record.detail.map.split("\n").join("");
    expect(kinds.filter((k, i) => k === "water" && glyphs[i] !== "~")).toEqual([]);
    expect(kinds[glyphs.indexOf("H")]).toBe("horse");
    expect(kinds.filter((k) => k === "enclosed").length).toBeGreaterThan(0);
  });

  test("enclose.horse: score of optimal on its medal color, histogram in the game's colors, rank line", async ({ page }) => {
    await openCards(page);
    const c = card(page, "enclose-horse");
    await expect(c.locator("[data-figure] .figure")).toHaveText("49 of 49");
    await expect(c.locator("[data-medal]")).toHaveText("PERFECT!");
    expect(await bg(c.locator("[data-medal]"))).toBe(rgb("#d4f4ff"));
    const own = c.locator("[data-chart] [data-bar][data-own]");
    await expect(own).toHaveCount(1);
    expect(await bg(own)).toBe(rgb("#3498db"));
    expect(await bg(c.locator("[data-chart] [data-bar]:not([data-own])").first())).toBe(rgb("#cccccc"));
    await expect(c.locator("[data-caption]")).toHaveText("Rank #1, top 1%");
  });

  test("enclose.horse: the board fits inside the card at every width", async ({ page }) => {
    await openCards(page);
    const c = card(page, "enclose-horse");
    const [box, board] = await Promise.all([c.boundingBox(), c.locator("[data-board]").boundingBox()]);
    expect(board!.x).toBeGreaterThanOrEqual(box!.x);
    expect(board!.x + board!.width).toBeLessThanOrEqual(box!.x + box!.width);
  });

  test("Wordle: a 5 by 6 grid of real tiles in Wordle's colors for the system theme, n/6 and a personal distribution", async ({ page }) => {
    await openCards(page);
    const record = byGame("wordle");
    const c = card(page, "wordle");
    const tiles = c.locator("[data-tiles] [data-tile]");
    await expect(tiles).toHaveCount(30);
    expect((await tiles.allTextContents()).join("")).toBe(record.detail.guesses.join("").toUpperCase());
    const palette = (await dark(page)) ? { correct: "#538d4e", present: "#b59f3b", absent: "#3a3a3c" } : { correct: "#6aaa64", present: "#c9b458", absent: "#787c7e" };
    for (const [r, row] of record.detail.evaluations.entries()) {
      for (const [i, mark] of row.entries()) expect(await bg(tiles.nth(r * 5 + i))).toBe(rgb(palette[mark]));
    }
    await expect(c.locator("[data-figure] .figure")).toHaveText("3/6");
    const bars = c.locator("[data-chart] [data-bar]");
    await expect(bars).toHaveCount(7);
    await expect(bars.nth(2)).toHaveAttribute("data-own", "");
    expect(await bg(bars.nth(2))).toBe(rgb(palette.correct));
  });

  test("Wordle: an unfinished game reads In progress and stays out of the finished-game distribution", async ({ page }) => {
    const win = byGame("wordle");
    const partial: RecordOf<"wordle"> = { ...win, date: "2026-11-23", status: "partial", score: 2, detail: { ...win.detail, guesses: win.detail.guesses.slice(0, 2), evaluations: win.detail.evaluations.slice(0, 2) } };
    await openCards(page, { records: [partial], history: [win, partial] });
    const c = card(page, "wordle");
    await expect(c.locator("[data-figure] .figure")).toHaveText("In progress");
    const bars = c.locator("[data-chart] [data-bar]");
    await expect(bars.locator("xpath=self::*[@data-own]")).toHaveCount(0);
    const heights = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.map((h) => h > 0)).toEqual([false, false, true, false, false, false, false]);
  });

  test("enclose.horse: the enclosed area follows portals, both into a far pocket and out to the edge", async ({ page }) => {
    const e = byGame("enclose-horse");
    const board = (map: string): RecordOf<"enclose-horse"> => ({ ...e, detail: { ...e.detail, map, cols: map.indexOf("\n"), rows: map.split("\n").length, walls: [] } });
    await openCards(page, { records: [board("~~~~~~~\n~H1~1.~\n~~~~~~~")] });
    const kinds = () => card(page, "enclose-horse").locator("[data-cell]").evaluateAll((els) => els.map((x) => x.getAttribute("data-cell")));
    expect((await kinds())[12]).toBe("enclosed");
    await openCards(page, { records: [board("~~~~~\n~H1~1\n~~~~~")] });
    expect((await kinds()).filter((k) => k === "enclosed")).toEqual([]);
  });

  test("Connections: a row per guess in the group colors, solved groups on their colors, mistakes", async ({ page }) => {
    await openCards(page);
    const record = byGame("connections");
    const c = card(page, "connections");
    const colors = ["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"];
    const rows = c.locator("[data-guess]");
    await expect(rows).toHaveCount(record.detail.guesses.length);
    for (const [r, g] of record.detail.guesses.entries()) {
      const tiles = rows.nth(r).locator("[data-tile]");
      await expect(tiles).toHaveCount(4);
      for (const [i, level] of g.levels.entries()) expect(await bg(tiles.nth(i))).toBe(rgb(colors[level]!));
    }
    const groups = c.locator("[data-group]");
    await expect(groups).toHaveCount(record.detail.solved.length);
    for (const [i, level] of record.detail.solved.entries()) {
      expect(await bg(groups.nth(i))).toBe(rgb(colors[level]!));
      const words = record.detail.guesses.find((g) => g.correct && g.levels[0] === level)!.words;
      await expect(groups.nth(i).locator(".words")).toHaveText(words.join(", "));
    }
    await expect(c.locator("[data-figure] .figure")).toHaveText("1");
    await expect(c.locator("[data-figure] .figure-label")).toHaveText("Mistake");
  });

  test("Spelling Bee: a ten step ladder filled in the Bee yellow to the rank, rank name and points", async ({ page }) => {
    await openCards(page);
    const c = card(page, "spelling-bee");
    const steps = c.locator("[data-ladder] [data-step]");
    await expect(steps).toHaveCount(10);
    const on = await steps.evaluateAll((els) => els.map((e) => e.hasAttribute("data-on")));
    expect(on).toEqual([true, true, true, true, true, false, false, false, false, false]);
    expect(await bg(steps.first())).toBe(rgb("#f7da21"));
    await expect(c.locator("[data-rank]")).toHaveText("Solid");
    await expect(c.locator("[data-figure]")).toContainText("37 of 224 points");
    await expect(c).toContainText("4 words");
    await expect(c).toContainText("1 pangram");
  });

  test("Mini (synthetic record): solve time as m:ss and a seven day chart in the Mini blue with today marked", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const c = card(page, "mini");
    await expect(c.locator("[data-figure] .figure")).toHaveText("1:23");
    const bars = c.locator("[data-chart] [data-bar]");
    await expect(bars).toHaveCount(7);
    await expect(bars.nth(6)).toHaveAttribute("data-own", "");
    expect(await bg(bars.nth(6))).toBe(rgb("#95befa"));
    await expect(c.locator("[data-readout]")).toHaveText("Today: 1:23");
  });

  test("Globle (no map): guess tiles by distance bucket, wrapping at eight, with guesses, streak and average", async ({ page }) => {
    await page.route(GEO, (route) => route.abort());
    await openCards(page);
    const record = byGame("globle");
    const c = card(page, "globle");
    const tiles = c.locator("[data-tiles] [data-tile]");
    await expect(tiles).toHaveCount(9);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-heat")))).toEqual(record.detail.heat);
    expect(await bg(tiles.nth(8))).toBe("rgb(0, 128, 0)");
    const [first, ninth] = await Promise.all([tiles.nth(0).boundingBox(), tiles.nth(8).boundingBox()]);
    expect(ninth!.y).toBeGreaterThan(first!.y);
    expect(ninth!.x).toBe(first!.x);
    await expect(c.locator("[data-figure] .figure")).toHaveText("9");
    await expect(c).toContainText("Streak 1");
    await expect(c).toContainText("Average 9.0");
  });

  test("Travle (no map): guess tiles in the four rating roles and +N", async ({ page }) => {
    await page.route(GEO, (route) => route.abort());
    await openCards(page);
    const record = byGame("travle");
    const c = card(page, "travle");
    const tiles = c.locator("[data-tiles] [data-tile]");
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-rating")))).toEqual(record.detail.guesses.map((g) => g.rating));
    expect(await tiles.allTextContents()).toEqual(record.detail.guesses.map((g) => g.country));
    await expect(c.locator("[data-figure] .figure")).toHaveText("+3");
  });

  test("Travle: a loss reads N away and a perfect run reads Perfect", async ({ page }) => {
    const loss = fixtureRecord("travle", "loss-2026-11-22");
    const win = byGame("travle");
    const perfect: RecordOf<"travle"> = { ...win, detail: { ...win.detail, perfect: true, guesses: win.detail.guesses.filter((g) => g.rating === "perfect") } };
    await openCards(page, { records: [loss] });
    await expect(card(page, "travle").locator("[data-figure] .figure")).toHaveText("3 away");
    await openCards(page, { records: [perfect] });
    await expect(card(page, "travle").locator("[data-figure] .figure")).toHaveText("Perfect");
  });

  test("Songless: the category row of five steps, the clip length solved at, and the answer", async ({ page }) => {
    await openCards(page);
    const c = card(page, "songless");
    await expect(c.locator("[data-category]")).toHaveText("Top Hits");
    const tiles = c.locator("[data-tiles] [data-tile]");
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(["present", "incorrect", "skipped", "correct", "unused"]);
    expect(await bg(tiles.nth(3))).toBe("rgb(85, 183, 37)");
    await expect(c.locator("[data-figure] .figure")).toHaveText("8s");
    await expect(c.locator("[data-caption]")).toHaveText("Top 19.1% today");
  });
});

test.describe("a distribution appears only where the record carries one", () => {
  test("charts on Krillion, enclose.horse, Travle, Songless, Wordle and Mini; none on Connections, Bee or Globle", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const withChart = ["krillion", "enclose-horse", "travle", "wordle", "mini", "songless"];
    for (const g of GAMES) await expect(card(page, g.id).locator("[data-chart]")).toHaveCount(withChart.includes(g.id) ? 1 : 0);
  });

  test("with the distribution fields absent or null the chart and its line are omitted, not drawn empty", async ({ page }) => {
    const k = byGame("krillion");
    const bare = { ...k.detail };
    delete bare.dist;
    delete bare.betterThan;
    const e = byGame("enclose-horse");
    const t = byGame("travle");
    const s = byGame("songless");
    await openCards(page, {
      records: [
        { ...k, detail: bare },
        { ...e, detail: { ...e.detail, histogram: null, rank: null, percentile: null } },
        { ...t, detail: { ...t.detail, distribution: null, topPercent: null } },
        { ...s, detail: { ...s.detail, distribution: null, topPercent: null } },
      ],
    });
    await expect(page.locator(".card")).toHaveCount(4);
    await expect(page.locator(".card [data-chart]")).toHaveCount(0);
    await expect(page.locator(".card [data-caption]")).toHaveCount(0);
  });

  test("Krillion with betterThan but no dist shows only the line", async ({ page }) => {
    const k = byGame("krillion");
    const lineOnly = { ...k.detail };
    delete lineOnly.dist;
    await openCards(page, { records: [{ ...k, detail: lineOnly }] });
    await expect(page.locator(".card [data-chart]")).toHaveCount(0);
    await expect(page.locator(".card [data-caption]")).toHaveText("Better than 90% of today's players");
  });
});

test.describe("rendering rules", () => {
  const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{20E3}/u;
  const emojiInCards = (page: Page) =>
    page.locator(".card").evaluateAll((els, src) => {
      const re = new RegExp(src, "u");
      return els.filter((e) => re.test(e.textContent ?? "") || [...e.querySelectorAll("*")].some((k) => [...k.attributes].some((a) => re.test(a.value)))).map((e) => e.getAttribute("data-game"));
    }, EMOJI.source);

  test("no card renders an emoji code point", async ({ page }) => {
    await openCards(page, ALL_NINE);
    expect(await emojiInCards(page)).toEqual([]);
  });

  test("the emoji check fails on a card that renders one", async ({ page }) => {
    const k = byGame("krillion");
    const answers = k.detail.answers.map((a, i) => (i === 0 ? { ...a, answer: "\u{1F990} shrimp" } : a));
    await openCards(page, { records: [{ ...k, detail: { ...k.detail, answers } }] });
    expect(await emojiInCards(page)).toEqual(["krillion"]);
  });

  test("charts paint fully on the first frame: no animations or transitions on the bars", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const moving = await page.locator("[data-chart]").evaluateAll((charts) =>
      charts.flatMap((c) =>
        [c, ...c.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          return el.getAnimations().length > 0 || cs.animationName !== "none" || cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0);
        }).map((el) => el.outerHTML.slice(0, 60)),
      ),
    );
    expect(moving).toEqual([]);
  });

  test("charts keep at least 8px of inner padding around their bars", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const tight = await page.locator("[data-chart]").evaluateAll((charts) =>
      charts.flatMap((c) => {
        const box = c.getBoundingClientRect();
        return [...c.querySelectorAll("[data-bar],[data-rule]")].flatMap((b) => {
          const r = b.getBoundingClientRect();
          const gaps = [r.left - box.left, box.right - r.right, r.top - box.top, box.bottom - r.bottom];
          return Math.min(...gaps) < 8 ? [`${c.closest(".card")?.getAttribute("data-game")}: ${gaps.map(Math.round).join(",")}`] : [];
        });
      }),
    );
    expect(tight).toEqual([]);
  });

  test("charts scrub with arrow keys and the pointer", async ({ page }) => {
    await openCards(page);
    const chart = card(page, "wordle").locator("[data-chart]");
    const readout = card(page, "wordle").locator("[data-readout]");
    await expect(chart).toHaveAttribute("role", "slider");
    await expect(chart).toHaveAttribute("aria-valuenow", "2");
    await expect(readout).toHaveText("3 guesses: 1 game");
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(chart).toHaveAttribute("aria-valuenow", "1");
    await expect(readout).toHaveText("2 guesses: 0 games");
    await page.keyboard.press("End");
    await expect(chart).toHaveAttribute("aria-valuenow", "6");
    await expect(readout).toHaveText("X: 0 games");
    const [first, box] = await Promise.all([chart.locator("[data-bar]").first().boundingBox(), chart.boundingBox()]);
    await page.mouse.move(first!.x + first!.width / 2, box!.y + box!.height / 2);
    await expect(chart).toHaveAttribute("aria-valuenow", "0");
    await expect(readout).toHaveText("1 guess: 0 games");
  });

  test("card titles are at least 20px and never smaller than the body text under them", async ({ page }) => {
    await openCards(page, ALL_NINE);
    const sizes = await page.locator(".card").evaluateAll((els) =>
      els.map((c) => {
        const title = parseFloat(getComputedStyle(c.querySelector(".card-title")!).fontSize);
        const body = Math.max(...[...c.querySelectorAll("*")].filter((e) => !e.closest(".card-title") && !e.closest("[data-figure]") && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)));
        return { game: c.getAttribute("data-game"), title, body };
      }),
    );
    for (const s of sizes) {
      expect(s.title, s.game!).toBeGreaterThanOrEqual(20);
      expect(s.title, s.game!).toBeGreaterThanOrEqual(s.body);
    }
  });

  test("every text in a card, including text on game colors, passes 4.5:1 in this color scheme", async ({ page }, info) => {
    await openCards(page, ALL_NINE);
    const pairs = await page.locator(".card").evaluateAll((cards) => {
      const parse = (c: string): [number, number, number, number] => {
        const m = c.match(/[\d.]+/g)!.map(Number);
        if (c.startsWith("color(srgb")) return [m[0]! * 255, m[1]! * 255, m[2]! * 255, m[3] ?? 1];
        return [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const out: { game: string; text: string; fg: string; bg: string; ratio: number }[] = [];
      for (const c of cards) {
        const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement!;
          if (!n.textContent!.trim() || !el.checkVisibility()) continue;
          let paint: Element | null = el;
          while (paint && parse(getComputedStyle(paint).backgroundColor)[3] < 1) paint = paint.parentElement;
          const fg = getComputedStyle(el).color;
          const bgc = getComputedStyle(paint ?? document.body).backgroundColor;
          const [a, b] = [lum(parse(fg)), lum(parse(bgc))];
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          out.push({ game: c.getAttribute("data-game")!, text: n.textContent!.trim().slice(0, 24), fg, bg: bgc, ratio: Math.round(ratio * 100) / 100 });
        }
      }
      return out;
    });
    const dir = join(import.meta.dirname, "..", "test-results", "contrast");
    mkdirSync(dir, { recursive: true });
    await info.attach(`contrast-${info.project.name}`, { body: JSON.stringify(pairs, null, 1), contentType: "application/json" });
    expect(pairs.length).toBeGreaterThan(50);
    expect(pairs.filter((p) => p.ratio < 4.5)).toEqual([]);
  });
});

test.describe("visual guards and states on the cards preview", () => {
  test("the cards preview passes every visual guard", async ({ page }, info) => {
    await openCards(page, ALL_NINE);
    expect(await audit(page)).toEqual(CLEAN);
    const dir = join(import.meta.dirname, "..", "test-results", "screens");
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `cards-${info.project.name}.png`), fullPage: true });
  });

  test("the default preview, from real fixtures only, passes every visual guard", async ({ page }) => {
    await openCards(page);
    expect(await audit(page)).toEqual(CLEAN);
  });

  test("a card title link underlines and darkens on hover with a fine pointer, and shows a focus ring from the keyboard", async ({ page }, info) => {
    await openCards(page);
    const a = card(page, "krillion").locator(".card-title a");
    const style = () => a.evaluate((el) => ({ color: getComputedStyle(el).color, line: getComputedStyle(el).textDecorationColor, outline: getComputedStyle(el).outlineStyle }));
    const rest = await style();
    if (!info.project.use.isMobile) {
      await a.hover();
      await expect.poll(async () => (await style()).color).not.toBe(rest.color);
      await expect.poll(async () => { const s = await style(); return s.line === s.color; }).toBe(true);
      await page.mouse.move(0, 0);
    }
    await page.keyboard.press("Tab");
    await expect(a).toBeFocused();
    expect((await style()).outline).toBe("solid");
  });
});
