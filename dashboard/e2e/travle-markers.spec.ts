import { expect, test, type Locator, type Page } from "@playwright/test";
import type { RecordOf } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { BASE, NOW, serve } from "./harness";

/** dailies#15 review: start and end markers in Travle's colors, and a card-colored backing behind the hover label. */
const win = fixtureRecord("travle", "win-2026-11-22");
const loss = fixtureRecord("travle", "loss-2026-11-22");
const COLOR = {
  start: { light: "rgb(180, 113, 9)", dark: "rgb(211, 134, 155)" },
  end: { light: "rgb(69, 112, 122)", dark: "rgb(125, 174, 163)" },
};

async function openCard(page: Page, record: RecordOf<"travle">) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), [record]);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const c = page.locator('.card[data-game="travle"]');
  await expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
  await page.waitForTimeout(250);
  return c;
}

const scheme = () => (test.info().project.name.endsWith("dark") ? "dark" : "light");
const box = (l: Locator) =>
  l.evaluate((el) => {
    const b = (el as SVGGraphicsElement).getBBox();
    return { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height, w: b.width, h: b.height };
  });
const style = (l: Locator) =>
  l.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fill: cs.fill, stroke: cs.stroke, strokeWidth: parseFloat(cs.strokeWidth), paintOrder: cs.paintOrder };
  });
const viewBox = async (map: Locator) => (await map.getAttribute("viewBox"))!.split(" ").slice(2).map(Number) as [number, number];

function ratio(a: string, b: string) {
  const lum = (s: string) => {
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, bl] = s.match(/[\d.]+/g)!.map(Number);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test.describe("start and end markers", () => {
  test("a start or end country under 12px gets a ring in its Travle color; the route's end dots take those colors", async ({ page }) => {
    const c = await openCard(page, win);
    const map = c.locator("svg[data-map]");
    const card = await c.evaluate((el) => getComputedStyle(el).backgroundColor);
    const s = scheme();
    // Costa Rica is a few pixels at every width, so the won fixture always exercises the ring.
    expect(Math.max(...Object.values(await box(map.locator('path[data-role="start"]'))).slice(4))).toBeLessThan(12);
    for (const role of ["start", "end"] as const) {
      const country = await box(map.locator(`path[data-role="${role}"]`));
      const ring = map.locator(`circle[data-ring="${role}"]`);
      if (Math.max(country.w, country.h) < 12) {
        await expect(ring, role).toHaveCount(1);
        const r = Number(await ring.getAttribute("r"));
        expect(r, role).toBeGreaterThanOrEqual(7);
        expect(r, role).toBeLessThanOrEqual(9);
        const rs = await style(ring);
        expect(rs.fill, role).toBe("none");
        expect(rs.stroke, role).toBe(COLOR[role][s]);
        expect(rs.strokeWidth, role).toBe(2);
        const [cx, cy] = [Number(await ring.getAttribute("cx")), Number(await ring.getAttribute("cy"))];
        expect(cx >= country.x - 0.5 && cx <= country.r + 0.5 && cy >= country.y - 0.5 && cy <= country.b + 0.5, `${role} ring on its country`).toBe(true);
      } else await expect(ring, role).toHaveCount(0);
      const marker = map.locator(`[data-marker="${role}"]`);
      await expect(marker, role).toHaveCount(1);
      const ms = await style(marker);
      expect(ms.stroke, role).toBe(COLOR[role][s]);
      expect(ratio(ms.stroke, card), role).toBeGreaterThanOrEqual(3);
      const dot = map.locator(`circle[data-end-dot="${role}"]`);
      await expect(dot, role).toHaveCount(1);
      expect((await style(dot)).fill, role).toBe(COLOR[role][s]);
    }
  });
});

test.describe("hover label", () => {
  for (const [name, record] of [["win", win], ["loss", loss]] as const) {
    test(`${name}: every guess's label sits on a card-colored backing inside the map, its text 4.5:1 against that card color`, async ({ page }) => {
      const c = await openCard(page, record);
      const map = c.locator("svg[data-map]");
      const [W, H] = await viewBox(map);
      const card = await c.evaluate((el) => getComputedStyle(el).backgroundColor);
      const codes = await map.locator('path[data-role="guess"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-country")!));
      expect(codes.length).toBeGreaterThan(3);
      for (const code of codes) {
        await c.locator(`[data-row="${code}"]`).focus();
        const label = map.locator("[data-hover-label]");
        await expect(label, code).toHaveCount(1);
        const back = map.locator("[data-hover-backing]");
        await expect(back, code).toHaveCount(1);
        const [t, b] = [await box(label), await box(back)];
        for (const [what, k] of [["label", t], ["backing", b]] as const) {
          expect(k.x, `${code} ${what}`).toBeGreaterThanOrEqual(0);
          expect(k.y, `${code} ${what}`).toBeGreaterThanOrEqual(0);
          expect(k.r, `${code} ${what}`).toBeLessThanOrEqual(W);
          expect(k.b, `${code} ${what}`).toBeLessThanOrEqual(H);
        }
        expect(t.x >= b.x && t.r <= b.r && t.y >= b.y && t.b <= b.b, `${code} text inside its backing`).toBe(true);
        const [ts, bs] = [await style(label), await style(back)];
        expect(bs.fill, code).toBe(card);
        expect(ts.stroke, code).toBe(card);
        expect(ts.paintOrder, code).toMatch(/^stroke/);
        expect(ts.strokeWidth, code).toBeGreaterThanOrEqual(3);
        expect(ratio(ts.fill, card), code).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
