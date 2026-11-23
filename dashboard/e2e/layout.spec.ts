import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_CASES } from "../fixture-records";
import { audit } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/**
 * Proportions (dailies#3, dailies#4 design hold). At 1024 and up an expanded card spans its whole row and splits
 * in two: the result on the left, the chart on the right. At 390 it stacks. History is as wide as Today.
 */
const desktop = (name: string) => name.startsWith("1440") || name.startsWith("1024");
const phone = (name: string) => name.startsWith("390");
const FIXTURE_GAMES = Object.keys(FIXTURE_CASES);

/** Let the 200ms card enter finish, so boxes are measured where they come to rest. */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

async function dashboardExpanded(page: Page) {
  await open(page, { ext: withState(STATES.done) });
  for (const d of await page.locator(".row .disclosure").all()) await d.click();
  await settle(page);
}

async function preview(page: Page) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Measured {
  game: string;
  card: Box;
  /** The content box of the row the card sits in: its Today row, or the preview grid. */
  row: Box;
  result: Box | null;
  chart: Box | null;
  /** Left edges of everything painted in the card under its title: text runs, tiles, bars. */
  ink: number[];
}

/** Runs in the page: every card's box, its row's content box, its result and chart, and where its ink sits. */
function measureInPage(rowSelector: string): Measured[] {
  const box = (r: DOMRect) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const content = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const [pl, pr, pt, pb, bl, br, bt, bb] = [cs.paddingLeft, cs.paddingRight, cs.paddingTop, cs.paddingBottom, cs.borderLeftWidth, cs.borderRightWidth, cs.borderTopWidth, cs.borderBottomWidth].map(parseFloat) as number[];
    return { x: r.left + bl! + pl!, y: r.top + bt! + pt!, w: r.width - bl! - br! - pl! - pr!, h: r.height - bt! - bb! - pt! - pb! };
  };
  return [...document.querySelectorAll<HTMLElement>(".card[data-game]")].map((card) => {
    const ink: number[] = [];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || n.parentElement?.closest(".card-title")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0) ink.push(r.left);
    }
    for (const el of card.querySelectorAll("[data-tiles] > *, [data-tile], [data-bar], [data-board]")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) ink.push(r.left);
    }
    const result = card.querySelector("[data-result]");
    const chart = card.querySelector("[data-chart]");
    return {
      game: card.getAttribute("data-game")!,
      card: box(card.getBoundingClientRect()),
      row: content(card.closest(rowSelector)!),
      result: result ? box(result.getBoundingClientRect()) : null,
      chart: chart ? box(chart.getBoundingClientRect()) : null,
      ink,
    };
  });
}

const SURFACES = [
  { name: "dashboard row", load: dashboardExpanded, row: ".row" },
  { name: "/cards/ preview", load: preview, row: ".cards" },
] as const;

for (const surface of SURFACES) {
  test.describe(`expanded cards on the ${surface.name}`, () => {
    test("1. at 1024 and 1440 each of the eight fixture cards spans its row, is no taller than wide, and puts the result left and the chart right", async ({ page }, info) => {
      test.skip(!desktop(info.project.name), "1024 and 1440 only");
      await surface.load(page);
      const cards = await page.evaluate(measureInPage, surface.row);
      expect(cards.map((c) => c.game).sort()).toEqual([...FIXTURE_GAMES].sort());
      for (const c of cards) {
        expect(Math.abs(c.card.w - c.row.w), `${c.game} width ${c.card.w} vs row ${c.row.w}`).toBeLessThanOrEqual(2);
        expect(Math.abs(c.card.x - c.row.x), `${c.game} left edge`).toBeLessThanOrEqual(2);
        expect(c.card.h, `${c.game} is ${Math.round(c.card.h)} tall and ${Math.round(c.card.w)} wide`).toBeLessThanOrEqual(c.card.w);
        expect(c.result, `${c.game} has a result column`).not.toBeNull();
        const mid = c.card.x + c.card.w / 2;
        if (c.chart) {
          expect(c.chart.x, `${c.game} chart starts right of the result`).toBeGreaterThan(c.result!.x + c.result!.w);
          expect(Math.abs(c.chart.y - c.result!.y), `${c.game} chart and result tops`).toBeLessThanOrEqual(8);
        } else {
          // No chart: the card still uses its right half rather than leaving it empty.
          expect(c.ink.some((x) => x >= mid), `${c.game} has ink in its right half`).toBe(true);
        }
      }
    });

    test("1. lessons gate at 1024 and 1440: one card per row, so no towering card sits next to a short one, and none is left blank", async ({ page }, info) => {
      test.skip(!desktop(info.project.name), "1024 and 1440 only");
      await surface.load(page);
      const cards = await page.evaluate(measureInPage, surface.row);
      for (const [i, a] of cards.entries()) {
        for (const b of cards.slice(i + 1)) {
          const sideBySide = a.card.y < b.card.y + b.card.h && b.card.y < a.card.y + a.card.h;
          expect(sideBySide, `${a.game} and ${b.game} share a row`).toBe(false);
        }
      }
      expect((await audit(page)).blank).toEqual([]);
    });

    test("2. at 390 each card stacks to one column, result then chart, with no sideways scroll", async ({ page }, info) => {
      test.skip(!phone(info.project.name), "390 only");
      await surface.load(page);
      const cards = await page.evaluate(measureInPage, surface.row);
      expect(cards).toHaveLength(FIXTURE_GAMES.length);
      for (const c of cards) {
        expect(c.result, `${c.game} has a result column`).not.toBeNull();
        if (c.chart) expect(c.chart.y, `${c.game} chart sits under the result`).toBeGreaterThanOrEqual(c.result!.y + c.result!.h);
        expect(c.card.x).toBeGreaterThanOrEqual(0);
        expect(c.card.x + c.card.w).toBeLessThanOrEqual(390);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  });
}

test("3. at 1024 and 1440 the History panel is as wide as the Today table", async ({ page }, info) => {
  test.skip(!desktop(info.project.name), "1024 and 1440 only");
  await open(page, { ext: withState(STATES.done) });
  const [today, history] = [(await page.locator(".rows").boundingBox())!, (await page.locator(".hist-card").boundingBox())!];
  expect(Math.abs(history.width - today.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(history.x - today.x)).toBeLessThanOrEqual(2);
});

test("4. the two streak numbers above History are labelled as covering all games, in one weight with no eyebrow styling", async ({ page }) => {
  await open(page, { ext: withState(STATES.done) });
  const head = await page.locator(".history").evaluate((section) => {
    const out: { number: string; label: string | null }[] = [];
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (el.closest(".hist-card") || !/^\d+$/.test(n.textContent!.trim())) continue;
      const fig = el.closest("[data-value]");
      out.push({ number: n.textContent!.trim(), label: fig ? (fig.textContent ?? "").replace(n.textContent!, "").trim() : null });
    }
    const weights = new Set([...section.querySelectorAll(".section-head *")].map((e) => getComputedStyle(e).fontWeight));
    return { out, weights: [...weights] };
  });
  // Either removed (no bare numbers at all) or each one labelled as covering all games.
  for (const n of head.out) expect(n.label, `the number ${n.number} above History`).toMatch(/all games/i);
  expect(head.weights).toHaveLength(1);
  expect((await audit(page)).banned).toEqual([]);
});

test("5. at 390 a Not played yet row is one line: shorter than a played row, with no empty second line", async ({ page }, info) => {
  test.skip(!phone(info.project.name), "390 only");
  await open(page, { ext: withState(STATES.partial) });
  const measure = (game: string) =>
    page.locator(`.row[data-game="${game}"] .line`).evaluate((line) => {
      const cs = getComputedStyle(line);
      const r = line.getBoundingClientRect();
      const top = r.top + parseFloat(cs.paddingTop);
      const bottoms = [...line.children].map((k) => {
        const range = document.createRange();
        range.selectNodeContents(k);
        return Math.max(...[...range.getClientRects()].map((x) => x.bottom));
      });
      return { height: r.height, content: r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), inkBelow: Math.max(...bottoms) - top };
    });
  const played = await measure("wordle");
  for (const game of ["enclose-horse", "mini", "globle", "songless"]) {
    await expect(page.locator(`.row[data-game="${game}"] .status`)).toHaveText("Not played yet");
    const idle = await measure(game);
    expect(idle.height, `${game} row height`).toBeLessThan(played.height);
    // One 26px line: no second grid line held open below it.
    expect(idle.content, `${game} content height`).toBeLessThanOrEqual(27);
    expect(idle.inkBelow, `${game} ink stays on the first line`).toBeLessThanOrEqual(27);
  }
});

test("6. at 1024 and above the /cards/ preview shows one full-width card per row", async ({ page }, info) => {
  test.skip(!desktop(info.project.name), "1024 and 1440 only");
  await preview(page);
  const grid = await page.locator(".cards").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { columns: cs.gridTemplateColumns.split(" ").length, width: el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  expect(grid.columns).toBe(1);
  const boxes = await page.locator(".card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: r.top, w: r.width })));
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(boxes.length);
  for (const b of boxes) expect(Math.abs(b.w - grid.width)).toBeLessThanOrEqual(2);
});
