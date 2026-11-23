import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DailyRecord, RecordOf } from "../../src/record";
import { fixtureRecord, fixtureRecords } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, open, serve, STATES, withState } from "./harness";

/** dailies#10: the Spelling Bee hive, the Mini grid, and an audit of the boards already drawn. */
const PREVIEW = BASE + "cards/index.html";
const SCREENS = join(import.meta.dirname, "..", "test-results", "screens");
const real = fixtureRecords();
const byGame = <G extends DailyRecord["game"]>(g: G) => real.find((r) => r.game === g) as RecordOf<G>;

/** SYNTHETIC: a Bee day whose found words share exactly one letter, h, so the center is known. */
const bee = byGame("spelling-bee");
const BEE_CENTER: RecordOf<"spelling-bee"> = { ...bee, score: 21, detail: { ...bee.detail, words: ["pothead", "path", "hope", "heat"], pangrams: ["pothead"], rank: "Good" } };
/** SYNTHETIC: no Mini result exists in the fixtures (fixtures/mini is gated), so the Mini is drawn from this. */
const mini = (timeSeconds: number | null): RecordOf<"mini"> => ({ game: "mini", date: "2026-11-22", puzzleNo: null, status: "won", score: timeSeconds ?? 0, detail: { timeSeconds } });

async function openCards(page: Page, records: DailyRecord[]) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), { records });
  await page.goto(PREVIEW);
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const card = (page: Page, game: DailyRecord["game"]) => page.locator(`.card[data-game="${game}"]`);
const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);

/** Every text in the given cards against the nearest opaque fill behind it, as WCAG contrast. */
const contrast = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => {
    const parse = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number);
      return c.startsWith("color(srgb") ? [m[0]! * 255, m[1]! * 255, m[2]! * 255, m[3] ?? 1] : [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const out: { text: string; bg: string; ratio: number }[] = [];
    for (const root of els) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent!.trim() || !el.checkVisibility()) continue;
        let paint: Element | null = el;
        while (paint && parse(getComputedStyle(paint).backgroundColor)[3]! < 1) paint = paint.parentElement;
        const back = getComputedStyle(paint ?? document.body).backgroundColor;
        const [a, b] = [lum(parse(getComputedStyle(el).color)), lum(parse(back))];
        out.push({ text: n.textContent!.trim().slice(0, 24), bg: back, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 });
      }
    }
    return out;
  });

/** Tiles that reach outside their card or the viewport. */
const clippedTiles = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.flatMap((el) => {
      const box = el.closest(".card")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.left < box.left || r.right > box.right || r.right > document.documentElement.clientWidth || r.width === 0 ? [el.outerHTML.slice(0, 60)] : [];
    }),
  );

test.describe("Spelling Bee hive", () => {
  test("real fixture: the seven pangram letters in a hive, center plus six, none highlighted when no single letter is shared", async ({ page }) => {
    await openCards(page, [bee]);
    const hive = card(page, "spelling-bee").locator("[data-hive]");
    const cells = hive.locator("[data-cell]");
    await expect(cells).toHaveCount(7);
    expect((await cells.allTextContents()).sort()).toEqual(["A", "D", "E", "H", "O", "P", "T"]);
    await expect(hive.locator("[data-center]")).toHaveCount(0);
    // Center plus six round it: the six sit at one distance from the middle cell.
    const boxes = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.x + r.width / 2, r.y + r.height / 2] as const));
    const [cx, cy] = boxes[0]!;
    const d = boxes.slice(1).map(([x, y]) => Math.hypot(x - cx, y - cy));
    for (const v of d) expect(Math.abs(v - d[0]!)).toBeLessThan(2);
    expect(d[0]!).toBeGreaterThan(40);
  });

  test("synthetic record with one shared letter: that letter sits in the middle cell on the Bee yellow", async ({ page }) => {
    await openCards(page, [BEE_CENTER]);
    const hive = card(page, "spelling-bee").locator("[data-hive]");
    const center = hive.locator("[data-center]");
    await expect(center).toHaveCount(1);
    await expect(center).toHaveText("H");
    await expect(hive.locator("[data-cell]").first()).toHaveAttribute("data-center", "");
    expect(await bg(center)).toBe("rgb(247, 218, 33)");
    const others = hive.locator("[data-cell]:not([data-center])");
    expect(await others.allTextContents()).toEqual(["A", "D", "E", "O", "P", "T"]);
    expect(await bg(others.first())).not.toBe("rgb(247, 218, 33)");
  });

  test("no pangram: no hive, the card keeps its rank ladder", async ({ page }) => {
    const noPangram = fixtureRecord("spelling-bee", "partial-2026-11-22");
    await openCards(page, [noPangram]);
    const c = card(page, "spelling-bee");
    await expect(c.locator("[data-hive]")).toHaveCount(0);
    await expect(c.locator("[data-ladder] [data-step]")).toHaveCount(10);
    await expect(c.locator("[data-rank]")).toHaveText("Good Start");
  });

  test("found words are listed under the hive, pangrams set heavier and darker, and the rank bar stays", async ({ page }) => {
    await openCards(page, [bee]);
    const c = card(page, "spelling-bee");
    const words = c.locator("[data-words] [data-word]");
    expect(await words.allTextContents()).toEqual(["Ahead", "Deadhead", "Deadheaded", "Pothead"]);
    const [hiveBox, listBox] = await Promise.all([c.locator("[data-hive]").boundingBox(), c.locator("[data-words]").boundingBox()]);
    expect(listBox!.y).toBeGreaterThanOrEqual(hiveBox!.y + hiveBox!.height);
    const style = (l: Locator) => l.evaluate((e) => ({ weight: Number(getComputedStyle(e).fontWeight), color: getComputedStyle(e).color, size: parseFloat(getComputedStyle(e).fontSize) }));
    const pangram = c.locator("[data-word][data-pangram]");
    await expect(pangram).toHaveText("Pothead");
    const [p, w] = await Promise.all([style(pangram), style(words.first())]);
    expect([p.weight, w.weight]).toEqual([400, 400]);
    expect(p.color).not.toBe(w.color);
    expect(w.size).toBeGreaterThanOrEqual(17);
    await expect(c.locator("[data-ladder] [data-step]")).toHaveCount(10);
    await expect(c.locator("[data-rank]")).toHaveText("Solid");
    await expect(c).toContainText("4 words");
  });
});

test.describe("Mini grid", () => {
  test("synthetic record: a 5 by 5 grid outline with no letters, and the solve time", async ({ page }) => {
    await openCards(page, [mini(83)]);
    const c = card(page, "mini");
    const cells = c.locator("[data-mini-grid] [data-cell]");
    await expect(cells).toHaveCount(25);
    expect((await cells.allTextContents()).join("")).toBe("");
    const centers = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.x), Math.round(r.y)]));
    expect(new Set(centers.map(([x]) => x)).size).toBe(5);
    expect(new Set(centers.map(([, y]) => y)).size).toBe(5);
    await expect(c.locator("[data-figure] .figure")).toHaveText("1:23");
  });

  test("synthetic record with no time: no grid is drawn", async ({ page }) => {
    await openCards(page, [mini(null)]);
    await expect(card(page, "mini").locator("[data-mini-grid]")).toHaveCount(0);
  });

  test("with no Mini result the dashboard row stays Not played yet, with no card", async ({ page }) => {
    await open(page, { ext: withState(STATES.partial) });
    const row = page.locator('.row[data-game="mini"]');
    await expect(row.locator(".status")).toHaveText("Not played yet");
    await expect(row.locator(".disclosure")).toHaveCount(0);
    await expect(page.locator("[data-mini-grid]")).toHaveCount(0);
  });
});

test.describe("existing boards audited at this width and scheme", () => {
  const w = byGame("wordle");
  const allMarks: RecordOf<"wordle"> = {
    ...w,
    status: "lost",
    score: 6,
    detail: { ...w.detail, guesses: ["crane", "moist", "plumb", "dwell", "fight", "jazzy"], evaluations: Array.from({ length: 6 }, (_, r) => Array.from({ length: 5 }, (_, i) => (["correct", "present", "absent"] as const)[(r + i) % 3]!)) },
  };
  const k = byGame("connections");
  const allGroups: RecordOf<"connections"> = {
    ...k,
    detail: { mistakes: 0, solved: [0, 1, 2, 3], guesses: [0, 1, 2, 3].map((l) => ({ words: ["ALPHA", "BRAVO", "CHARLIE", "DELTA"].map((x) => `${x}${l}`), levels: [l, l, l, l], correct: true })) },
  };
  const e = byGame("enclose-horse");
  const medals = (["perfect", "gold", "silver", "bronze"] as const).map((medal, i) => ({ ...e, date: `2026-11-1${i}`, detail: { ...e.detail, medal } }));
  const krillions = [byGame("krillion"), { ...fixtureRecord("krillion", "partial-2026-11-22"), date: "2026-11-21" }];

  const SETS: Record<string, { records: DailyRecord[]; tiles: string }> = {
    "Wordle grid, all three marks": { records: [allMarks], tiles: "[data-tile]" },
    "Connections grid and all four groups": { records: [allGroups], tiles: "[data-tile], [data-group]" },
    "enclose.horse board and all four medals": { records: medals, tiles: "[data-board], [data-medal]" },
    "Krillion answers with tier colors": { records: krillions, tiles: "[data-row], [data-swatch]" },
    "Spelling Bee hive": { records: [BEE_CENTER], tiles: "[data-hive] [data-cell]" },
    "Mini grid": { records: [mini(83)], tiles: "[data-mini-grid] [data-cell]" },
  };

  for (const [name, set] of Object.entries(SETS)) {
    test(`${name}: text passes 4.5:1 on every tile, and no tile clips`, async ({ page }) => {
      await openCards(page, set.records);
      const pairs = await contrast(page, ".card");
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.filter((p) => p.ratio < 4.5)).toEqual([]);
      await expect(page.locator(`.card :is(${set.tiles})`).first()).toBeVisible();
      expect(await clippedTiles(page, `.card :is(${set.tiles})`)).toEqual([]);
      expect((await audit(page)).clipped).toEqual([]);
    });
  }
});

test.describe("states", () => {
  test("every board card passes the visual guards, with a still for the evidence", async ({ page }, info) => {
    await openCards(page, [...real, mini(83)]);
    expect(await audit(page)).toEqual(CLEAN);
    mkdirSync(SCREENS, { recursive: true });
    await page.screenshot({ path: join(SCREENS, `boards-${info.project.name}.png`), fullPage: true });
    await openCards(page, [BEE_CENTER]);
    expect(await audit(page)).toEqual(CLEAN);
    await card(page, "spelling-bee").screenshot({ path: join(SCREENS, `bee-center-${info.project.name}.png`) });
  });

  test("the missing-data fallbacks pass the visual guards", async ({ page }) => {
    await openCards(page, [fixtureRecord("spelling-bee", "partial-2026-11-22"), mini(null)]);
    expect(await audit(page)).toEqual(CLEAN);
  });

  test("the new boards never move: no transitions or animations in the hive, word list or Mini grid", async ({ page }) => {
    await openCards(page, [bee, mini(83)]);
    await expect(page.locator("[data-hive], [data-words], [data-mini-grid]")).toHaveCount(3);
    const moving = await page.locator("[data-hive], [data-words], [data-mini-grid]").evaluateAll((roots) =>
      roots.flatMap((r) => [r, ...r.querySelectorAll("*")]).filter((el) => {
        const cs = getComputedStyle(el);
        return el.getAnimations().length > 0 || cs.animationName !== "none" || cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0);
      }).map((el) => el.outerHTML.slice(0, 60)),
    );
    expect(moving).toEqual([]);
  });

  test("reduced motion: opening the Bee and Mini cards on the dashboard runs only the card slot's fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { ext: withState({ ...STATES.done, records: [...STATES.done.records.filter((r) => r.game !== "spelling-bee"), bee, mini(83)], misses: [] }) });
    for (const game of ["spelling-bee", "mini"]) {
      await page.locator(`.row[data-game="${game}"] .disclosure`).click();
      await expect(page.locator(`.row[data-game="${game}"] .card`)).toBeVisible();
    }
    await expect(page.locator("[data-hive]")).toHaveCount(1);
    await expect(page.locator("[data-mini-grid]")).toHaveCount(1);
    // Everything that animates in the page, by computed style: only the card slots, each on the 150ms fade.
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll("*")].flatMap((el) => {
        const cs = getComputedStyle(el);
        return cs.animationName === "none" ? [] : [`${el.className} ${cs.animationName} ${cs.animationDuration}`];
      }),
    );
    expect(animated).toEqual(["card-slot fade 0.15s", "card-slot fade 0.15s"]);
  });
});
