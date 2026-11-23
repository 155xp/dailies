import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { enclosure } from "../../src/parsers/enclose-horse";
import type { RecordOf } from "../../src/record";
import { fixtureRecords } from "../fixture-records";
import { BASE, NOW, open, serve, STATES, withState, type ExtState } from "./harness";

const SHOTS = join(import.meta.dirname, "..", "test-results", "screens", "polish");
const horse = fixtureRecords().find((r) => r.game === "enclose-horse") as RecordOf<"enclose-horse">;

async function openCards(page: Page, records = [horse]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), { records, history: records });
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The spec's tint: 20% of the gold medal color (#fff0b3) over the sampled grass (#1b6b3a). */
const mix = (a: number, b: number) => Math.round(0.2 * a + 0.8 * b);
const TINT = `rgb(${mix(0xff, 0x1b)}, ${mix(0xf0, 0x6b)}, ${mix(0xb3, 0x3a)})`;
const tinted = (page: Page) =>
  page.locator('.card[data-game="enclose-horse"] [data-board] > *').evaluateAll((els, tint) => els.flatMap((e, i) => (getComputedStyle(e).backgroundColor === tint ? [i] : [])), TINT);

test.describe("enclose.horse: the enclosed area is tinted", () => {
  test("the fixture board tints exactly the cells the walls enclose around the horse, and they score the record's score", async ({ page }) => {
    await openCards(page);
    const pen = enclosure(horse.detail.map.split("\n"), horse.detail.walls);
    const cells = await tinted(page);
    expect(cells).toEqual(pen.cells);
    // The game scores 1 per enclosed cell plus its items: cherry +3, golden apple +10, bees -5 (src/parsers/enclose-horse.ts).
    const tiles = horse.detail.map.split("\n").join("");
    const items = cells.reduce((sum, i) => sum + ({ C: 3, G: 10, S: -5 }[tiles[i]!] ?? 0), 0);
    expect(cells.length + items).toBe(horse.detail.score);
  });

  test("an escaped board, with no walls placed, tints nothing", async ({ page }) => {
    await openCards(page, [{ ...horse, detail: { ...horse.detail, walls: [] } }]);
    await expect(page.locator('.card[data-game="enclose-horse"] [data-board] > *')).toHaveCount(horse.detail.cols * horse.detail.rows);
    expect(await tinted(page)).toEqual([]);
  });
});

/** SYNTHETIC: no captured Mini result exists (fixtures/mini), so this made-up one puts a Mini tile in the strip. */
const mini: RecordOf<"mini"> = { game: "mini", date: "2026-11-22", puzzleNo: null, status: "won", score: 83, detail: { timeSeconds: 83 } };
const STRIPS: Record<string, ExtState> = {
  done: { ...STATES.done, records: [...STATES.done.records, mini], misses: [] },
  partial: STATES.partial,
};

test.describe("today strip: every tile reaches 3:1 against its row", () => {
  for (const [name, state] of Object.entries(STRIPS)) {
    test(`every game's strip tiles, by fill or by a 1px inner border, are 3:1 against the row (${name})`, async ({ page }) => {
      await open(page, { ext: withState(state) });
      const tiles = await page.locator(".row .strip .tile").evaluateAll((els) => {
        const parse = (c: string): number[] => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          return c.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255, m[3] ?? 1] : [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
        };
        const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i]! * top[3]! + under[i]! * (1 - top[3]!));
        const lum = (c: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
        };
        const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        return els.map((t) => {
          let paint = t.parentElement!;
          while (parse(getComputedStyle(paint).backgroundColor)[3]! < 1 && paint.parentElement) paint = paint.parentElement;
          const row = parse(getComputedStyle(paint).backgroundColor);
          const fill = over(parse(getComputedStyle(t).backgroundColor), row);
          // An inner border: a 1px-or-wider inset ring, painted over the tile's own fill.
          const rings = getComputedStyle(t).boxShadow.split(/,(?![^(]*\))/).filter((s) => s.includes("inset") && parseFloat(s.trim().split(/\)\s+/)[1]!.split(/\s+/)[3]!) >= 1);
          const edge = Math.max(0, ...rings.map((s) => ratio(over(parse(s.match(/^\s*(\w+\([^)]*\))/)![1]!), fill), row)));
          return { game: t.closest(".row")!.getAttribute("data-game"), fill: getComputedStyle(t).backgroundColor, best: Math.round(Math.max(ratio(fill, row), edge) * 100) / 100 };
        });
      });
      expect(new Set(tiles.map((t) => t.game)).size).toBe(name === "done" ? 9 : STATES.partial.records.length);
      expect(tiles.filter((t) => t.best < 3)).toEqual([]);
    });
  }
});

test.describe("favicon", () => {
  for (const path of ["", "cards/index.html"]) {
    test(`${path || "dashboard"}: links a neutral SVG icon and a 32px fallback that load with 200, and nothing errors on load`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
      await serve(page);
      await page.clock.setFixedTime(NOW);
      await page.goto(BASE + path);
      await page.locator("main[data-status]:not([data-status=loading])").waitFor();
      const links = await page.locator('link[rel~="icon"]').evaluateAll((els) => els.map((l) => ({ href: (l as HTMLLinkElement).href, type: l.getAttribute("type"), sizes: l.getAttribute("sizes") })));
      expect(links.map((l) => l.type)).toContain("image/svg+xml");
      expect(links.some((l) => l.sizes === "32x32")).toBe(true);
      for (const href of [...links.map((l) => l.href), BASE + "favicon.ico"]) {
        const res = await page.evaluate((u) => fetch(u + "?probe").then(async (r) => ({ status: r.status, bytes: [...new Uint8Array(await r.arrayBuffer())].slice(0, 4) })), href);
        expect(res.status, href).toBe(200);
        expect(res.bytes.length, href).toBe(4);
      }
      const svg = await page.evaluate((u) => fetch(u).then((r) => r.text()), links.find((l) => l.type === "image/svg+xml")!.href);
      expect(svg).not.toMatch(/<text|<image|font-family/);
      await page.waitForTimeout(300);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("evidence", () => {
  test("stills: the enclose.horse card, and the today strip in light", async ({ page }, info) => {
    const [width, scheme] = info.project.name.split("-");
    test.skip(width === "1024", "1440 and 390 only");
    mkdirSync(SHOTS, { recursive: true });
    await openCards(page);
    await page.locator('.card[data-game="enclose-horse"]').screenshot({ path: join(SHOTS, `enclose-horse-${width}-${scheme}.png`) });
    if (info.project.name !== "1440-light") return;
    await open(page, { ext: withState(STRIPS.done!) });
    await page.locator(".rows, main").first().screenshot({ path: join(SHOTS, "today-strip-1440-light.png") });
  });
});
