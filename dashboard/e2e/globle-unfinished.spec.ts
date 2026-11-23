import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/**
 * dailies#14. An unfinished Globle card has no answer outline, so it has nothing for a left column. From 1024 up it
 * collapses to one column: the count and streak on top, then the map as a wide strip the width of the card.
 */
const partial = fixtureRecord("globle", "partial-2026-11-22");
const won = fixtureRecord("globle", "win-2026-11-22");
const travles = [fixtureRecord("travle", "win-2026-11-22"), fixtureRecord("travle", "loss-2026-11-22")];
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "14");
const desktop = () => !test.info().project.name.startsWith("390");

async function openCards(page: Page, records: DailyRecord[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), records);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The dashboard with every game played and Globle not yet finished. */
const unfinishedState = withState({ ...STATES.done, records: STATES.done.records.map((r) => (r.game === "globle" ? partial : r)) });
const openDashboard = (page: Page) => open(page, { ext: unfinishedState });
const details = (page: Page) => page.locator('.row[data-game="globle"] .disclosure');
const card = (page: Page, game = "globle") => page.locator(`.card[data-game="${game}"]`);
const ready = (c: Locator) => expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

/** Runs in the page: the card's content box, its columns, the map, its pins, and every text run outside the map. */
function measure(el: Element) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const content = { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), top: r.top + parseFloat(cs.paddingTop), bottom: r.bottom - parseFloat(cs.paddingBottom) };
  const svg = el.querySelector("svg[data-map]")!.getBoundingClientRect();
  const pins = [...el.querySelectorAll("svg[data-map] [data-pin]")].map((p) => p.getBoundingClientRect().toJSON() as DOMRect);
  const text: DOMRect[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest("svg")) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    text.push(...[...range.getClientRects()].map((x) => x.toJSON() as DOMRect));
  }
  const body = el.querySelector(".card-body")!;
  return { card: r.toJSON() as DOMRect, content, svg: svg.toJSON() as DOMRect, pins, text, columns: getComputedStyle(body).gridTemplateColumns.split(" ").length, side: !!el.querySelector("[data-side]"), outline: !!el.querySelector('[data-geo-box="silhouette"]') };
}

async function checkUnfinished(c: Locator) {
  await ready(c);
  const m = await c.evaluate(measure);
  expect(m.outline, "no answer outline").toBe(false);
  // One column: the map starts at the card content's left edge and runs to its right edge.
  expect(m.columns).toBe(1);
  expect(Math.abs(m.svg.left - m.content.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(m.svg.right - m.content.right)).toBeLessThanOrEqual(2);
  // The count and streak sit above the map, clear of it.
  for (const t of m.text) expect(t.bottom, "text above the map").toBeLessThanOrEqual(m.svg.top);
  // The map is a wide strip, wholly inside the card and the viewport, with every pin inside it.
  expect(m.svg.height).toBeLessThanOrEqual(m.svg.width / 2);
  expect(m.svg.bottom).toBeLessThanOrEqual(m.content.bottom + 1);
  expect(m.svg.right).toBeLessThanOrEqual(c.page().viewportSize()!.width);
  expect(m.pins).toHaveLength(partial.detail.countries.length);
  for (const p of m.pins) {
    expect(p.left).toBeGreaterThanOrEqual(m.svg.left);
    expect(p.right).toBeLessThanOrEqual(m.svg.right);
    expect(p.top).toBeGreaterThanOrEqual(m.svg.top);
    expect(p.bottom).toBeLessThanOrEqual(m.svg.bottom);
  }
  expect(m.card.height, "no taller than wide").toBeLessThanOrEqual(m.card.width);
  expect(await audit(c.page())).toEqual(CLEAN);
}

test.describe("unfinished Globle from 1024 up", () => {
  test.beforeEach(() => test.skip(!desktop(), "1024 and 1440"));

  test("on /cards/ it collapses to one column: count and streak on top, then the map the width of the card", async ({ page }) => {
    await openCards(page, [partial]);
    await checkUnfinished(card(page));
  });

  test("in the dashboard's opened row it collapses the same way", async ({ page }) => {
    await openDashboard(page);
    await details(page).click();
    await settle(page);
    await checkUnfinished(card(page));
  });
});

test.describe("no regression", () => {
  test("the finished Globle card and both Travle cards keep their two columns from 1024 up and stack at 390", async ({ page }) => {
    await openCards(page, [won, ...travles]);
    for (const c of await page.locator(".card[data-geo]").all()) {
      await ready(c);
      const m = await c.evaluate((el) => ({ side: !!el.querySelector("[data-side]"), columns: getComputedStyle(el.querySelector(".card-body")!).gridTemplateColumns.split(" ").length }));
      expect(m.side).toBe(true);
      expect(m.columns).toBe(desktop() ? 2 : 1);
    }
    await expect(card(page).locator('[data-geo-box="globe"]')).toHaveCount(1);
  });

  test("at 390 the unfinished card keeps its stacked layout with a 3:2 map", async ({ page }) => {
    test.skip(desktop(), "390 only");
    await openCards(page, [partial]);
    const c = card(page);
    await ready(c);
    const m = await c.evaluate(measure);
    expect(Math.abs(m.svg.left - m.content.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.svg.height - (m.svg.width * 2) / 3)).toBeLessThanOrEqual(1);
    expect(await audit(page)).toEqual(CLEAN);
  });
});

/** Any CSS color as sRGB channels, read back through a canvas so oklch and color() resolve too. */
function contrastIn(el: Element) {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const rgb = (c: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const lum = (c: string) => {
    const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bg = lum(getComputedStyle(el).backgroundColor);
  const ratio = (c: string) => {
    const [a, b] = [lum(c), bg].sort((x, y) => y - x) as [number, number];
    return (a + 0.05) / (b + 0.05);
  };
  const text = [...el.querySelectorAll(".card-title a, .card-fig *, p")].filter((t) => t.textContent?.trim()).map((t) => ({ what: t.textContent!.trim(), ratio: ratio(getComputedStyle(t).color) }));
  const marks = [...el.querySelectorAll("svg[data-map] [data-pin], svg[data-map] [data-mark=fill]")].map((m) => ({ what: m.tagName, ratio: ratio(getComputedStyle(m).fill) }));
  return { text, marks };
}

test("text reads at 4.5:1 and map marks at 3:1 against the unfinished card, in light and dark", async ({ page }) => {
  await openCards(page, [partial]);
  const c = card(page);
  await ready(c);
  const { text, marks } = await c.evaluate(contrastIn);
  expect(text.length).toBeGreaterThanOrEqual(3);
  for (const t of text) expect(t.ratio, t.what).toBeGreaterThanOrEqual(4.5);
  expect(marks.length).toBeGreaterThanOrEqual(partial.detail.countries.length);
  for (const m of marks) expect(m.ratio, m.what).toBeGreaterThanOrEqual(3);
});

test.describe("microinteractions on the unfinished card", () => {
  for (const reduced of [false, true]) {
    test(`Details opens with ${reduced ? "a 150ms fade under reduced motion" : "the 200ms card-slot rise"} and closes again`, async ({ page }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      await openDashboard(page);
      await details(page).click();
      const anims = await page.locator(".card-slot").evaluate((el) =>
        el.getAnimations().map((a) => ({
          name: (a as CSSAnimation).animationName,
          duration: (a.effect!.getTiming().duration as number),
          props: [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p))))].sort(),
        })),
      );
      expect(anims).toEqual([reduced ? { name: "fade", duration: 150, props: ["opacity"] } : { name: "rise", duration: 200, props: ["opacity", "transform"] }]);
      await expect(details(page)).toHaveAttribute("aria-expanded", "true");
      await settle(page);
      await details(page).click();
      await expect(details(page)).toHaveAttribute("aria-expanded", "false");
      await expect(card(page)).toHaveCount(0);
    });
  }

  test("keyboard focus shows a ring on Details and on the card's game link; pins hold still under the pointer", async ({ page }) => {
    await openDashboard(page);
    await details(page).focus();
    await page.keyboard.press("Enter");
    await settle(page);
    const ring = () => page.evaluate(() => {
      const el = document.activeElement!;
      return { visible: el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle, text: el.textContent?.trim() };
    });
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await ring()).toEqual({ visible: true, outline: expect.not.stringMatching(/^none$/), text: "Details" });
    await page.keyboard.press("Tab");
    expect(await ring()).toEqual({ visible: true, outline: expect.not.stringMatching(/^none$/), text: "Globle" });
    const c = card(page);
    await ready(c);
    // Card size and pin spots relative to the card, since hovering may scroll the page.
    const still = async () => {
      const m = await c.evaluate(measure);
      return [m.card.width, m.card.height, ...m.pins.flatMap((p) => [p.left - m.card.left, p.top - m.card.top])].map(Math.round);
    };
    const before = await still();
    const pin = c.locator("svg[data-map] [data-pin]").first();
    await pin.hover();
    // Any pin transition names its properties: never `all` with a duration.
    const t = await pin.evaluate((el) => ({ props: getComputedStyle(el).transitionProperty, ms: getComputedStyle(el).transitionDuration }));
    if (/\ball\b/.test(t.props)) expect(t.ms).toMatch(/^0s(, 0s)*$/);
    expect(await still()).toEqual(before);
  });
});

test("evidence: unfinished and finished Globle stills", async ({ page }, info) => {
  const [width, scheme] = info.project.name.split("-");
  await openCards(page, [partial]);
  await ready(card(page));
  await settle(page);
  await card(page).screenshot({ path: join(OUT, `globle-unfinished-${width}-${scheme}.png`) });
  if (width === "1024") return;
  await openCards(page, [won]);
  await expect(card(page).locator("svg[data-globe]")).toBeVisible({ timeout: 10_000 });
  await settle(page);
  await card(page).screenshot({ path: join(OUT, `globle-finished-${width}-${scheme}.png`) });
});
