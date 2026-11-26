import { expect, test, type Page } from "@playwright/test";
import { GAMES } from "../src/games";
import { audit, CLEAN } from "./guards";
import { open, shoot, STATES, withState, type OpenOptions } from "./harness";

const SCENES: Record<string, OpenOptions> = {
  empty: { ext: withState(STATES.empty) },
  missing: { ext: "none" },
  partial: { ext: withState(STATES.partial) },
  done: { ext: withState(STATES.done) },
  error: { ext: { kind: "invalid" } },
};
const fine = (name: string) => !name.startsWith("390");

test.describe("3d states, type and motion", () => {
  for (const [name, opts] of Object.entries(SCENES)) {
    test(`${name}: passes every visual guard, makes no outside requests, and is captured`, async ({ page }, info) => {
      const { external } = await open(page, opts);
      expect(await audit(page)).toEqual(CLEAN);
      expect(external).toEqual([]);
      await shoot(page, info, name);
    });
  }

  test("loading: reserved space with no data; no answer within 300ms means not found", async ({ page }) => {
    await open(page, { ext: "none", clock: "frozen" });
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
    await page.clock.runFor(299);
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
    await page.clock.runFor(2);
    await expect(page.locator("main")).toHaveAttribute("data-status", "missing");
  });

  // Not found now puts the install card above the list (dailies#5 walk), so rows move for that state on purpose;
  // an answer with today's results must still leave every row where the loading state put it.
  test("loading: reserved space with no data, then an answer with today's results within 300ms, without moving rows", async ({ page }, info) => {
    await open(page, { ext: { kind: "silent" }, clock: "frozen" });
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
    await expect(page.locator(".rows .skel")).toHaveCount(GAMES.length);
    await expect(page.locator(".pill.skel")).toHaveCount(1);
    expect(await page.locator("main").innerText()).not.toMatch(/Played|Not played|Extension|Streak/);
    expect(await audit(page)).toEqual(CLEAN);
    await shoot(page, info, "loading");
    const tops = () => page.locator(".rows > .row").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const before = await tops();
    await page.clock.runFor(299);
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
    await page.evaluate((s) => (window as never as { __ext: { set(m: unknown): void } }).__ext.set({ kind: "state", state: s }), STATES.partial);
    await expect(page.locator("main")).toHaveAttribute("data-status", "connected");
    const after = await tops();
    if (!info.project.name.startsWith("390")) expect(after).toEqual(before);
    else {
      // At 390 a Not played yet row is one line (#15), which loading can't know in advance: rows may move up
      // by what those rows give back, never down, and the first row stays put.
      expect(after[0]).toBe(before[0]);
      after.forEach((t, i) => expect(t, `row ${i}`).toBeLessThanOrEqual(before[i]!));
    }
  });

  test("type: one face, one weight, body text 17px or larger, meta 13px or larger, on every text node", async ({ page }) => {
    for (const opts of Object.values(SCENES)) {
      await open(page, opts);
      const disclosure = page.locator('.row[data-game="wordle"] .disclosure');
      if (await disclosure.count()) await disclosure.click();
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        const weights = new Set<string>();
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement!;
          if (!n.textContent!.trim() || !el.checkVisibility()) continue;
          const s = getComputedStyle(el);
          const size = parseFloat(s.fontSize);
          weights.add(s.fontWeight);
          if (!s.fontFamily.startsWith('"Schibsted Grotesk"')) out.push(`face ${s.fontFamily} on "${n.textContent}"`);
          if (size < (el.closest(".meta") ? 13 : 17)) out.push(`${size}px on "${n.textContent}"`);
        }
        if (weights.size !== 1) out.push(`weights ${[...weights]}`);
        return out;
      });
      expect(bad).toEqual([]);
    }
  });

  test("every control has hover, press and focus-visible states", async ({ page }, info) => {
    test.setTimeout(120_000);
    // Handles, not nth locators: pressing Previous day opens yesterday and adds a Today pill, which would shift every index after it.
    // History's 300 day squares share one recipe: a played one and yesterday's unplayed one (both in view at 390) stand for them.
    const controls = async (p: Page) => [
      ...(await p.$$("main a:not(.sq), main button")),
      ...(await p.$$(".sq[data-played]")).slice(0, 1),
      ...(await p.$$('[data-history-row="krillion"] .sq')).slice(28, 29),
    ];
    for (const opts of [SCENES.done!, SCENES.missing!, SCENES.error!]) {
      await open(page, opts);
      const disclosure = page.locator('.row[data-game="wordle"] .disclosure');
      if (await disclosure.count()) await disclosure.click();
      for (const c of await controls(page)) {
        // A disabled control (Next on today) has hover and press off by design.
        if (!(await c.isVisible()) || (await c.isDisabled())) continue;
        const label = (await c.getAttribute("aria-label")) ?? (await c.innerText());
        const look = () => c.evaluate((e) => { const s = getComputedStyle(e); return `${s.color}|${s.backgroundColor}|${s.textDecorationColor}`; });
        await page.keyboard.press("Shift");
        await c.evaluate((e) => (e as HTMLElement).focus());
        expect(await c.evaluate((e) => e.matches(":focus-visible") && getComputedStyle(e).outlineWidth), label).toBe("2px");
        await c.evaluate((e) => (e as HTMLElement).blur());
        if (fine(info.project.name)) {
          const rest = await look();
          await c.hover();
          await page.waitForTimeout(200);
          expect(await look(), `hover ${label}`).not.toBe(rest);
        }
        const box = (await c.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(200);
        const scale = await c.evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a);
        expect(scale, `press ${label}`).toBeGreaterThanOrEqual(0.97 - 0.001);
        expect(scale, `press ${label}`).toBeLessThan(1);
        await page.mouse.up();
        await page.keyboard.press("Escape");
        await page.mouse.move(0, 0);
        // A day square opens its day and scrolls up to it; let the page come to rest before measuring the next control.
        await page.evaluate(() => new Promise<void>((done) => {
          let last = -1;
          let still = 0;
          const tick = () => {
            still = scrollY === last ? still + 1 : 0;
            last = scrollY;
            if (still >= 3) done();
            else setTimeout(tick, 50);
          };
          tick();
        }));
      }
    }
  });

  test("expanding a row shows that game's card, fading in with an 8px rise; reduced motion drops travel and scale", async ({ page }) => {
    await open(page, SCENES.done!);
    const disclosure = page.locator('.row[data-game="wordle"] .disclosure');
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const card = page.locator('.row[data-game="wordle"] .card');
    await expect(card.getByRole("link", { name: "Wordle" })).toHaveAttribute("target", "_blank");
    await expect(card.locator(".figure")).toHaveText("3/6");
    const anim = await card.evaluate((e) => { const s = getComputedStyle(e.parentElement!); return [s.animationName, s.animationDuration, s.animationTimingFunction]; });
    expect(anim).toEqual(["rise", "0.2s", "cubic-bezier(0.23, 1, 0.32, 1)"]);
    expect(await audit(page)).toEqual(CLEAN);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await disclosure.click();
    await disclosure.click();
    expect(await card.evaluate((e) => getComputedStyle(e.parentElement!).animationName)).toBe("fade");
    const pill = page.locator(".pill");
    const box = (await pill.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect(await pill.evaluate((e) => getComputedStyle(e).transform)).toBe("none");
    await page.mouse.up();
  });
});
