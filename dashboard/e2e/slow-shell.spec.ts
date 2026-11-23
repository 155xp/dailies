import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test";
import { preview, type PreviewServer } from "vite";
import { GAMES } from "../src/games";
import { NOW, STATES, type ExtState } from "./harness";

/**
 * dailies#16: the page is never blank on a slow network. Written before the fix and never edited after.
 *
 * Runs the built site through `vite preview` (a real HTTP server, so Chrome's own throttling applies) under
 * CDP Network.emulateNetworkConditions at 400ms RTT and 500 kbps with the cache disabled. Timing comes from
 * the browser (navigation timing, paint entries, requestAnimationFrame stamps), so the calendar day is pinned
 * by replacing `Date` only, not with Playwright's clock, which also replaces `performance`.
 */
const ROOT = join(import.meta.dirname, "..");
const OUT = process.env.EVIDENCE ? join(ROOT, "..", "docs", "evidence", "16") : join(ROOT, "test-results", "screens", "16");
const SLOW_3G = { offline: false, latency: 400, downloadThroughput: 500_000 / 8, uploadThroughput: 500_000 / 8 };

/** What the app remembers between visits so the static shell can reserve the right space before any JS. */
const KEY = "dailies-shell";
const TODAY = "2026-11-22";
const YESTERDAY = "2026-11-21";
const ALL = GAMES.map((g) => g.id);
const PARTIAL = ["krillion", "travle", "wordle", "connections", "spelling-bee"];
const WHAT = "Logs your daily word and map games from their own sites, in this browser only, with no sign-in and no upload.";

type Snapshot = { date: string; state: "connected" | "empty" | "missing"; played: string[] } | null;
interface Scenario {
  snapshot: Snapshot;
  ext: ExtState | null;
  status: "connected" | "missing";
}

/** Predicted right: the shell reserved exactly what the app ends up showing. */
const SCENARIOS: Record<string, Scenario> = {
  "missing, a first visit": { snapshot: null, ext: null, status: "missing" },
  "missing, a returning visit": { snapshot: { date: YESTERDAY, state: "missing", played: [] }, ext: null, status: "missing" },
  "empty, returning the same day": { snapshot: { date: TODAY, state: "empty", played: [] }, ext: STATES.empty, status: "connected" },
  "empty, last visit was yesterday": { snapshot: { date: YESTERDAY, state: "connected", played: ["wordle"] }, ext: STATES.empty, status: "connected" },
  "connected, partial": { snapshot: { date: TODAY, state: "connected", played: PARTIAL }, ext: STATES.partial, status: "connected" },
  "connected, done": { snapshot: { date: TODAY, state: "connected", played: ALL }, ext: STATES.done, status: "connected" },
};

/** Predicted wrong, which only the next visit can know: measured and reported, not held to the limit. */
const MISSES: Record<string, Scenario> = {
  "the first load right after installing": { snapshot: null, ext: STATES.empty, status: "connected" },
  "a play logged since the last visit": { snapshot: { date: TODAY, state: "empty", played: [] }, ext: STATES.partial, status: "connected" },
};

interface Box {
  top: number;
  height: number;
}
interface Frame {
  t: number;
  rows: Box[];
  today: Box;
  what: Box;
}
interface Rec {
  first: { t: number; bg: string; color: string } | null;
  shell: Frame | null;
  shifts: { value: number; t: number; sources: string[] }[];
  inserted: { t: number; opacity: number; anims: { kind: string; props: string[]; duration: number; easing: string }[] } | null;
}

/** Runs in the page before anything else: pins the day, seeds the snapshot, stands in for the extension, and records frames. */
function instrument({ now, key, snapshot, ext, urls, what }: { now: number; key: string; snapshot: string | null; ext: ExtState | null; urls: string[]; what: string }) {
  const Real = Date;
  class Fixed extends Real {
    constructor(...a: unknown[]) {
      if (a.length) super(...(a as [number]));
      else super(now);
    }
    static override now() {
      return now;
    }
  }
  (window as unknown as { Date: DateConstructor }).Date = Fixed as unknown as DateConstructor;
  try {
    if (snapshot === null) localStorage.removeItem(key);
    else localStorage.setItem(key, snapshot);
  } catch {
    // A storage-less context still loads; the shell then takes its default.
  }

  if (ext) {
    const post = () => window.postMessage({ source: "dailies-extension", type: "state", version: "0.0.0", ...ext }, location.origin);
    window.addEventListener("message", (e) => {
      if (e.source === window && e.data?.source === "dailies-page" && e.data.type === "request") post();
    });
    document.addEventListener("DOMContentLoaded", post);
  }

  const rec: Rec = { first: null, shell: null, shifts: [], inserted: null };
  (window as unknown as { __rec: Rec }).__rec = rec;
  const describe = (n: Node | null) => (n instanceof Element ? `${n.tagName.toLowerCase()}.${[...n.classList].join(".")}` : String(n?.nodeName));
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean; sources?: { node: Node | null }[] }[]) {
      if (!e.hadRecentInput) rec.shifts.push({ value: e.value, t: e.startTime, sources: (e.sources ?? []).map((s) => describe(s.node)) });
    }
  }).observe({ type: "layout-shift", buffered: true });

  const shown = (el: Element | null | undefined): el is Element => {
    if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height };
  };
  const bg = () => {
    const html = getComputedStyle(document.documentElement).backgroundColor;
    if (html !== "rgba(0, 0, 0, 0)" || !document.body) return html;
    return getComputedStyle(document.body).backgroundColor;
  };
  const text = (sel: string, t: string) => [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === t);
  const tick = (t: number) => {
    if (!rec.first) rec.first = { t, bg: bg(), color: getComputedStyle(document.body ?? document.documentElement).color };
    if (!rec.shell) {
      const h1 = text("h1", "Dailies");
      const today = text("h2", "Today");
      const note = text("p", what);
      const rows = urls.map((u) => document.querySelector(`a[href="${u}"]`)?.closest("li"));
      if (shown(h1) && shown(today) && shown(note) && rows.every(shown)) rec.shell = { t, rows: rows.map((r) => box(r!)), today: box(today), what: box(note) };
    }
    if (performance.now() < 20_000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The first real status cell the app puts in a row: how it arrives, read in the frame after it is added.
  new MutationObserver((muts, obs) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const cell = [n, ...n.querySelectorAll("*")].find((e) => e.children.length === 0 && /^(Not played yet|Played)$/.test(e.textContent?.trim() ?? ""));
        if (!cell) continue;
        obs.disconnect();
        requestAnimationFrame((t) => {
          const anims: { kind: string; props: string[]; duration: number; easing: string }[] = [];
          for (let el: Element | null = cell; el && el !== document.body; el = el.parentElement) {
            const cs = getComputedStyle(el);
            for (const a of el.getAnimations()) {
              const effect = a.effect as KeyframeEffect;
              const timing = effect.getComputedTiming();
              if (timing.progress === null) continue;
              const props =
                a instanceof CSSTransition
                  ? [a.transitionProperty]
                  : [...new Set(effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !["offset", "computedOffset", "easing", "composite"].includes(p))))];
              const easing = a instanceof CSSTransition ? cs.transitionTimingFunction : cs.animationTimingFunction;
              anims.push({ kind: a.constructor.name, props, duration: Number(timing.duration), easing });
            }
          }
          let opacity = 1;
          for (let el: Element | null = cell; el; el = el.parentElement) opacity *= parseFloat(getComputedStyle(el).opacity);
          rec.inserted = { t, opacity, anims };
        });
        return;
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

let server: PreviewServer;
let URL_: string;
test.beforeAll(async () => {
  server = await preview({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  URL_ = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => {
  await server?.close();
});

const scheme = (info: TestInfo) => info.project.name.split("-")[1] as "light" | "dark";
const width = (info: TestInfo) => Number(info.project.name.split("-")[0]);
/** A fresh context like the project's own, for tests that need their own options. */
const contextFor = (info: TestInfo, extra: BrowserContextOptions = {}): BrowserContextOptions => {
  const u = info.project.use;
  return { viewport: u.viewport ?? null, colorScheme: u.colorScheme ?? "light", hasTouch: u.hasTouch ?? false, isMobile: u.isMobile ?? false, locale: "en-US", timezoneId: "America/New_York", deviceScaleFactor: 1, ...extra };
};
const only1440and390 = (info: TestInfo) => test.skip(width(info) === 1024, "1440 and 390");

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
  return cdp;
}

async function prepare(page: Page, s: Scenario) {
  await page.addInitScript(instrument, {
    now: NOW.getTime(),
    key: KEY,
    snapshot: s.snapshot && JSON.stringify(s.snapshot),
    ext: s.ext,
    urls: GAMES.map((g) => g.url),
    what: WHAT,
  });
  return throttle(page);
}

/** Loads under slow 3G until the app has settled in its final state, then reads what was recorded. */
async function slowLoad(page: Page, s: Scenario) {
  await prepare(page, s);
  await page.goto(URL_, { waitUntil: "commit" });
  await page.locator(`main[data-status="${s.status}"]`).waitFor({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));
  await page.waitForTimeout(500);
  return page.evaluate((urls) => {
    const rec = (window as unknown as { __rec: Rec }).__rec;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const box = (el: Element) => ({ top: el.getBoundingClientRect().top + scrollY, height: el.getBoundingClientRect().height });
    const today = [...document.querySelectorAll("h2")].find((e) => e.textContent?.trim() === "Today")!;
    const html = getComputedStyle(document.documentElement).backgroundColor;
    return {
      rec,
      responseStart: nav.responseStart,
      paints: Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, p.startTime])),
      final: {
        rows: urls.map((u) => box(document.querySelector(`a[href="${u}"]`)!.closest("li")!)),
        today: box(today),
        bg: html !== "rgba(0, 0, 0, 0)" ? html : getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
      },
      transitionAll: [...document.querySelectorAll("*")]
        .filter((el) => {
          const cs = getComputedStyle(el);
          const props = cs.transitionProperty.split(", ");
          const durations = cs.transitionDuration.split(", ").map(parseFloat);
          return props.some((p, i) => p === "all" && (durations[i % durations.length] ?? 0) > 0);
        })
        .map((el) => el.tagName + "." + el.className),
    };
  }, GAMES.map((g) => g.url));
}

const total = (shifts: { value: number }[]) => shifts.reduce((s, e) => s + e.value, 0);
const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const same = (a: Box[], b: Box[]) => a.forEach((x, i) => {
  expect(Math.abs(x.top - b[i]!.top), `row ${i} top: shell ${x.top}, app ${b[i]!.top}`).toBeLessThanOrEqual(1);
  expect(Math.abs(x.height - b[i]!.height), `row ${i} height: shell ${x.height}, app ${b[i]!.height}`).toBeLessThanOrEqual(1);
});

test.describe("16 slow 3G: a static first paint", () => {
  test("the title, its line and the 9-row shell paint within 500ms of navigation and 300ms of the first byte, in the page's own colors", async ({ page }, info) => {
    only1440and390(info);
    const r = await slowLoad(page, SCENARIOS["missing, a first visit"]!);
    expect(r.rec.shell, "a frame with the title, its line, Today and all 9 rows").not.toBeNull();
    const shell = r.rec.shell!;
    info.annotations.push({ type: "timing", description: `first byte ${Math.round(r.responseStart)}ms, shell ${Math.round(shell.t)}ms, FCP ${Math.round(r.paints["first-contentful-paint"] ?? -1)}ms` });
    expect(r.responseStart, "the throttle is on: the first byte takes the 400ms RTT").toBeGreaterThanOrEqual(390);
    expect(shell.t, "shell painted within 500ms of navigation").toBeLessThanOrEqual(500);
    expect(shell.t - r.responseStart, "shell painted within 300ms of the first byte").toBeLessThanOrEqual(300);
    expect(r.paints["first-contentful-paint"]).toBeLessThanOrEqual(500);

    // The first frame the new page paints already has the page's ground and ink for this scheme, so dark never flashes white.
    expect(r.rec.first).not.toBeNull();
    expect(r.rec.first!.t).toBeLessThanOrEqual(shell.t);
    expect(r.rec.first!.bg, "first frame background").toBe(r.final.bg);
    expect(r.rec.first!.color, "first frame text color").toBe(r.final.color);
    if (scheme(info) === "dark") expect(luminance(r.rec.first!.bg)).toBeLessThan(0.1);
    else expect(luminance(r.rec.first!.bg)).toBeGreaterThan(0.9);
  });

  for (const [name, s] of Object.entries(SCENARIOS)) {
    test(`${name}: mounting the app over the shell moves nothing, layout shift 0.01 or under`, async ({ page }) => {
      const r = await slowLoad(page, s);
      expect(r.rec.shell).not.toBeNull();
      const cls = total(r.rec.shifts);
      expect(cls, `layout shifts: ${JSON.stringify(r.rec.shifts)}`).toBeLessThanOrEqual(0.01);
      // New nodes replacing old ones are not counted as shifts, so check the geometry too: every row and the
      // Today heading sit where the shell put them, at the same height.
      expect(Math.abs(r.rec.shell!.today.top - r.final.today.top), "Today heading").toBeLessThanOrEqual(1);
      same(r.rec.shell!.rows, r.final.rows);
      expect(r.transitionAll).toEqual([]);
    });
  }

  for (const [name, s] of Object.entries(MISSES)) {
    test(`${name}: measured and reported`, async ({ page }, info) => {
      const r = await slowLoad(page, s);
      const cls = total(r.rec.shifts);
      info.annotations.push({ type: "layout shift", description: `${name}: ${cls.toFixed(4)} at ${info.project.name}` });
      mkdirSync(join(OUT, "cls"), { recursive: true });
      writeFileSync(join(OUT, "cls", `${name.replace(/\W+/g, "-")}-${info.project.name}.json`), JSON.stringify({ cls, shifts: r.rec.shifts }, null, 2));
      expect(Number.isFinite(cls)).toBe(true);
    });
  }

  for (const reduced of [false, true]) {
    test(`real content ${reduced ? "appears at once under reduced motion" : "fades in over 150 to 200ms, ease-out, opacity only"}`, async ({ page }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      const r = await slowLoad(page, SCENARIOS["empty, returning the same day"]!);
      expect(r.rec.inserted, "the first status cell was seen arriving").not.toBeNull();
      const { anims, opacity } = r.rec.inserted!;
      if (reduced) {
        expect(anims).toEqual([]);
        expect(opacity).toBe(1);
        return;
      }
      expect(anims.length).toBeGreaterThan(0);
      for (const a of anims) {
        expect(a.props, `${a.kind} animates`).toEqual(["opacity"]);
        expect(a.duration).toBeGreaterThanOrEqual(150);
        expect(a.duration).toBeLessThanOrEqual(200);
        expect(a.easing).toMatch(/ease-out|cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
      }
      expect(opacity, "still fading in on its first frame").toBeLessThan(1);
    });
  }
});

test.describe("16 the shell without JS", () => {
  /** JS off and the stylesheet refused: only what index.html carries inline. */
  async function bare(browser: Browser, info: TestInfo, options: BrowserContextOptions = {}) {
    const context = await browser.newContext(contextFor(info, { javaScriptEnabled: false, ...options }));
    const page = await context.newPage();
    await page.route(/\.css(\?|$)/, (route) => route.abort());
    await page.goto(URL_);
    return { context, page };
  }

  test("index.html alone paints the header, its line, Today and the 9 game links, the same names, hrefs, target and rel as the app", async ({ browser }, info) => {
    const { context, page } = await bare(browser, info);
    await expect(page.getByRole("heading", { level: 1, name: "Dailies" })).toBeVisible();
    await expect(page.getByText(WHAT, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
    const links = page.locator("li a[href]");
    await expect(links).toHaveCount(GAMES.length);
    expect((await links.allTextContents()).map((t) => t.trim())).toEqual(GAMES.map((g) => g.name));
    for (const [i, g] of GAMES.entries()) {
      await expect(links.nth(i)).toBeVisible();
      await expect(links.nth(i)).toHaveAttribute("href", g.url);
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("rel", "noopener");
    }
    await context.close();
  });

  test("inline CSS sets the ground and ink from prefers-color-scheme, matching the loaded app", async ({ browser, page }, info) => {
    const { context, page: bareRaw } = await bare(browser, info);
    const read = (p: Page) => p.evaluate(() => {
      const html = getComputedStyle(document.documentElement).backgroundColor;
      return { bg: html !== "rgba(0, 0, 0, 0)" ? html : getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, font: getComputedStyle(document.body).fontFamily };
    });
    const shell = await read(bareRaw);
    await page.addInitScript(instrument, { now: NOW.getTime(), key: KEY, snapshot: null, ext: STATES.empty, urls: [], what: WHAT });
    await page.goto(URL_);
    await page.locator("main[data-status=connected]").waitFor();
    const app = await read(page);
    expect(shell).toEqual(app);
    if (scheme(info) === "dark") expect(luminance(shell.bg)).toBeLessThan(0.1);
    else expect(luminance(shell.bg)).toBeGreaterThan(0.9);
    await context.close();
  });

  test("status and result cells are neutral, still placeholder blocks: no tiles, numbers or dates, nothing moving", async ({ browser }, info) => {
    const { context, page } = await bare(browser, info);
    const main = page.locator("main");
    const words = await main.innerText();
    expect(words, "no numbers or dates").not.toMatch(/\d/);
    expect(words).not.toMatch(/Played|Not played|Extension|Streak|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
    await expect(page.locator("[data-tiles], .tile, svg[role=img], canvas, img")).toHaveCount(0);
    const rows = await page.locator("li:has(a[href])").evaluateAll((lis) =>
      lis.map((li) =>
        [...li.querySelectorAll("*")].some((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return !el.textContent?.trim() && el.tagName !== "svg" && !el.closest("svg") && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && r.width > 0 && r.height > 0;
        }),
      ),
    );
    expect(rows, "each row holds a neutral block where its status goes").toEqual(Array(GAMES.length).fill(true));
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none").map((el) => el.tagName + "." + el.className),
    );
    expect(moving, "no shimmer or pulse").toEqual([]);
    await context.close();
  });
});

test.describe("16 evidence", () => {
  const STILLS = [300, 1500, 4000];
  const FILMS: Record<string, Scenario> = { "first-visit": SCENARIOS["missing, a first visit"]!, returning: SCENARIOS["connected, partial"]! };

  for (const [film, s] of Object.entries(FILMS)) {
    test(`filmstrip stills at ${STILLS.join(", ")}ms: ${film}`, async ({ page }, info) => {
      only1440and390(info);
      mkdirSync(OUT, { recursive: true });
      const cdp = await prepare(page, s);
      const start = Date.now();
      const shots = STILLS.map(
        (ms) =>
          new Promise<void>((resolve, reject) =>
            setTimeout(() => {
              cdp
                .send("Page.captureScreenshot", { format: "png" })
                .then((r) => writeFileSync(join(OUT, `slow3g-${film}-${info.project.name}-${ms}ms.png`), Buffer.from(r.data, "base64")))
                .then(resolve, reject);
            }, ms - (Date.now() - start)),
          ),
      );
      await page.goto(URL_, { waitUntil: "commit" });
      await Promise.all(shots);
    });
  }

  for (const reduced of [false, true]) {
    test(`a recording of the whole slow-3G load at 1440 dark${reduced ? ", reduced motion" : ""}`, async ({ browser }, info) => {
      test.skip(info.project.name !== "1440-dark", "1440 dark only");
      const dir = join(ROOT, "test-results", "video-16", reduced ? "reduced" : "motion");
      const context = await browser.newContext(contextFor(info, { reducedMotion: reduced ? "reduce" : "no-preference", recordVideo: { dir, size: { width: 720, height: 450 } } }));
      const page = await context.newPage();
      const s = SCENARIOS["connected, partial"]!;
      await prepare(page, s);
      await page.goto(URL_, { waitUntil: "commit" });
      await page.locator("main[data-status=connected]").waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      const video = page.video()!;
      await context.close();
      mkdirSync(OUT, { recursive: true });
      await video.saveAs(join(OUT, `slow3g-load-1440-dark${reduced ? "-reduced-motion" : ""}.webm`));
    });
  }
});
