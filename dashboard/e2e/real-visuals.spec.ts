import { expect, test, type Locator, type Page } from "@playwright/test";
import { enclosure } from "../../src/parsers/enclose-horse";
import type { DailyRecord, RecordOf } from "../../src/record";
import { fixtureRecord, fixtureRecords } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, ORIGIN, serve, STATES, withState } from "./harness";

/**
 * dailies#13: every card looks like the real game. Wordle as its tile grid, a high-contrast palette,
 * enclose.horse as an original layered SVG redraw, Krillion answers on their tier tiles.
 */

interface Preview {
  records: DailyRecord[];
  history?: DailyRecord[];
}

const real = fixtureRecords();
const byGame = <G extends DailyRecord["game"]>(g: G) => real.find((r) => r.game === g) as RecordOf<G>;
const wordle = byGame("wordle");
const horse = byGame("enclose-horse");
const krill = byGame("krillion");
const krillMiss = fixtureRecord("krillion", "partial-2026-11-22");
const conn = byGame("connections");

/** Wordle's own palette, by scheme, and its high-contrast mode (the same in both schemes). */
const WORDLE = {
  light: { correct: "#6aaa64", present: "#c9b458", absent: "#787c7e" },
  dark: { correct: "#538d4e", present: "#b59f3b", absent: "#3a3a3c" },
};
const WORDLE_HC = { correct: "#f5793a", present: "#85c0f9" };
/** Krillion's tier colors from the game's CSS (fixtures/krillion/.../dom-colors.json). */
const TIER: Record<string, string> = {
  plankton: "#8fa3c4",
  tooclever: "#ff9f43",
  schooler: "#4de3ff",
  rare: "#ff5252",
  deepcut: "#9d7bff",
  krillion: "#ffd166",
  miss: "#3d4f6e",
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
const scheme = (page: Page) => page.evaluate(() => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) as Promise<"light" | "dark">;
const card = (page: Page, game: DailyRecord["game"]) => page.locator(`.card[data-game="${game}"]`);

async function openCards(page: Page, preview?: Preview, contrast: "more" | "no-preference" = "no-preference") {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ contrast });
  if (preview) await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), preview);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Contrast of every text node inside the given tiles against the tile's own painted fill. */
const tileTextContrast = (tiles: Locator) =>
  tiles.evaluateAll((els) => {
    const parse = (c: string): number[] => {
      const m = c.match(/[\d.]+/g)!.map(Number);
      return c.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255, m[3] ?? 1] : [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
    };
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
    };
    const out: { text: string; fg: string; bg: string; ratio: number }[] = [];
    for (const tile of els) {
      const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent!.trim() || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        let paint: Element | null = el;
        while (paint && parse(getComputedStyle(paint).backgroundColor)[3]! < 1) paint = paint.parentElement;
        const fg = parse(getComputedStyle(el).color);
        const back = parse(getComputedStyle(paint ?? document.body).backgroundColor);
        const [a, b] = [lum(fg), lum(back)];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        out.push({ text: n.textContent!.trim(), fg: getComputedStyle(el).color, bg: getComputedStyle(paint ?? document.body).backgroundColor, ratio: Math.round(ratio * 100) / 100 });
      }
    }
    return out;
  });

test.describe("Wordle: the real tile grid", () => {
  const rows = (page: Page) => card(page, "wordle").locator("[data-tiles] [data-guess-row]");

  test("one row per guess, five lettered tiles each in Wordle's colors, empty bordered rows up to six", async ({ page }) => {
    await openCards(page);
    const palette = WORDLE[await scheme(page)];
    await expect(rows(page)).toHaveCount(6);
    for (let r = 0; r < 6; r++) {
      const row = rows(page).nth(r);
      const tiles = row.locator("[data-tile]");
      await expect(tiles).toHaveCount(5);
      const guess = wordle.detail.guesses[r];
      await expect(row).toHaveAttribute("data-state", guess ? "filled" : "empty");
      for (let i = 0; i < 5; i++) {
        const tile = tiles.nth(i);
        if (guess) {
          await expect(tile).toHaveText(guess[i]!.toUpperCase());
          expect(await bg(tile)).toBe(rgb(palette[wordle.detail.evaluations[r]![i]!]));
        } else {
          await expect(tile).toHaveText("");
          expect(await bg(tile)).toBe("rgba(0, 0, 0, 0)");
          // Empty-bordered: a visible ring of at least 1px drawn as a border or an inset shadow.
          const ring = await tile.evaluate((el) => {
            const cs = getComputedStyle(el);
            const inset = cs.boxShadow.split(/,(?![^(]*\))/).filter((s) => s.includes("inset")).map((s) => parseFloat(s.replace(/rgba?\([^)]*\)/, "").trim().split(/\s+/)[3] ?? "0"));
            return Math.max(parseFloat(cs.borderTopWidth), ...inset, 0);
          });
          expect(ring).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  test("an unfinished game draws its guesses and pads to six; a six guess loss fills every row", async ({ page }) => {
    const two: RecordOf<"wordle"> = { ...wordle, status: "partial", score: 2, detail: { ...wordle.detail, guesses: wordle.detail.guesses.slice(0, 2), evaluations: wordle.detail.evaluations.slice(0, 2) } };
    await openCards(page, { records: [two], history: [two] });
    expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(["filled", "filled", "empty", "empty", "empty", "empty"]);
    const words = ["crane", "stomp", "light", "bough", "fizzy", "jewel"];
    const lost: RecordOf<"wordle"> = { ...wordle, status: "lost", score: 7, detail: { ...wordle.detail, guesses: words, evaluations: words.map(() => ["absent", "absent", "present", "absent", "correct"]) } };
    await openCards(page, { records: [lost], history: [lost] });
    expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(Array(6).fill("filled"));
    expect((await card(page, "wordle").locator("[data-tile]").allTextContents()).join("")).toBe(words.join("").toUpperCase());
  });

  test("no text-only fallback: guesses appear only as visible tiles, never as words in text", async ({ page }) => {
    await openCards(page);
    const c = card(page, "wordle");
    const sizes = await c.locator("[data-guess-row][data-state=filled] [data-tile]").evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height, e.checkVisibility()] as const));
    expect(sizes).toHaveLength(wordle.detail.guesses.length * 5);
    for (const [w, h, shown] of sizes) {
      expect(shown).toBe(true);
      expect(w).toBeGreaterThanOrEqual(30);
      expect(h).toBeGreaterThanOrEqual(30);
    }
    const outside = await c.evaluate((el) => {
      const copy = el.cloneNode(true) as Element;
      copy.querySelectorAll("[data-tiles]").forEach((t) => t.remove());
      return copy.textContent ?? "";
    });
    for (const g of wordle.detail.guesses) expect(outside.toLowerCase()).not.toContain(g.toLowerCase());
  });
});

test.describe("high-contrast palette", () => {
  const switchOf = (page: Page) => page.getByRole("switch", { name: "High-contrast colors" });
  const correctTile = (page: Page) => page.locator('.row[data-game="wordle"] .card [data-mark="correct"]').first();
  const presentTile = (page: Page) => page.locator('.row[data-game="wordle"] .card [data-mark="present"]').first();
  const absentTile = (page: Page) => page.locator('.row[data-game="wordle"] .card [data-mark="absent"]').first();

  test("a labelled dashboard toggle switches Wordle to its high-contrast colors and is remembered", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const palette = WORDLE[await scheme(page)];
    const toggle = switchOf(page);
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    expect(await bg(correctTile(page))).toBe(rgb(palette.correct));
    expect(await bg(presentTile(page))).toBe(rgb(palette.present));

    await toggle.click();
    await expect(toggle).toBeChecked();
    expect(await bg(correctTile(page))).toBe(rgb(WORDLE_HC.correct));
    expect(await bg(presentTile(page))).toBe(rgb(WORDLE_HC.present));
    expect(await bg(absentTile(page))).toBe(rgb(palette.absent));

    await page.reload();
    await page.locator("main[data-status=connected]").waitFor();
    await expect(switchOf(page)).toBeChecked();
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    expect(await bg(correctTile(page))).toBe(rgb(WORDLE_HC.correct));

    // The setting is this browser's: the cards preview on the same origin follows it.
    await page.goto(BASE + "cards/index.html");
    await page.locator("main[data-status=ready]").waitFor();
    expect(await bg(card(page, "wordle").locator('[data-mark="correct"]').first())).toBe(rgb(WORDLE_HC.correct));

    await page.goto(BASE);
    await page.locator("main[data-status=connected]").waitFor();
    await switchOf(page).click();
    await expect(switchOf(page)).not.toBeChecked();
    await page.reload();
    await page.locator("main[data-status=connected]").waitFor();
    await expect(switchOf(page)).not.toBeChecked();
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    expect(await bg(correctTile(page))).toBe(rgb(palette.correct));
  });

  test("prefers-contrast: more turns the palette on by default, and the toggle can still turn it off", async ({ page }) => {
    await page.emulateMedia({ contrast: "more" });
    await open(page, { ext: withState(STATES.done) });
    await expect(switchOf(page)).toBeChecked();
    await page.locator('.row[data-game="wordle"] .disclosure').click();
    expect(await bg(correctTile(page))).toBe(rgb(WORDLE_HC.correct));
    expect(await bg(presentTile(page))).toBe(rgb(WORDLE_HC.present));
    await switchOf(page).click();
    await expect(switchOf(page)).not.toBeChecked();
    expect(await bg(correctTile(page))).toBe(rgb(WORDLE[await scheme(page)].correct));
  });

  test("on the cards preview, prefers-contrast: more gives Wordle its high-contrast colors", async ({ page }) => {
    await openCards(page, undefined, "more");
    const tiles = card(page, "wordle").locator("[data-guess-row][data-state=filled] [data-tile]");
    const marks = wordle.detail.evaluations.flat();
    const want = { ...WORDLE[await scheme(page)], ...WORDLE_HC };
    for (const [i, mark] of marks.entries()) expect(await bg(tiles.nth(i))).toBe(rgb(want[mark]));
  });

  test("Krillion and Connections tiles carry a non-color cue in the high-contrast palette only", async ({ page }) => {
    const records = [krill, conn];
    const LABELS: Record<string, string> = { plankton: "Plankton", tooclever: "Too Clever", schooler: "Schooler", rare: "Rare", deepcut: "Deep Cut", krillion: "One in a Krillion" };
    const cues = (l: Locator) => l.evaluateAll((els) => els.map((e) => [...e.querySelectorAll("[data-cue]")].filter((c) => c.checkVisibility({ opacityProperty: true, visibilityProperty: true })).map((c) => (c.textContent ?? "").trim())));

    await openCards(page, { records }, "no-preference");
    expect((await cues(card(page, "krillion").locator("[data-answer]"))).flat()).toEqual([]);
    expect((await cues(card(page, "connections").locator("[data-tile], [data-group]"))).flat()).toEqual([]);

    await openCards(page, { records }, "more");
    expect(await cues(card(page, "krillion").locator("[data-answer]"))).toEqual(krill.detail.answers.map((a) => [a.tier ? LABELS[a.tier]! : "Missed"]));
    const tiles = conn.detail.guesses.flatMap((g) => g.levels.map((l) => [String(l + 1)]));
    expect(await cues(card(page, "connections").locator("[data-tile]"))).toEqual(tiles);
    expect(await cues(card(page, "connections").locator("[data-group]"))).toEqual(conn.detail.solved.map((l) => [String(l + 1)]));

    await openCards(page, { records: [krillMiss] }, "more");
    expect(await cues(card(page, "krillion").locator("[data-answer]"))).toEqual(krillMiss.detail.answers.map((a) => [a.tier ? LABELS[a.tier]! : "Missed"]));
  });

  for (const contrast of ["no-preference", "more"] as const) {
    test(`every tile text passes 4.5:1 in the ${contrast === "more" ? "high-contrast" : "standard"} palette`, async ({ page }) => {
      const two: RecordOf<"wordle"> = { ...wordle, date: "2026-11-21", detail: { ...wordle.detail } };
      await openCards(page, { records: [krill, krillMiss, wordle, conn], history: [two, wordle] }, contrast);
      const pairs = await tileTextContrast(page.locator('.card [data-tile], .card [data-group], .card [data-answer]'));
      // Wordle's 15 letters, Krillion's 14 answers and points, plus Connections' group words at the least.
      expect(pairs.length).toBeGreaterThan(15 + 14 * 2);
      expect(pairs.filter((p) => p.ratio < 4.5)).toEqual([]);
    });
  }
});

test.describe("enclose.horse: an original layered SVG redraw", () => {
  const board = (page: Page) => card(page, "enclose-horse").locator("svg[data-board]");
  const tiles = horse.detail.map.split("\n").join("");
  const at = (l: Locator) => l.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-at"))));

  /** For each element, the index of the board cell its drawn box is centered in. */
  const cellOf = (l: Locator, cols: number, rows: number) =>
    l.evaluateAll(
      (els, [c, r]) =>
        els.map((e) => {
          const svg = e.closest("svg")!.getBoundingClientRect();
          const b = e.getBoundingClientRect();
          const x = Math.floor(((b.left + b.width / 2 - svg.left) / svg.width) * c!);
          const y = Math.floor(((b.top + b.height / 2 - svg.top) / svg.height) * r!);
          return y * c! + x;
        }),
      [cols, rows],
    );

  test("drawn as SVG in layers, bottom to top: ground, water, enclosed tint, items, walls, horse", async ({ page }) => {
    await openCards(page);
    await expect(board(page)).toHaveCount(1);
    const layers = await board(page).locator(":scope > g[data-layer]").evaluateAll((els) => els.map((e) => e.getAttribute("data-layer")));
    expect(layers).toEqual(["ground", "water", "tint", "items", "walls", "horse"]);
  });

  test("a grass field in the game's green with a faint cell grid", async ({ page }) => {
    await openCards(page);
    const ground = board(page).locator('g[data-layer="ground"]');
    const fill = await ground.locator('[data-cell="grass"]').first().evaluate((e) => getComputedStyle(e).fill);
    const [r, g, b] = fill.match(/\d+/g)!.map(Number);
    // #186b3b family: green clearly leads, mid dark.
    expect(g!).toBeGreaterThan(r! + 40);
    expect(g!).toBeGreaterThan(b! + 20);
    expect(g!).toBeGreaterThanOrEqual(80);
    expect(g!).toBeLessThanOrEqual(140);
    const grid = ground.locator("[data-grid]");
    await expect(grid).toHaveCount(1);
    const op = await grid.evaluate((e) => Number(getComputedStyle(e).strokeOpacity) * Number(getComputedStyle(e).opacity));
    expect(op).toBeGreaterThan(0);
    expect(op).toBeLessThanOrEqual(0.35);
  });

  test("water cells are dark blue channels with a lighter rim, exactly where the map has water", async ({ page }) => {
    await openCards(page);
    const water = board(page).locator('g[data-layer="water"]');
    const cells = water.locator("[data-water]");
    expect((await at(cells)).sort((a, b) => a - b)).toEqual([...tiles].flatMap((t, i) => (t === "~" ? [i] : [])));
    expect(await cellOf(cells, horse.detail.cols, horse.detail.rows)).toEqual(await at(cells));
    const lum = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    const fill = await cells.first().evaluate((e) => getComputedStyle(e).fill);
    const [r, g, b] = fill.match(/\d+/g)!.map(Number);
    expect(b!).toBeGreaterThan(r! + 20);
    expect(b!).toBeGreaterThanOrEqual(g!);
    expect(lum(fill)).toBeLessThan(80);
    const rim = await water.locator("[data-rim]").evaluate((e) => getComputedStyle(e).stroke);
    expect(lum(rim)).toBeGreaterThan(lum(fill));
  });

  test("the horse sits on its cell and every item sprite on the cell the map gives it", async ({ page }) => {
    await openCards(page);
    const { cols, rows } = horse.detail;
    const h = board(page).locator('g[data-layer="horse"] [data-horse]');
    await expect(h).toHaveCount(1);
    expect(await at(h)).toEqual([tiles.indexOf("H")]);
    expect(await cellOf(h, cols, rows)).toEqual([tiles.indexOf("H")]);
    for (const glyph of ["C", "G", "S"]) {
      const items = board(page).locator(`g[data-layer="items"] [data-item="${glyph}"]`);
      const want = [...tiles].flatMap((t, i) => (t === glyph ? [i] : []));
      expect(want.length).toBeGreaterThan(0);
      expect((await at(items)).sort((a, b) => a - b)).toEqual(want);
      expect((await cellOf(items, cols, rows)).sort((a, b) => a - b)).toEqual(want);
    }
    // The horse sprite is mostly white.
    const white = await h.evaluate((e) => [...e.querySelectorAll("*")].some((k) => getComputedStyle(k).fill === "rgb(255, 255, 255)"));
    expect(white).toBe(true);
  });

  test("one fence piece per player wall, on the cell it occupies", async ({ page }) => {
    await openCards(page);
    const walls = board(page).locator('g[data-layer="walls"] [data-wall]');
    await expect(walls).toHaveCount(horse.detail.walls.length);
    expect((await at(walls)).sort((a, b) => a - b)).toEqual([...horse.detail.walls].sort((a, b) => a - b));
    expect((await cellOf(walls, horse.detail.cols, horse.detail.rows)).sort((a, b) => a - b)).toEqual([...horse.detail.walls].sort((a, b) => a - b));
  });

  test("the tint layer covers exactly the enclosed cells, and is empty when the horse escapes", async ({ page }) => {
    await openCards(page);
    const tint = board(page).locator('g[data-layer="tint"] [data-tint]');
    expect((await at(tint)).sort((a, b) => a - b)).toEqual(enclosure(horse.detail.map.split("\n"), horse.detail.walls).cells);
    await openCards(page, { records: [{ ...horse, detail: { ...horse.detail, walls: [] } }] });
    await expect(board(page).locator('g[data-layer="tint"]')).toHaveCount(1);
    await expect(board(page).locator('g[data-layer="tint"] [data-tint]')).toHaveCount(0);
    await expect(board(page).locator('g[data-layer="walls"] [data-wall]')).toHaveCount(0);
  });

  test("no bundled or hotlinked art: no <image>, no external href, no url() to another host", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await openCards(page);
    const svg = board(page);
    await expect(svg.locator("image, foreignObject")).toHaveCount(0);
    const refs = await svg.evaluate((s) =>
      [s, ...s.querySelectorAll("*")].flatMap((e) => [...e.attributes].filter((a) => /href$/i.test(a.name) || /url\(/i.test(a.value)).map((a) => `${e.tagName} ${a.name}=${a.value}`)),
    );
    expect(refs.filter((r) => /https?:|\/\//i.test(r))).toEqual([]);
    expect(refs.filter((r) => /href=/i.test(r) && !/href=#/i.test(r))).toEqual([]);
    expect(urls.filter((u) => new URL(u).origin !== ORIGIN)).toEqual([]);
  });

  test("the board fits inside the card and the viewport at every width", async ({ page }) => {
    await openCards(page);
    const c = card(page, "enclose-horse");
    const [box, b] = [(await c.boundingBox())!, (await board(page).boundingBox())!];
    const vw = page.viewportSize()!.width;
    expect(b.x).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
    expect(b.x + b.width).toBeLessThanOrEqual(vw);
    // Cells stay square and big enough to read the sprites.
    expect(Math.abs(b.width / horse.detail.cols - b.height / horse.detail.rows)).toBeLessThan(0.5);
    expect(b.width / horse.detail.cols).toBeGreaterThanOrEqual(vw <= 390 ? 18 : 20);
  });
});

test.describe("Krillion: answers on their tier tiles", () => {
  for (const [name, record] of [["win", krill], ["with misses", krillMiss]] as const) {
    test(`each of the seven answers is drawn on its real tier color tile (${name})`, async ({ page }) => {
      await openCards(page, { records: [record] });
      const tiles = card(page, "krillion").locator("[data-row] [data-answer]");
      await expect(tiles).toHaveCount(7);
      for (const [i, a] of record.detail.answers.entries()) {
        const tile = tiles.nth(i);
        expect(await bg(tile)).toBe(rgb(TIER[a.tier ?? "miss"]!));
        expect(a.color.toLowerCase()).toBe(TIER[a.tier ?? "miss"]);
        // The answer's own text paints on that tile: its nearest painted ancestor is the tile.
        const answer = tile.locator(".answer");
        await expect(answer).toHaveText(a.answer ?? "No answer");
        const painted = await answer.evaluate((el) => {
          let p: Element | null = el;
          while (p && getComputedStyle(p).backgroundColor.replace(/\s/g, "").match(/rgba\(.*,0\)$/)) p = p.parentElement;
          return p?.hasAttribute("data-answer") ?? false;
        });
        expect(painted).toBe(true);
        // A real tile, not a swatch: it spans most of the row.
        const [t, row] = [(await tile.boundingBox())!, (await tile.locator("xpath=ancestor::*[@data-row]").boundingBox())!];
        expect(t.width).toBeGreaterThan(row.width * 0.6);
        expect(t.height).toBeGreaterThanOrEqual(32);
      }
    });
  }
});

test.describe("guards and privacy with the new drawings", () => {
  test("the cards preview passes every visual guard in both palettes", async ({ page }) => {
    await openCards(page);
    expect(await audit(page)).toEqual(CLEAN);
    await openCards(page, undefined, "more");
    expect(await audit(page)).toEqual(CLEAN);
  });

  test("the dashboard with every card open, and the palette on, requests nothing from another host", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    const { external } = await open(page, { ext: withState(STATES.done) });
    await page.getByRole("switch", { name: "High-contrast colors" }).click();
    for (const d of await page.locator(".disclosure").all()) await d.click();
    await page.waitForTimeout(300);
    expect(await audit(page)).toEqual(CLEAN);
    expect(urls.filter((u) => new URL(u).origin !== ORIGIN)).toEqual([]);
    expect(external).toEqual([]);
  });
});
