import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { RecordOf } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** dailies#15: the Travle card's route map. */
const SHOTS = join(import.meta.dirname, "..", "test-results", "screens", "travle-map");
const win = fixtureRecord("travle", "win-2026-11-22");
const loss = fixtureRecord("travle", "loss-2026-11-22");
const CASES = { win, loss } as const;

/** Travle's own map colors (fixtures/travle/*\/colors.json), per scheme. */
const START = { light: "rgb(180, 113, 9)", dark: "rgb(211, 134, 155)" };
const END = { light: "rgb(69, 112, 122)", dark: "rgb(125, 174, 163)" };
/** Guesses within reach of the route frame the map; the rest are named under it. */
const FRAMED = { win: ["PAN", "ECU", "BRA", "COL", "MEX", "PER"], loss: ["ECU", "ARG", "BOL", "VEN", "MEX"] };
const OFF = { win: [], loss: ["Spain", "Australia"] };
const WORDS = { perfect: "on the route", "near-perfect": "on a route, not linked", good: "small detour", poor: "big detour" };

async function openCards(page: Page, records: RecordOf<"travle">[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), records);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const c = page.locator('.card[data-game="travle"]');
  await expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
  await page.waitForTimeout(250);
  return c;
}

const scheme = () => (test.info().project.name.endsWith("dark") ? "dark" : "light");
const touch = () => test.info().project.name.startsWith("390");
const bbox = (l: Locator) =>
  l.evaluate((el) => {
    const b = (el as SVGGraphicsElement).getBBox();
    return { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height };
  });
const fill = (l: Locator) => l.evaluate((el) => getComputedStyle(el).fill);
const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity));

for (const [name, record] of Object.entries(CASES) as ["win" | "loss", RecordOf<"travle">][]) {
  test.describe(`Travle map, ${name}`, () => {
    test("real outlines framed on the start, end and every guess in reach, evenly padded, nothing on the route clipped", async ({ page }) => {
      const c = await openCards(page, [record]);
      const map = c.locator("svg[data-map]");
      const [W, H] = (await map.getAttribute("viewBox"))!.split(" ").slice(2).map(Number) as [number, number];
      // The atlas is drawn as land around the route, not just the route: every country in the frame.
      expect(await map.locator(".geo-land path").count()).toBeGreaterThan(20);
      const framed = [...record.detail.optimalRoute, ...FRAMED[name]];
      const boxes = await Promise.all(framed.map((code) => bbox(map.locator(`path[data-country="${code}"]`).first())));
      boxes.forEach((b, i) => {
        expect(b.x, framed[i]).toBeGreaterThanOrEqual(0);
        expect(b.y, framed[i]).toBeGreaterThanOrEqual(0);
        expect(b.r, framed[i]).toBeLessThanOrEqual(W);
        expect(b.b, framed[i]).toBeLessThanOrEqual(H);
      });
      const [L, T] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
      const [R, B] = [W - Math.max(...boxes.map((b) => b.r)), H - Math.max(...boxes.map((b) => b.b))];
      expect(Math.abs(L - R), `left ${L} right ${R}`).toBeLessThanOrEqual(2);
      expect(Math.abs(T - B), `top ${T} bottom ${B}`).toBeLessThanOrEqual(2);
      expect(Math.min(L, R, T, B)).toBeGreaterThanOrEqual(4);
      expect(Math.max((W - L - R) / W, (H - T - B) / H)).toBeGreaterThan(0.85);
      for (const n of OFF[name]) await expect(c.locator("[data-offmap]")).toContainText(n);
      if (!OFF[name].length) await expect(c.locator("[data-offmap]")).toHaveCount(0);
      expect(await audit(page)).toEqual(CLEAN);
    });

    test("start and end in Travle's colors for this scheme, and named on the card", async ({ page }) => {
      const c = await openCards(page, [record]);
      const map = c.locator("svg[data-map]");
      const s = scheme();
      expect(await fill(map.locator('path[data-country="CRI"][data-role="start"]'))).toBe(START[s]);
      expect(await fill(map.locator('path[data-country="CHL"][data-role="end"]'))).toBe(END[s]);
      const labels = await map.locator("text[data-place]").allTextContents();
      expect(labels).toEqual(expect.arrayContaining(["Costa Rica", "Chile"]));
      await expect(c.locator("[data-answer]")).toHaveText("Chile");
      await expect(c.locator(".geo-words")).toContainText("From Costa Rica");
    });

    test("each guess filled in its rating color, the route drawn country by country from start to end", async ({ page }) => {
      const c = await openCards(page, [record]);
      const map = c.locator("svg[data-map]");
      const byRating = new Map<string, string>();
      for (const g of record.detail.guesses.filter((g) => FRAMED[name].includes(g.country))) {
        const shape = map.locator(`path[data-country="${g.country}"][data-role="guess"]`);
        await expect(shape, g.country).toHaveAttribute("data-rating", g.rating);
        const f = await fill(shape);
        expect(byRating.get(g.rating) ?? f, g.country).toBe(f);
        byRating.set(g.rating, f);
        const swatch = c.locator(`[data-legend] [data-row="${g.country}"] [data-swatch]`);
        expect(await swatch.evaluate((el) => getComputedStyle(el).backgroundColor), g.country).toBe(f);
      }
      const colors = [...byRating.values(), START[scheme()], END[scheme()]];
      expect(new Set(colors).size).toBe(colors.length);
      // The legend lists every guess in the order played, with its rating in words.
      const rows = c.locator("[data-legend] [data-row]");
      expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-row")))).toEqual(record.detail.guesses.map((g) => g.country));
      for (const g of record.detail.guesses) await expect(c.locator(`[data-row="${g.country}"]`)).toContainText(new RegExp(WORDS[g.rating], "i"));
      // The chain: start first, end last, a point inside each country in order.
      const line = map.locator("path[data-route]");
      const chain = (await line.getAttribute("data-chain"))!.split(" ");
      expect(chain[0]).toBe("CRI");
      expect(chain.at(-1)).toBe("CHL");
      const d = [(await line.getAttribute("d")) ?? "", await map.locator("path[data-gap]").evaluateAll((els) => els.map((e) => e.getAttribute("d")).join(" "))].join(" ");
      const pts = [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
      for (const [i, code] of chain.entries()) {
        const b = await bbox(map.locator(`path[data-country="${code}"]`).first());
        expect(pts.some((p) => p.x >= b.x - 0.5 && p.x <= b.r + 0.5 && p.y >= b.y - 0.5 && p.y <= b.b + 0.5), `${i} ${code}`).toBe(true);
      }
      expect(await line.evaluate((el) => getComputedStyle(el).strokeWidth)).toBe("2px");
      if (name === "win") {
        expect(chain).toEqual(["CRI", "PAN", "COL", "PER", "CHL"]);
        await expect(map.locator("path[data-gap]")).toHaveCount(0);
        await expect(map.locator('path[data-role="missing"]')).toHaveCount(0);
      }
    });

    if (name === "loss")
      test("lost: the missing shortest-route countries are dashed outlines, listed by name, beside the N away figure", async ({ page }) => {
        const c = await openCards(page, [record]);
        const map = c.locator("svg[data-map]");
        await expect(c.locator("[data-figure] .figure")).toHaveText("3 away");
        for (const code of ["PAN", "COL", "PER"]) {
          const p = map.locator(`path[data-country="${code}"][data-role="missing"]`);
          await expect(p, code).toHaveCount(1);
          const cs = await p.evaluate((el) => ({ fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke, dash: getComputedStyle(el).strokeDasharray }));
          expect(cs.fill, code).toBe("none");
          expect(cs.stroke, code).not.toBe("none");
          expect(cs.dash, code).not.toBe("none");
          await expect(map.locator(`path[data-country="${code}"][data-rating]`)).toHaveCount(0);
        }
        await expect(c.locator("[data-missing]")).toHaveText("Missing Panama, Colombia, Peru");
        const gap = map.locator("path[data-gap]");
        await expect(gap).toHaveCount(1);
        expect(await gap.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe("none");
      });

    test("hover or focus a guess: its outline rises and its name and rating show; keyboard focus is visible", async ({ page }) => {
      const c = await openCards(page, [record]);
      const map = c.locator("svg[data-map]");
      const g = record.detail.guesses[0]!;
      const label = `${(await c.locator(`[data-row="${g.country}"] [data-name]`).textContent())!}, ${WORDS[g.rating]}`;
      for (const o of await map.locator("[data-outline]").all()) expect(await opacity(o)).toBe(0);
      await expect(map.locator("[data-hover-label]")).toHaveCount(0);
      if (!touch()) {
        const target = map.locator(`path[data-country="BRA"], path[data-country="ARG"]`).first();
        const code = (await target.getAttribute("data-country"))!;
        await target.hover({ force: true });
        await expect(c.locator(`[data-row="${code}"]`)).toHaveAttribute("data-active", "");
        await expect.poll(() => opacity(map.locator(`[data-outline="${code}"]`))).toBe(1);
        await expect(map.locator("[data-hover-label]")).toContainText(code === "BRA" ? "Brazil, small detour" : "Argentina, small detour");
        await page.mouse.move(0, 0);
        await expect(map.locator("[data-hover-label]")).toHaveCount(0);
      }
      // Keyboard: the game link first.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Tab");
      const link = c.locator(".card-title a");
      await expect(link).toBeFocused();
      expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      // Then on through the chart (it sits above the list) to the first guess row.
      const row = c.locator(`[data-row="${g.country}"]`);
      for (let i = 0; i < 3 && !(await row.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
      await expect(row).toBeFocused();
      expect(await row.evaluate((el) => [el.matches(":focus-visible"), getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth])).toEqual([true, "solid", "2px"]);
      await expect(row).toHaveAttribute("data-active", "");
      await expect.poll(() => opacity(map.locator(`[data-outline="${g.country}"]`))).toBe(1);
      await expect(map.locator("[data-hover-label]")).toHaveText(label);
      // The label stays inside the map.
      const [W, H] = (await map.getAttribute("viewBox"))!.split(" ").slice(2).map(Number) as [number, number];
      const lb = await bbox(map.locator("[data-hover-label]"));
      expect(lb.x).toBeGreaterThanOrEqual(0);
      expect(lb.r).toBeLessThanOrEqual(W);
      expect(lb.y).toBeGreaterThanOrEqual(0);
      expect(lb.b).toBeLessThanOrEqual(H);
      await page.keyboard.press("Tab");
      await expect(row).not.toHaveAttribute("data-active", "");
    });

    test("motion is opacity and transform only: no transition on any other property in the map or the legend", async ({ page }) => {
      const c = await openCards(page, [record]);
      const bad = await c.evaluate((card) =>
        [...card.querySelectorAll("svg[data-map] *, [data-legend], [data-legend] *")].flatMap((el) => {
          const cs = getComputedStyle(el);
          const props = cs.transitionProperty.split(", ");
          const durs = cs.transitionDuration.split(", ");
          return props.filter((p, i) => parseFloat(durs[i % durs.length]!) > 0 && !["opacity", "transform"].includes(p)).map((p) => `${el.tagName} ${p}`);
        }),
      );
      expect(bad).toEqual([]);
    });

    test("text reaches 4.5:1 and every fill, outline and the route line 3:1 against the card", async ({ page }, info) => {
      const c = await openCards(page, [record]);
      const all = await c.evaluate((card) => {
        const parse = (s: string) => {
          const m = s.match(/[\d.]+/g)!.map(Number);
          return s.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255] : [m[0]!, m[1]!, m[2]!];
        };
        const lum = (s: string) => {
          const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          const [r, g, b] = parse(s);
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        const ratio = (a: string, b: string) => {
          const [x, y] = [lum(a), lum(b)];
          return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
        };
        const bg = getComputedStyle(card).backgroundColor;
        const marks = [...card.querySelectorAll("svg[data-map] [data-mark], [data-swatch]")].map((el) => {
          const cs = getComputedStyle(el);
          const color = el.tagName === "I" || el.tagName === "SPAN" ? cs.backgroundColor : cs.fill !== "none" ? cs.fill : cs.stroke;
          return { kind: "mark", what: `${el.tagName} ${el.getAttribute("data-mark") ?? "swatch"} ${el.getAttribute("data-country") ?? ""}`, ratio: ratio(color, bg) };
        });
        const texts = [...card.querySelectorAll("svg[data-map] text, [data-legend] [data-row] *, .geo-words *, [data-figure] *")]
          .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
          .map((el) => {
            const cs = getComputedStyle(el);
            return { kind: "text", what: el.textContent!.slice(0, 30), ratio: ratio(el instanceof SVGElement ? cs.fill : cs.color, bg) };
          });
        return [...marks, ...texts];
      });
      await info.attach(`travle-contrast-${name}`, { body: JSON.stringify(all, null, 1), contentType: "application/json" });
      for (const kind of ["start", "end", "guess", "route", "pin"]) expect(all.some((m) => m.what.includes(kind)), kind).toBe(true);
      if (name === "loss") expect(all.some((m) => m.what.includes("missing"))).toBe(true);
      expect(all.filter((m) => m.kind === "text").length).toBeGreaterThan(8);
      expect(all.filter((m) => m.ratio < (m.kind === "text" ? 4.5 : 3))).toEqual([]);
    });

    test("finished layout: the two columns end together at 1024 and up, nothing overlaps, every guard passes", async ({ page }) => {
      const c = await openCards(page, [record]);
      const out = await c.evaluate((card) => {
        const r = (e: Element) => e.getBoundingClientRect();
        const cols = [...card.querySelectorAll("[data-result], [data-side]")];
        const kids = cols.flatMap((col) => [...col.children]).concat([...card.querySelectorAll("[data-legend] [data-row]")]);
        const overlaps: string[] = [];
        for (let i = 0; i < kids.length; i++)
          for (let j = i + 1; j < kids.length; j++) {
            const [a, b] = [r(kids[i]!), r(kids[j]!)];
            if (kids[i]!.contains(kids[j]!) || kids[j]!.contains(kids[i]!)) continue;
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${kids[i]!.className} / ${kids[j]!.className}`);
          }
        const ends = cols.map((col) => Math.max(...[...col.children].map((k) => r(k).bottom)));
        return { cols: cols.length, ends, overlaps, side: card.querySelector("[data-side] [data-legend]") !== null };
      });
      expect(out.overlaps).toEqual([]);
      expect(out.cols).toBe(2);
      expect(out.side).toBe(true);
      if (!touch()) expect(Math.abs(out.ends[0]! - out.ends[1]!), `column ends ${out.ends}`).toBeLessThanOrEqual(24);
      expect(await audit(page)).toEqual(CLEAN);
    });
  });
}

test.describe("Travle on the dashboard", () => {
  test("Details opens the card with the card-slot rise and closes it; the map passes every guard", async ({ page }) => {
    await open(page, { ext: withState(STATES.done) });
    const disclosure = page.locator('.row[data-game="travle"] .disclosure');
    await disclosure.click();
    const slot = page.locator(".card-slot", { has: page.locator('.card[data-game="travle"]') });
    expect(await slot.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(["rise", "0.2s"]);
    await expect(slot.locator(".card")).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
    await page.waitForTimeout(300);
    expect(await audit(page)).toEqual(CLEAN);
    await disclosure.click();
    await expect(page.locator('.card[data-game="travle"]')).toHaveCount(0);
  });

  test("under reduced motion Details fades the card in instead", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { ext: withState(STATES.done) });
    await page.locator('.row[data-game="travle"] .disclosure').click();
    const slot = page.locator(".card-slot", { has: page.locator('.card[data-game="travle"]') });
    expect(await slot.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(["fade", "0.15s"]);
  });
});

test.describe("evidence", () => {
  test("stills of the won and lost Travle cards", async ({ page }, info) => {
    test.skip(info.project.name.startsWith("1024"), "1440 and 390");
    for (const [name, record] of Object.entries(CASES)) {
      const c = await openCards(page, [record]);
      await c.screenshot({ path: join(SHOTS, `${name}-${info.project.name}.png`) });
    }
  });
});
