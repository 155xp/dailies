import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** The lazy chunks: the shared geo data (atlas, resolver, d3-geo) and the globe's own code. */
const GEO = /\/assets\/geo-[\w-]+\.js$/;
const GLOBE = /\/assets\/globe-[\w-]+\.js$/;
const DIST = join(import.meta.dirname, "..", "dist");
const SHOTS = join(import.meta.dirname, "..", "test-results", "screens", "globe");
const HEAT = ["correct", "hot", "warm", "mild", "cold"];

const win = fixtureRecord("globle", "win-2026-11-22");
const partial = fixtureRecord("globle", "partial-2026-11-22");
const ANSWER = win.detail.countries.at(-1)!;

/** Records, from before the first paint, every drawing of the answer (its center against the globe's) and every rAF callback. */
function instrument() {
  const w = window as unknown as { __turn: { t: number; dx: number; dy: number }[]; __raf: number };
  w.__turn = [];
  w.__raf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => (w.__raf++, cb(t)));
  const sample = () => {
    const svg = document.querySelector<SVGSVGElement>("svg[data-globe]");
    const a = svg?.querySelector<SVGGraphicsElement>('[data-heat="correct"]');
    if (!svg || !a) return;
    const b = a.getBBox();
    const s = svg.viewBox.baseVal;
    const p = { t: performance.now(), dx: b.x + b.width / 2 - (s.x + s.width / 2), dy: b.y + b.height / 2 - (s.y + s.height / 2) };
    const last = w.__turn.at(-1);
    if (!last || Math.abs(last.dx - p.dx) > 0.01 || Math.abs(last.dy - p.dy) > 0.01) w.__turn.push(p);
  };
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["d"] });
}

type Sample = { t: number; dx: number; dy: number };
const samples = (page: Page) => page.evaluate(() => (window as unknown as { __turn: Sample[] }).__turn);
const rafs = (page: Page) => page.evaluate(() => (window as unknown as { __raf: number }).__raf);

async function openCards(page: Page, records: DailyRecord[] = [win]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(instrument);
  await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), records);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const card = (page: Page) => page.locator('.card[data-game="globle"]');
const ready = (c: Locator) => expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
const globe = (c: Locator) => c.locator("svg[data-globe]");

/** The answer's center against the globe's, in the globe's own units, and the answer's size. */
const offset = (c: Locator) =>
  globe(c).evaluate((svg) => {
    const b = svg.querySelector<SVGGraphicsElement>('[data-heat="correct"]')!.getBBox();
    const s = (svg as SVGSVGElement).viewBox.baseVal;
    return { dx: b.x + b.width / 2 - s.width / 2, dy: b.y + b.height / 2 - s.height / 2, size: Math.max(b.width, b.height) };
  });
/** Centered: the globe's center lies near the middle of the answer's shape. */
async function expectCentered(c: Locator) {
  const o = await offset(c);
  expect(Math.hypot(o.dx, o.dy), JSON.stringify(o)).toBeLessThan(o.size * 0.25);
}
/** Ready, and the first-view turn has finished. */
async function settled(c: Locator) {
  await ready(c);
  await expect(globe(c)).toHaveCount(1);
  await c.page().waitForTimeout(600);
}

/** WCAG contrast of two computed colors. */
function contrast(a: string, b: string) {
  const parse = (c: string) => {
    const m = c.match(/[\d.]+/g)!.map(Number);
    return c.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255] : [m[0]!, m[1]!, m[2]!];
  };
  const lum = (c: string) => {
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = parse(c);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const [x, y] = [lum(a), lum(b)];
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}
const style = (l: Locator, prop: "fill" | "stroke" | "color" | "backgroundColor" | "outlineColor") => l.evaluate((el, p) => getComputedStyle(el)[p], prop);

async function drag(page: Page, l: Locator, dx: number, dy: number) {
  const b = (await l.boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  if (test.info().project.use.hasTouch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe("orthographic globe", () => {
  test("a won Globle card draws a round globe centered on the answer from the shared geo chunk and resolver", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(new URL(r.url()).pathname));
    await openCards(page);
    const c = card(page);
    await settled(c);
    await expect(c.locator("svg[data-map]")).toHaveCount(0);
    const svg = globe(c);
    const ocean = await svg.locator("[data-ocean]").evaluate((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      const s = (el as SVGGraphicsElement).ownerSVGElement!.viewBox.baseVal;
      return { w: b.width, h: b.height, cx: b.x + b.width / 2 - s.width / 2, cy: b.y + b.height / 2 - s.height / 2, size: s.width };
    });
    expect(Math.abs(ocean.w - ocean.h)).toBeLessThan(1);
    expect(ocean.w / ocean.size).toBeGreaterThan(0.95);
    expect(Math.hypot(ocean.cx, ocean.cy)).toBeLessThan(1);
    await expect(svg.locator(`[data-country="${ANSWER}"]`)).toHaveAttribute("data-heat", "correct");
    await expectCentered(c);
    // Orthographic: the far side is hidden. Brazil is more than 90 degrees from Afghanistan; Pakistan borders it.
    await expect(svg.locator('[data-country="Brazil"]')).toHaveCount(0);
    await expect(svg.locator('[data-country="Pakistan"]')).toHaveCount(1);
    expect(urls.filter((u) => GEO.test(u))).toHaveLength(1);
    expect(urls.filter((u) => GLOBE.test(u))).toHaveLength(1);
    expect(urls.filter((u) => /\.(json|topojson|geojson)$/.test(u))).toEqual([]);
  });

  test("bundle: the globe is its own lazy chunk with no map data; the atlas stays in the geo chunk", async () => {
    const info = test.info();
    test.skip(info.project.name !== "1440-light", "once");
    const html = readFileSync(join(DIST, "index.html"), "utf8") + readFileSync(join(DIST, "cards", "index.html"), "utf8");
    const assets = readdirSync(join(DIST, "assets"));
    const globes = assets.filter((f) => GLOBE.test(`/assets/${f}`));
    expect(globes).toHaveLength(1);
    expect(html).not.toContain(globes[0]!);
    const code = readFileSync(join(DIST, "assets", globes[0]!), "utf8");
    expect(code).not.toMatch(/Afghanistan|"arcs"/);
    const sizes = assets.filter((f) => f.endsWith(".js")).map((f) => ({ f, gz: gzipSync(readFileSync(join(DIST, "assets", f))).length }));
    await info.attach("chunk-sizes", { body: JSON.stringify(sizes, null, 1), contentType: "application/json" });
  });

  test("an unfinished game keeps the flat map: there is no answer to center a globe on", async ({ page }) => {
    await openCards(page, [partial]);
    const c = card(page);
    await ready(c);
    await expect(c.locator("svg[data-map]")).toHaveCount(1);
    await expect(globe(c)).toHaveCount(0);
  });
});

test.describe("fills", () => {
  test("guesses take the heat colors, hotter when closer; the answer is filled correct and outlined; the rest is quiet land", async ({ page }) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    const svg = globe(c);
    const shown = await svg.locator("[data-country]").evaluateAll((els) => els.map((e) => e.getAttribute("data-country")!));
    expect(shown.length).toBeGreaterThanOrEqual(6);
    const fills = new Map<string, string>();
    for (const name of shown) {
      const p = svg.locator(`[data-country="${name}"]`);
      const heat = (await p.getAttribute("data-heat"))!;
      expect(HEAT, name).toContain(heat);
      const fill = await style(p, "fill");
      expect(fills.get(heat) ?? fill, name).toBe(fill);
      fills.set(heat, fill);
    }
    expect(new Set(fills.values()).size).toBe(fills.size);
    expect(fills.size).toBeGreaterThanOrEqual(3);
    // Closer guesses are hotter: India and Pakistan border the answer, Germany is far.
    const rank = async (n: string) => HEAT.indexOf((await svg.locator(`[data-country="${n}"]`).getAttribute("data-heat"))!);
    expect(await rank("Pakistan")).toBeLessThan(await rank("Germany"));
    const outline = svg.locator('[data-mark="outline"]');
    await expect(outline).toHaveCount(1);
    expect(await outline.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth))).toBeGreaterThanOrEqual(1);
    expect(await style(outline, "stroke")).not.toBe("none");
    const land = svg.locator("[data-land]");
    expect(await land.count()).toBeGreaterThan(20);
    const landFill = await style(land.first(), "fill");
    expect([...fills.values()]).not.toContain(landFill);
    await expect(svg.locator("[data-graticule]")).toHaveCount(1);
  });
});

test.describe("interaction", () => {
  test("dragging turns the globe, by mouse or by touch", async ({ page }) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    const before = await offset(c);
    await drag(page, globe(c), 80, 0);
    const after = await offset(c);
    expect(after.dx - before.dx).toBeGreaterThan(30);
    expect(Math.abs(after.dy - before.dy)).toBeLessThan(15);
  });

  test("arrow keys turn the focused globe, which shows a focus ring of at least 3:1", async ({ page }) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    const g = c.getByRole("application");
    await g.focus();
    expect(await g.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const ring = await g.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(contrast(await style(g, "outlineColor"), await style(c, "backgroundColor"))).toBeGreaterThanOrEqual(3);
    const o0 = await offset(c);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const o1 = await offset(c);
    expect(Math.abs(o1.dx - o0.dx)).toBeGreaterThan(20);
    await page.keyboard.press("ArrowUp");
    const o2 = await offset(c);
    expect(Math.abs(o2.dy - o1.dy)).toBeGreaterThan(10);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const o3 = await offset(c);
    expect(Math.hypot(o3.dx - o0.dx, o3.dy - o0.dy)).toBeLessThan(1);
  });

  test("a Reset text button recenters the globe on the answer", async ({ page }) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    await drag(page, globe(c), 100, 0);
    const moved = await offset(c);
    expect(Math.hypot(moved.dx, moved.dy)).toBeGreaterThan(moved.size);
    const reset = c.getByRole("button", { name: "Reset" });
    await expect(reset).toBeVisible();
    expect(await reset.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await reset.click();
    await page.waitForTimeout(500);
    await expectCentered(c);
  });

  test("hover names the country under a fine pointer, and nothing shows on touch", async ({ page }, info) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    const fine = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
    expect(fine).toBe(!info.project.name.startsWith("390"));
    const svg = globe(c);
    const b = (await svg.boundingBox())!;
    const tip = c.getByRole("tooltip");
    if (!fine) {
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(200);
      await expect(tip).toHaveCount(0);
      return;
    }
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(tip).toContainText(ANSWER);
    const pk = (await svg.locator('[data-country="China"]').boundingBox())!;
    await page.mouse.move(pk.x + pk.width * 0.45, pk.y + pk.height * 0.45);
    await expect(tip).toContainText("China");
    const t = (await tip.boundingBox())!;
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(contrast(await style(tip, "color"), await style(tip, "backgroundColor"))).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(1, 1);
    await expect(tip).toHaveCount(0);
  });
});

test.describe("motion", () => {
  test("on first view the globe turns once to the answer in at most 400ms with an ease-out", async ({ page }) => {
    await openCards(page);
    await settled(card(page));
    const s = await samples(page);
    const dist = s.map((p) => Math.hypot(p.dx, p.dy));
    expect(dist[0]).toBeGreaterThan(20);
    expect(dist.at(-1)!).toBeLessThan(dist[0]! * 0.1);
    for (let i = 1; i < dist.length; i++) expect(dist[i]!, `frame ${i}`).toBeLessThanOrEqual(dist[i - 1]! + 0.5);
    const t0 = s[1]!.t - 17;
    expect(s.at(-1)!.t - t0).toBeLessThanOrEqual(400 + 17);
    // Ease-out: by half the time, well over half the way.
    const mid = s.filter((p) => p.t - t0 <= (s.at(-1)!.t - t0) / 2).at(-1)!;
    expect(Math.hypot(mid.dx, mid.dy)).toBeLessThan(dist[0]! * 0.4);
  });

  test("the turn waits until the globe is first in view", async ({ page }) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 400 });
    await openCards(page, [fixtureRecord("travle", "win-2026-11-22"), fixtureRecord("krillion", "win-2026-11-22"), fixtureRecord("wordle", "win-2026-11-22"), win]);
    const c = card(page);
    await ready(c);
    await page.waitForTimeout(800);
    expect(await c.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(400);
    const o = await offset(c);
    expect(Math.hypot(o.dx, o.dy)).toBeGreaterThan(20);
    await globe(c).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expectCentered(c);
  });

  test("under reduced motion the globe appears centered with a 150ms fade and never turns", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCards(page);
    const c = card(page);
    await ready(c);
    const anims = await c.evaluate((el) =>
      el.getAnimations({ subtree: true }).map((a) => ({
        duration: a.effect!.getComputedTiming().duration,
        props: [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !["offset", "computedOffset", "easing", "composite"].includes(k)),
      })),
    );
    expect(anims.length).toBeGreaterThan(0);
    for (const a of anims) expect(a).toEqual({ duration: 150, props: ["opacity"] });
    await page.waitForTimeout(800);
    const s = await samples(page);
    expect(s).toHaveLength(1);
    await expectCentered(c);
  });
});

test.describe("performance", () => {
  test("SVG, and no animation frames or running animations over 2s idle, after the turn and after a drag and Reset", async ({ page }) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    expect(await globe(c).evaluate((el) => el.tagName.toLowerCase())).toBe("svg");
    const idle = async () => {
      const start = await rafs(page);
      await page.waitForTimeout(2000);
      expect(await rafs(page)).toBe(start);
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    };
    await idle();
    await drag(page, globe(c), 60, 0);
    await c.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(600);
    await idle();
  });
});

test.describe("loading and fallback", () => {
  test("with the geo chunk 1 second late, a circular placeholder holds the globe's exact box and the card keeps its size", async ({ page }, info) => {
    await page.route(GEO, async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fallback();
    });
    await openCards(page);
    const c = card(page);
    await expect(c).toHaveAttribute("data-geo", "loading");
    const box = c.locator('[data-geo-box="globe"]');
    const hold = box.locator("[data-geo-placeholder]");
    await expect(hold).toBeVisible();
    const round = await hold.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const radius = cs.borderTopLeftRadius.endsWith("%") ? (parseFloat(cs.borderTopLeftRadius) / 100) * r.width : parseFloat(cs.borderTopLeftRadius);
      return { w: r.width, h: r.height, radius, bg: cs.backgroundColor };
    });
    expect(Math.abs(round.w - round.h)).toBeLessThan(1);
    expect(round.radius).toBeGreaterThanOrEqual(round.w / 2 - 0.5);
    expect(round.bg).not.toBe("rgba(0, 0, 0, 0)");
    const [b0, c0] = [(await box.boundingBox())!, (await c.boundingBox())!];
    expect(b0.width).toBeGreaterThan(200);
    await c.screenshot({ path: join(SHOTS, `loading-${info.project.name}.png`) });
    await settled(c);
    const [b1, c1, g1] = [(await box.boundingBox())!, (await c.boundingBox())!, (await globe(c).boundingBox())!];
    for (const k of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(b1[k] - b0[k]), `box ${k}`).toBeLessThan(0.5);
      expect(Math.abs(c1[k] - c0[k]), `card ${k}`).toBeLessThan(0.5);
      expect(Math.abs(g1[k] - b0[k]), `globe ${k}`).toBeLessThan(0.5);
    }
  });

  test("a globe chunk that never arrives falls back to the flat map; only the browser's own load failure is logged", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(GLOBE, (route) => route.abort());
    await openCards(page);
    const c = card(page);
    await ready(c);
    await expect(c.locator("svg[data-map]")).toHaveCount(1);
    await expect(globe(c)).toHaveCount(0);
    await expect(c.locator("[data-geo-placeholder]")).toHaveCount(0);
    expect(await audit(page)).toEqual(CLEAN);
    expect(errors.filter((e) => !/^Failed to load resource/.test(e))).toEqual([]);
    await c.screenshot({ path: join(SHOTS, `fallback-map-${info.project.name}.png`) });
  });

  test("a globe chunk that fails as it runs falls back to the flat map with no console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(GLOBE, (route) => route.fulfill({ contentType: "text/javascript", body: 'throw new Error("globe unavailable");' }));
    await openCards(page);
    const c = card(page);
    await ready(c);
    await expect(c.locator("svg[data-map]")).toHaveCount(1);
    await expect(globe(c)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("with no geo data the card falls back to the text card, with no globe and no placeholder", async ({ page }, info) => {
    await page.route(GEO, (route) => route.abort());
    await openCards(page);
    const c = card(page);
    await expect(c).toHaveAttribute("data-geo", "fallback", { timeout: 10_000 });
    await expect(c.locator("[data-tiles] [data-tile]")).toHaveCount(win.detail.countries.length);
    await expect(c.locator("svg[data-globe], svg[data-map], [data-geo-placeholder]")).toHaveCount(0);
    expect(await audit(page)).toEqual(CLEAN);
    await c.screenshot({ path: join(SHOTS, `fallback-text-${info.project.name}.png`) });
  });
});

test.describe("contrast", () => {
  test("heat fills and the outline reach 3:1 on the ocean, text 4.5:1, and the ocean, land and graticule stay quiet", async ({ page }, info) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    const svg = globe(c);
    const ocean = await style(svg.locator("[data-ocean]"), "fill");
    const bg = await style(c, "backgroundColor");
    const rows: { what: string; ratio: number; min: number; max?: number }[] = [];
    for (const p of await svg.locator("[data-heat]").all()) rows.push({ what: `fill ${await p.getAttribute("data-country")}`, ratio: contrast(await style(p, "fill"), ocean), min: 3 });
    rows.push({ what: "outline", ratio: contrast(await style(svg.locator('[data-mark="outline"]'), "stroke"), ocean), min: 3 });
    const reset = c.getByRole("button", { name: "Reset" });
    rows.push({ what: "Reset", ratio: contrast(await style(reset, "color"), bg), min: 4.5 });
    rows.push({ what: "answer name", ratio: contrast(await style(c.locator("[data-answer]"), "color"), bg), min: 4.5 });
    rows.push({ what: "ocean on card", ratio: contrast(ocean, bg), min: 1, max: 1.3 });
    rows.push({ what: "graticule on ocean", ratio: contrast(await style(svg.locator("[data-graticule]"), "stroke"), ocean), min: 1, max: 1.3 });
    rows.push({ what: "land on ocean", ratio: contrast(await style(svg.locator("[data-land]").first(), "fill"), ocean), min: 1.05, max: 1.6 });
    await info.attach(`globe-contrast-${info.project.name}`, { body: JSON.stringify({ ocean, bg, rows }, null, 1), contentType: "application/json" });
    expect(rows.filter((r) => r.ratio < r.min || (r.max !== undefined && r.ratio > r.max))).toEqual([]);
  });
});

test.describe("390 and 1440", () => {
  test("the globe sits inside the card with no clipping, square, and fills the card width on a phone", async ({ page }, info) => {
    await openCards(page);
    const c = card(page);
    await settled(c);
    expect(await audit(page)).toEqual(CLEAN);
    const fit = await c.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const g = el.querySelector("svg[data-globe]")!.getBoundingClientRect();
      return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), g: g.toJSON() as DOMRect, vw: document.documentElement.clientWidth };
    });
    expect(fit.g.left).toBeGreaterThanOrEqual(fit.left - 0.5);
    expect(fit.g.right).toBeLessThanOrEqual(fit.right + 0.5);
    expect(fit.g.right).toBeLessThanOrEqual(fit.vw);
    expect(Math.abs(fit.g.width - fit.g.height)).toBeLessThan(1);
    if (info.project.name.startsWith("390")) expect(Math.abs(fit.g.width - (fit.right - fit.left))).toBeLessThan(1);
    else expect(fit.g.width).toBeGreaterThanOrEqual(280);
    await c.screenshot({ path: join(SHOTS, `globe-win-${info.project.name}.png`) });
  });

  test("the dashboard's opened Globle card turns to the answer and passes every visual guard", async ({ page }) => {
    await page.addInitScript(instrument);
    await open(page, { ext: withState(STATES.done) });
    await page.locator('.row[data-game="globle"] .disclosure').click();
    const c = card(page);
    await settled(c);
    await expectCentered(c);
    expect(await audit(page)).toEqual(CLEAN);
  });
});
