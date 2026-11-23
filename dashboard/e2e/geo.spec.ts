import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord, RecordOf } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** The lazy geo chunk: world-atlas data, topojson-client and d3-geo. */
const GEO = /\/assets\/geo-[\w-]+\.js$/;
const DIST = join(import.meta.dirname, "..", "dist");
const SHOTS = join(import.meta.dirname, "..", "test-results", "screens", "geo");
const HEAT = ["correct", "hot", "warm", "mild", "cold"];

const travleWin = fixtureRecord("travle", "win-2026-11-22");
const travleLoss = fixtureRecord("travle", "loss-2026-11-22");
const globleWin = fixtureRecord("globle", "win-2026-11-22");
const globlePartial = fixtureRecord("globle", "partial-2026-11-22");
const wordle = fixtureRecord("wordle", "win-2026-11-22");

interface Watch {
  geo: string[];
  errors: string[];
  pageErrors: string[];
}

async function watch(page: Page): Promise<Watch> {
  const w: Watch = { geo: [], errors: [], pageErrors: [] };
  page.on("request", (r) => GEO.test(new URL(r.url()).pathname) && w.geo.push(r.url()));
  page.on("console", (m) => m.type() === "error" && w.errors.push(m.text()));
  page.on("pageerror", (e) => w.pageErrors.push(e.message));
  return w;
}

async function openCards(page: Page, records?: DailyRecord[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  if (records) await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), records);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const card = (page: Page, game: "travle" | "globle") => page.locator(`.card[data-game="${game}"]`);
const ready = (c: Locator) => expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });

/** Center of an SVG element in the SVG's own coordinates. */
const center = (l: Locator) =>
  l.evaluate((el) => {
    const b = (el as SVGGraphicsElement).getBBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
const bbox = (l: Locator) => l.evaluate((el) => {
  const b = (el as SVGGraphicsElement).getBBox();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});
const inside = (p: { x: number; y: number }, b: { x: number; y: number; width: number; height: number }) =>
  p.x >= b.x - 0.5 && p.x <= b.x + b.width + 0.5 && p.y >= b.y - 0.5 && p.y <= b.y + b.height + 0.5;
const km = (s: string) => (/under 100 km/.test(s) ? 50 : Number(s.match(/about ([\d,]+) km/)![1]!.replace(/,/g, "")));

test.describe("geo data", () => {
  test("the geo chunk is requested only when a Travle or Globle card renders", async ({ page }) => {
    const w = await watch(page);
    await openCards(page, [wordle]);
    await page.waitForLoadState("networkidle");
    expect(w.geo).toEqual([]);
    await openCards(page, [wordle, travleWin]);
    await ready(card(page, "travle"));
    expect(w.geo.length).toBeGreaterThan(0);
  });

  test("on the dashboard the geo chunk waits until a Travle or Globle card is opened", async ({ page }) => {
    const w = await watch(page);
    await open(page, { ext: withState(STATES.done) });
    await page.waitForLoadState("networkidle");
    expect(w.geo).toEqual([]);
    await page.locator('.row[data-game="globle"] .disclosure').click();
    await ready(card(page, "globle"));
    expect(w.geo.length).toBeGreaterThan(0);
  });

  test("bundle: the main entry grows by at most 15 KB gzip and carries no geo data", async () => {
    const info = test.info();
    test.skip(info.project.name !== "1440-light", "once");
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    const entry = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(entry.length).toBeGreaterThan(0);
    const sizes = entry.map((f) => ({ f, gz: gzipSync(readFileSync(join(DIST, f))).length }));
    const geo = readdirSync(join(DIST, "assets")).filter((f) => GEO.test(`/assets/${f}`));
    expect(geo.length).toBeGreaterThan(0);
    expect(geo.some((f) => readFileSync(join(DIST, "assets", f), "utf8").includes("Afghanistan"))).toBe(true);
    const total = sizes.reduce((n, s) => n + s.gz, 0);
    // origin/main before this change: main 30,192 + shared cards chunk 73,688 bytes gzip.
    expect(total).toBeLessThanOrEqual(103_880 + 15 * 1024);
    for (const { f } of sizes) expect(readFileSync(join(DIST, f), "utf8"), f).not.toMatch(/Afghanistan|"arcs"/);
    const lazy = geo.map((f) => ({ f, gz: gzipSync(readFileSync(join(DIST, "assets", f))).length }));
    await info.attach("chunk-sizes", { body: JSON.stringify({ entry: sizes, total, lazy }, null, 1), contentType: "application/json" });
  });
});

test.describe("silhouette", () => {
  for (const [game, records, name] of [
    ["globle", [globleWin], "Afghanistan"],
    ["travle", [travleWin], "Chile"],
    ["travle", [travleLoss], "Chile"],
  ] as const) {
    test(`${game} ${records[0].status}: the answer is a filled silhouette fitted to its box, with its name`, async ({ page }) => {
      await openCards(page, [...records]);
      const c = card(page, game);
      await ready(c);
      const svg = c.locator("svg[data-silhouette]");
      await expect(svg).toHaveCount(1);
      await expect(c.locator("[data-answer]")).toHaveText(name);
      const path = svg.locator("path");
      expect((await path.getAttribute("d"))!.length).toBeGreaterThan(20);
      expect(await path.evaluate((el) => getComputedStyle(el).fill)).not.toBe("none");
      const [box, ink] = [(await svg.boundingBox())!, (await path.boundingBox())!];
      expect(ink.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(ink.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(ink.x + ink.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(ink.y + ink.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(Math.max(ink.width / box.width, ink.height / box.height)).toBeGreaterThan(0.85);
    });
  }
});

test.describe("Travle map", () => {
  test("fitted to the route, guesses filled by rating, a pin at each guess, the route joined in order", async ({ page }) => {
    await openCards(page, [travleWin]);
    const c = card(page, "travle");
    await ready(c);
    const map = c.locator("svg[data-map]");
    await expect(map).toHaveCount(1);
    const { width: W, height: H } = (await map.boundingBox())!;
    const fills = new Map<string, string>();
    for (const g of travleWin.detail.guesses) {
      const pin = map.locator(`[data-pin="${g.country}"]`);
      if ((await pin.count()) === 0) {
        await expect(c.locator("[data-offmap]"), g.country).toBeVisible();
        continue;
      }
      const shape = map.locator(`path[data-country="${g.country}"]`);
      await expect(shape).toHaveAttribute("data-rating", g.rating);
      const fill = await shape.evaluate((el) => getComputedStyle(el).fill);
      expect(fills.get(g.rating) ?? fill).toBe(fill);
      fills.set(g.rating, fill);
      await expect(pin, g.country).toHaveCount(1);
      expect(inside(await center(pin), await bbox(shape)), g.country).toBe(true);
    }
    expect(new Set(fills.values()).size).toBe(fills.size);
    for (const code of ["PAN", "ECU", "COL", "PER"]) await expect(map.locator(`[data-pin="${code}"]`), code).toHaveCount(1);
    const route = travleWin.detail.optimalRoute;
    const line = map.locator("path[data-route]");
    const pts = [...(await line.getAttribute("d"))!.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
    expect(pts).toHaveLength(route.length);
    const boxes = await Promise.all(route.map((code) => bbox(map.locator(`path[data-country="${code}"]`))));
    pts.forEach((p, i) => expect(inside(p, boxes[i]!), route[i]).toBe(true));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.y).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(W + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(H + 0.5);
    }
    const span = (lo: (b: (typeof boxes)[0]) => number, hi: (b: (typeof boxes)[0]) => number) => Math.max(...boxes.map(hi)) - Math.min(...boxes.map(lo));
    expect(Math.max(span((b) => b.x, (b) => b.x + b.width) / W, span((b) => b.y, (b) => b.y + b.height) / H)).toBeGreaterThan(0.8);
  });

  test("a guess outside the route's frame is named under the map instead of pinned off it", async ({ page }) => {
    await openCards(page, [travleLoss]);
    const c = card(page, "travle");
    await ready(c);
    for (const code of ["ESP", "AUS"]) {
      await expect(c.locator(`[data-pin="${code}"]`)).toHaveCount(0);
      await expect(c.locator("[data-offmap]")).toContainText(code === "ESP" ? "Spain" : "Australia");
    }
    for (const code of ["ECU", "BOL"]) await expect(c.locator(`[data-pin="${code}"]`)).toHaveCount(1);
  });
});

test.describe("Globle map", () => {
  test("a pin per guess, a line from each guess to the answer labelled in km, closer guesses hotter", async ({ page }) => {
    await openCards(page, [globleWin]);
    const c = card(page, "globle");
    await ready(c);
    const map = c.locator("svg[data-map]");
    const countries = globleWin.detail.countries;
    const answer = countries.at(-1)!;
    await expect(map.locator("[data-pin]")).toHaveCount(countries.length);
    await expect(map.locator(`[data-pin="${answer}"]`)).toHaveAttribute("data-heat", "correct");
    const end = await center(map.locator(`[data-pin="${answer}"]`));
    await expect(map.locator("[data-line]")).toHaveCount(countries.length - 1);
    const rows: { name: string; km: number; heat: number; fill: string }[] = [];
    for (const name of countries.slice(0, -1)) {
      const pin = map.locator(`[data-pin="${name}"]`);
      const start = await center(pin);
      const l = map.locator(`[data-line="${name}"]`);
      const [x1, y1, x2, y2] = await Promise.all(["x1", "y1", "x2", "y2"].map(async (a) => Number(await l.getAttribute(a))));
      expect(Math.hypot(x1! - start.x, y1! - start.y), name).toBeLessThan(1);
      expect(Math.hypot(x2! - end.x, y2! - end.y), name).toBeLessThan(1);
      const label = c.locator(`[data-label="${name}"]`);
      await expect(label, name).toHaveCount(1);
      const text = (await label.textContent())!;
      expect(text, name).toMatch(/(about \d{1,3}(,\d{3})* km|under 100 km)$/);
      rows.push({ name, km: km(text), heat: HEAT.indexOf((await pin.getAttribute("data-heat"))!), fill: await pin.evaluate((el) => getComputedStyle(el).fill) });
    }
    rows.sort((a, b) => a.km - b.km);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.heat, rows[i]!.name).toBeGreaterThanOrEqual(rows[i - 1]!.heat);
    expect(rows[0]!.heat).toBe(1);
    expect(rows.at(-1)!.heat).toBeGreaterThan(rows[0]!.heat);
    const byHeat = new Map(rows.map((r) => [r.heat, r.fill]));
    expect(new Set(byHeat.values()).size).toBe(byHeat.size);
    expect(rows.find((r) => r.name === "Pakistan")!.km).toBeLessThan(rows.find((r) => r.name === "Brazil")!.km);
  });

  test("an unfinished game pins each guess with no answer, lines or silhouette", async ({ page }) => {
    await openCards(page, [globlePartial]);
    const c = card(page, "globle");
    await ready(c);
    await expect(c.locator("svg[data-map] [data-pin]")).toHaveCount(globlePartial.detail.countries.length);
    await expect(c.locator("[data-line]")).toHaveCount(0);
    await expect(c.locator("svg[data-silhouette]")).toHaveCount(0);
  });
});

/** Each geo box, then the whole card, as plain numbers. */
const rects = (els: Element[]) =>
  [...els, els[0]!.closest(".card")!].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

test.describe("loading", () => {
  test("with the geo chunk 1 second late, a placeholder of the same shape holds the space and nothing shifts", async ({ page }) => {
    await page.route(GEO, async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fallback();
    });
    await openCards(page, [travleWin, globleWin]);
    const games = ["travle", "globle"] as const;
    const before: Record<string, Record<"x" | "y" | "width" | "height", number>[]> = {};
    for (const g of games) {
      const c = card(page, g);
      await expect(c).toHaveAttribute("data-geo", "loading");
      await expect(c.locator("svg[data-map]")).toHaveCount(0);
      const holders = c.locator("[data-geo-placeholder]");
      expect(await holders.count()).toBeGreaterThan(0);
      for (const h of await holders.all()) {
        await expect(h).toBeVisible();
        expect(await h.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      }
      before[g] = await c.locator("[data-geo-box]").evaluateAll(rects);
    }
    expect((await audit(page)).empty).toEqual([]);
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift" });
    });
    for (const g of games) await ready(card(page, g));
    await page.waitForTimeout(400);
    for (const g of games) {
      const after = await card(page, g).locator("[data-geo-box]").evaluateAll(rects);
      expect(after).toHaveLength(before[g]!.length);
      after.forEach((r, i) => {
        const b = before[g]![i]!;
        for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(r[k] - b[k]), `${g} box ${i} ${k}`).toBeLessThan(0.5);
      });
    }
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.01);
  });
});

test.describe("missing data", () => {
  const fallsBack = async (page: Page) => {
    for (const g of ["travle", "globle"] as const) {
      const c = card(page, g);
      await expect(c).toHaveAttribute("data-geo", "fallback", { timeout: 10_000 });
      await expect(c.locator("svg[data-map], svg[data-silhouette], [data-geo-placeholder]")).toHaveCount(0);
    }
    const t = card(page, "travle").locator("[data-tiles] [data-tile]");
    expect(await t.allTextContents()).toEqual(travleWin.detail.guesses.map((g) => g.country));
    await expect(card(page, "travle")).toContainText(`Shortest route ${travleWin.detail.optimalRoute.join(", ")}`);
    await expect(card(page, "globle").locator("[data-tiles] [data-tile]")).toHaveCount(globleWin.detail.countries.length);
    await expect(card(page, "globle")).toContainText("Found Afghanistan");
    expect(await audit(page)).toEqual(CLEAN);
  };

  test("a country that can't be resolved falls back to the text and chips with no console error", async ({ page }) => {
    const w = await watch(page);
    const t: RecordOf<"travle"> = { ...travleWin, detail: { ...travleWin.detail, optimalRoute: [...travleWin.detail.optimalRoute.slice(0, -1), "ZZZ"] } };
    const g: RecordOf<"globle"> = { ...globleWin, detail: { ...globleWin.detail, countries: ["Atlantis", ...globleWin.detail.countries.slice(1)] } };
    await openCards(page, [t, g]);
    for (const game of ["travle", "globle"] as const) await expect(card(page, game)).toHaveAttribute("data-geo", "fallback", { timeout: 10_000 });
    await expect(card(page, "travle")).toContainText("Shortest route CRI, PAN, COL, PER, ZZZ");
    await expect(card(page, "globle").locator("[data-tiles] [data-tile]")).toHaveCount(9);
    await expect(page.locator("svg[data-map], svg[data-silhouette], [data-geo-placeholder]")).toHaveCount(0);
    expect(await audit(page)).toEqual(CLEAN);
    expect(w.errors).toEqual([]);
    expect(w.pageErrors).toEqual([]);
  });

  test("a geo chunk that fails as it runs falls back with no console error", async ({ page }) => {
    const w = await watch(page);
    await page.route(GEO, (route) => route.fulfill({ contentType: "text/javascript", body: 'throw new Error("geo unavailable");' }));
    await openCards(page, [travleWin, globleWin]);
    await fallsBack(page);
    expect(w.errors).toEqual([]);
    expect(w.pageErrors).toEqual([]);
  });

  test("a geo chunk that never arrives falls back; only the browser's own load failure is logged", async ({ page }) => {
    const w = await watch(page);
    await page.route(GEO, (route) => route.abort());
    await openCards(page, [travleWin, globleWin]);
    await fallsBack(page);
    expect(w.errors.filter((e) => !/^Failed to load resource/.test(e))).toEqual([]);
    expect(w.pageErrors).toEqual([]);
  });
});

/** WCAG contrast of each mark's own color against the card, read from computed styles. */
function marksVsCard(cards: Element[]) {
  const parse = (c: string) => {
    const m = c.match(/[\d.]+/g)!.map(Number);
    return c.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255] : [m[0]!, m[1]!, m[2]!];
  };
  const lum = (c: string) => {
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = parse(c);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
  };
  return cards.flatMap((c) => {
    const bg = getComputedStyle(c).backgroundColor;
    const marks = [...c.querySelectorAll("[data-mark]")].map((el) => {
      const cs = getComputedStyle(el);
      const color = cs.fill !== "none" ? cs.fill : cs.stroke;
      return { kind: "mark", what: `${el.tagName} ${el.getAttribute("data-mark")}`, color, ratio: ratio(color, bg) };
    });
    const texts = [...c.querySelectorAll("svg[data-map] text, [data-label], [data-answer], [data-offmap]")].map((el) => {
      const cs = getComputedStyle(el);
      const color = el instanceof SVGElement ? cs.fill : cs.color;
      return { kind: "text", what: (el.textContent ?? "").slice(0, 30), color, ratio: ratio(color, bg) };
    });
    return [...marks, ...texts].map((m) => ({ game: c.getAttribute("data-game"), ...m }));
  });
}

test.describe("contrast", () => {
  test("fills, pins and lines reach 3:1 and labels 4.5:1 against the card in this color scheme", async ({ page }, info) => {
    await openCards(page, [travleWin, globleWin]);
    for (const g of ["travle", "globle"] as const) await ready(card(page, g));
    const all = await page.locator('.card[data-geo="ready"]').evaluateAll(marksVsCard);
    await info.attach(`geo-contrast-${info.project.name}`, { body: JSON.stringify(all, null, 1), contentType: "application/json" });
    for (const g of ["travle", "globle"]) expect(all.filter((m) => m.game === g && m.kind === "mark").length, g).toBeGreaterThan(8);
    expect(all.filter((m) => m.kind === "text").length).toBeGreaterThan(3);
    expect(all.filter((m) => m.ratio < (m.kind === "text" ? 4.5 : 3))).toEqual([]);
  });
});

test.describe("motion", () => {
  /** Record the animations running in each geo card at the moment its map arrives. */
  async function enterAnimations(page: Page) {
    await page.route(GEO, async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fallback();
    });
    await openCards(page, [travleWin, globleWin]);
    const loading = await page.locator(".card[data-geo]").evaluateAll((cs) => cs.flatMap((c) => c.getAnimations({ subtree: true }).map((a) => a.effect!.getComputedTiming().iterations)));
    expect(loading.filter((n) => n !== 1)).toEqual([]);
    await page.evaluate(() => {
      const w = window as unknown as { __anims: unknown[] };
      w.__anims = [];
      const seen = new Set<Element>();
      new MutationObserver(() => {
        for (const c of document.querySelectorAll('.card[data-geo="ready"]')) {
          if (seen.has(c)) continue;
          seen.add(c);
          for (const a of c.getAnimations({ subtree: true })) {
            const t = a.effect!.getComputedTiming();
            const props = new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)));
            for (const k of ["offset", "computedOffset", "easing", "composite"]) props.delete(k);
            w.__anims.push({ duration: t.duration, iterations: t.iterations, props: [...props] });
          }
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-geo"] });
    });
    for (const g of ["travle", "globle"] as const) await ready(card(page, g));
    return page.evaluate(() => (window as unknown as { __anims: { duration: number; iterations: number; props: string[] }[] }).__anims);
  }

  test("the map enters with opacity and transform only, in 150 to 250ms, once", async ({ page }) => {
    const anims = await enterAnimations(page);
    expect(anims.length).toBeGreaterThan(0);
    for (const a of anims) {
      expect(a.duration).toBeGreaterThanOrEqual(150);
      expect(a.duration).toBeLessThanOrEqual(250);
      expect(a.iterations).toBe(1);
      for (const p of a.props) expect(p).toMatch(/^(opacity|transform)$/);
    }
  });

  test("under reduced motion the map enters as a 150ms opacity fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const anims = await enterAnimations(page);
    expect(anims.length).toBeGreaterThan(0);
    for (const a of anims) {
      expect(a.duration).toBe(150);
      expect(a.iterations).toBe(1);
      expect(a.props).toEqual(["opacity"]);
    }
  });
});

test.describe("390 and 1440", () => {
  const CASES = { "travle-win": [travleWin], "travle-loss": [travleLoss], "globle-win": [globleWin], "globle-partial": [globlePartial] } as const;
  for (const [name, records] of Object.entries(CASES)) {
    test(`${name}: no clipped ink, the map fills its column of the card, labels stay apart and inside the card`, async ({ page }, info) => {
      await openCards(page, [...records]);
      const game = records[0].game;
      const c = card(page, game);
      await ready(c);
      expect(await audit(page)).toEqual(CLEAN);
      // Since main's two-column card (#15), the map fills its column: the whole card at 390, about half from 1024 up.
      const fit = await c.evaluate((el) => {
        const cs = getComputedStyle(el);
        const content = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const svg = el.querySelector("svg[data-map]")!;
        const column = svg.closest("[data-result], [data-side]")!.getBoundingClientRect().width;
        return { content, column, map: svg.getBoundingClientRect().width };
      });
      expect(Math.abs(fit.map - fit.column)).toBeLessThan(1);
      expect(fit.map).toBeGreaterThan(fit.content * (info.project.name.startsWith("390") ? 0.99 : 0.45));
      const { labels, box } = await c.evaluate((el) => ({
        labels: [...el.querySelectorAll("[data-label], svg[data-map] text")].map((l) => {
          const r = l.getBoundingClientRect();
          return { t: l.textContent, x: r.x, y: r.y, r: r.right, b: r.bottom };
        }),
        box: el.getBoundingClientRect().toJSON() as DOMRect,
      }));
      for (const l of labels) {
        expect(l.x, l.t!).toBeGreaterThanOrEqual(box.x);
        expect(l.r, l.t!).toBeLessThanOrEqual(box.right);
        expect(l.b, l.t!).toBeLessThanOrEqual(box.bottom);
      }
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const [a, b] = [labels[i]!, labels[j]!];
          const overlap = a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
          expect(overlap, `${a.t} / ${b.t}`).toBe(false);
        }
      await c.screenshot({ path: join(SHOTS, `${name}-${info.project.name}.png`) });
    });
  }

  test("the dashboard's opened Travle and Globle cards pass every visual guard", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    for (const g of ["travle", "globle"] as const) {
      await page.locator(`.row[data-game="${g}"] .disclosure`).click();
      await ready(card(page, g));
    }
    await page.waitForTimeout(300);
    expect(await audit(page)).toEqual(CLEAN);
  });
});
