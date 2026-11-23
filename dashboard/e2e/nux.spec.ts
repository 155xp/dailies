import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { GAMES } from "../src/games";
import { audit, CLEAN } from "./guards";
import { open, shoot, STATES, withState, type ExtState, type OpenOptions } from "./harness";

/** First-run fixes from the new-user walk (dailies#5). Written before the fix; never edited after. */

const ONE: ExtState = { records: [STATES.partial.records[2]!], misses: [], lastLogAt: STATES.partial.lastLogAt };
const SCENES: Record<string, OpenOptions> = {
  "not-found": { ext: "none" },
  "connected-empty": { ext: withState(STATES.empty) },
  "connected-record": { ext: withState(ONE) },
};
const HINT = "Play any game below. Your result shows up here when you finish.";
const PIN = "Click the puzzle piece in the toolbar and pin Dailies, so you can open it any time.";

type Ext = { __ext: { set(m: unknown): void } };
const setState = (page: Page, state: ExtState) => page.evaluate((s) => (window as never as Ext).__ext.set({ kind: "state", state: s }), state);
const steps = (page: Page) => page.locator(".install .steps > li");
const firstRow = (page: Page) => page.locator(".rows > .row").first();
const top = async (l: Locator) => (await l.boundingBox())!.y;
const viewportHeight = (page: Page) => page.viewportSize()!.height;
const intersects = (a: DOMRect | { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Watches `selector` and, the moment `attr` appears on it, records its computed transition: the
 * leaving style is read in the same frame React commits it, before the element is removed.
 */
const watchLeave = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const w = window as unknown as { leave?: { property: string; duration: string; ease: string } };
    const seen = () => {
      const el = document.querySelector(`${sel}[data-leaving]`);
      if (!el || w.leave) return;
      const s = getComputedStyle(el);
      w.leave = { property: s.transitionProperty, duration: s.transitionDuration, ease: s.transitionTimingFunction };
    };
    new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-leaving"] });
  }, selector);
const leaveStyle = (page: Page) => page.waitForFunction(() => (window as unknown as { leave?: unknown }).leave).then((h) => h.jsonValue() as Promise<{ property: string; duration: string; ease: string }>);
const seconds = (d: string) => Math.max(...d.split(",").map((s) => parseFloat(s)));

test.describe("5-nux first-run fixes", () => {
  test("1. stranger test: the page title is Dailies, one heading, with one plain line saying what it does, above the list", async ({ page }) => {
    for (const opts of [...Object.values(SCENES), { ext: { kind: "silent" }, clock: "frozen" } as OpenOptions]) {
      await open(page, opts);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText("Dailies");
      // The first heading on the page, so nothing sits above it as an eyebrow.
      expect(await page.locator("h1, h2, h3").first().textContent()).toBe("Dailies");
      // No hero: a page title, not a display headline.
      expect(await h1.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(24);

      const what = page.getByText(/^Logs your daily word and map games from their own sites, in this browser only/);
      await expect(what).toHaveCount(1);
      await expect(what).toBeVisible();
      expect(await top(what)).toBeGreaterThan(await top(h1));
      expect(await top(what)).toBeLessThan(await top(firstRow(page)));
      // Said once: the old local-only sentence is merged into this line, not repeated.
      expect((await page.locator("main").innerText()).match(/this browser/gi)).toHaveLength(1);
      expect(await page.locator("main").innerText()).not.toMatch(/Results stay in this browser only/);
    }
  });

  test("2. not found: the install card leads, above the first game and within the first viewport", async ({ page }, info) => {
    await open(page, SCENES["not-found"]!);
    await expect(page.locator(".pill")).toHaveText("Extension not found");
    const card = page.locator(".install");
    const box = (await card.boundingBox())!;
    expect(box.y).toBeLessThan(await top(firstRow(page)));
    expect(box.y).toBeLessThan(viewportHeight(page));
    if (info.project.name.startsWith("1440")) expect(box.y + box.height, "whole card above the fold at 1440x900").toBeLessThanOrEqual(900);
    if (info.project.name.startsWith("390")) {
      const heading = (await card.getByRole("heading", { level: 2 }).boundingBox())!;
      const first = (await steps(page).first().boundingBox())!;
      expect(heading.y + heading.height).toBeLessThanOrEqual(844);
      expect(first.y + first.height, "heading and first step above the fold at 390x844").toBeLessThanOrEqual(844);
    }
  });

  test("3a. connected with nothing today: no install card, one short line above the list says to play", async ({ page }) => {
    await open(page, SCENES["connected-empty"]!);
    await expect(page.locator(".install")).toHaveCount(0);
    const hint = page.getByText(HINT, { exact: true });
    await expect(hint).toHaveCount(1);
    await expect(hint).toBeVisible();
    expect(await top(hint)).toBeLessThan(await top(firstRow(page)));
  });

  test("3b. connected with one record today: the line is gone; it leaves as soon as a game is logged", async ({ page }) => {
    await open(page, SCENES["connected-record"]!);
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.getByText(HINT)).toHaveCount(0);

    await open(page, SCENES["connected-empty"]!);
    await expect(page.getByText(HINT)).toBeVisible();
    await setState(page, ONE);
    await expect(page.getByText(HINT)).toHaveCount(0);
  });

  test("3c. the line enters and the install card leaves with opacity and transform only: 150-250ms in, faster out", async ({ page }) => {
    await open(page, SCENES["connected-empty"]!);
    const hint = page.getByText(HINT, { exact: true });
    const enter = await hint.evaluate((e) => { const s = getComputedStyle(e); return { property: s.transitionProperty, duration: s.transitionDuration, ease: s.transitionTimingFunction }; });
    expect(enter.property.split(", ").sort()).toEqual(["opacity", "transform"]);
    expect(seconds(enter.duration)).toBeGreaterThanOrEqual(0.15);
    expect(seconds(enter.duration)).toBeLessThanOrEqual(0.25);
    expect(enter.ease).toContain("cubic-bezier(0.23, 1, 0.32, 1)");

    await watchLeave(page, ".hint");
    await setState(page, ONE);
    const hintOut = await leaveStyle(page);
    expect(hintOut.property.split(", ").sort()).toEqual(["opacity", "transform"]);
    expect(seconds(hintOut.duration)).toBeLessThan(seconds(enter.duration));
    expect(seconds(hintOut.duration)).toBeGreaterThanOrEqual(0.1);

    await open(page, { ext: { kind: "silent" } });
    await expect(page.locator(".install")).toBeVisible();
    await watchLeave(page, ".install");
    await setState(page, STATES.empty);
    const cardOut = await leaveStyle(page);
    expect(cardOut.property.split(", ").sort()).toEqual(["opacity", "transform"]);
    expect(seconds(cardOut.duration)).toBeLessThan(0.25);
    expect(seconds(cardOut.duration)).toBeGreaterThanOrEqual(0.1);
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.getByText(HINT)).toBeVisible();
  });

  test("3d. reduced motion: the line and the install card fade over 150ms, opacity only", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, SCENES["connected-empty"]!);
    const hint = page.getByText(HINT, { exact: true });
    expect(await hint.evaluate((e) => [getComputedStyle(e).transitionProperty, getComputedStyle(e).transitionDuration])).toEqual(["opacity", "0.15s"]);
    await watchLeave(page, ".hint");
    await setState(page, ONE);
    expect(await leaveStyle(page)).toMatchObject({ property: "opacity", duration: "0.15s" });

    await open(page, { ext: { kind: "silent" } });
    await watchLeave(page, ".install");
    await setState(page, STATES.empty);
    expect(await leaveStyle(page)).toMatchObject({ property: "opacity", duration: "0.15s" });
  });

  test("4. the download illustration names no host: captured from a page with no origin, and checked before the shot", async () => {
    test.skip(test.info().project.name !== "1440-light", "runs once");
    test.setTimeout(60_000);
    const script = join(import.meta.dirname, "..", "scripts", "install-shots.mjs");
    const source = readFileSync(script, "utf8");
    expect(source).not.toMatch(/localhost/);
    expect(source).not.toMatch(/\.route\(/);

    const { captureDownload } = (await import(pathToFileURL(script).href)) as {
      captureDownload: (colorScheme: "light" | "dark", out: string) => Promise<{ text: string; html: string }>;
    };
    const out = mkdtempSync(join(tmpdir(), "dailies-download-"));
    try {
      const { text, html } = await captureDownload("light", out);
      expect(text).toContain("dailies-extension.zip");
      expect(text).not.toMatch(/http|localhost|From /i);
      expect(html).not.toMatch(/http|localhost/i);
      expect(existsSync(join(out, "download-light.png"))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
    for (const scheme of ["light", "dark"]) expect(existsSync(join(import.meta.dirname, "..", "public", "install", `download-${scheme}.png`))).toBe(true);
  });

  test("5. a final plain step says to pin Dailies from the puzzle piece, in an ordered list with no visible markers", async ({ page }) => {
    await open(page, SCENES["not-found"]!);
    await expect(page.locator(".install ol.steps")).toHaveCount(1);
    await expect(steps(page)).toHaveCount(4);
    await expect(steps(page).nth(2)).toContainText("Load unpacked");
    await expect(steps(page).nth(3)).toContainText(PIN);
    for (const li of await steps(page).all()) {
      expect(await li.evaluate((e) => getComputedStyle(e).listStyleType)).toBe("none");
      expect(await li.innerText()).not.toMatch(/^\s*0?\d\b/);
    }
    expect(await audit(page)).toEqual(CLEAN);
  });

  test("6. next to Copy address: Chrome won't open the address from a link, so paste it; the hint stays after copying", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() } }));
    await open(page, SCENES["not-found"]!);
    const step = steps(page).nth(1);
    const copy = step.getByRole("button", { name: "Copy address" });
    const hint = step.getByText(/Chrome won(?:'|’)t open (?:this|that) address from a link.*paste it into a new tab(?:'|’)s address bar/i);
    await expect(hint).toBeVisible();
    const [b, h] = [(await copy.boundingBox())!, (await hint.boundingBox())!];
    const beside = h.x >= b.x + b.width && Math.abs(h.y + h.height / 2 - (b.y + b.height / 2)) < b.height;
    const under = h.y >= b.y + b.height && h.y - (b.y + b.height) <= 16 && Math.abs(h.x - b.x) <= 1;
    expect(beside || under, "the hint sits beside or right under the button").toBe(true);
    await copy.click();
    await expect(step.locator("button")).toHaveText("Copied");
    await expect(hint).toBeVisible();
  });

  test("7. the install steps say to unzip into a folder you'll keep, and why", async ({ page }) => {
    await open(page, SCENES["not-found"]!);
    const text = `${await steps(page).nth(0).innerText()}\n${await steps(page).nth(2).innerText()}`;
    expect(text).toMatch(/unzip.*folder you(?:'|’)ll keep/i);
    expect(text).toMatch(/Documents/);
    expect(text).toMatch(/loads the extension from that folder/i);
    expect(text).toMatch(/(delet|remov|mov)\w*.*(break|stop|remove)/i);
  });

  test("8. cold load with no answer: the 9 game names and links are on the first paint and no placeholder covers one", async ({ page }, info) => {
    await open(page, { ext: { kind: "silent" }, clock: "frozen" });
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
    await page.screenshot({ path: join(import.meta.dirname, "..", "test-results", "screens", `nux-first-paint-${info.project.name}.png`) });
    const links = page.locator(".rows .row a.link");
    await expect(links).toHaveCount(9);
    expect(await links.allInnerTexts()).toEqual(GAMES.map((g) => g.name));
    for (const g of GAMES) await expect(page.locator(`.row[data-game="${g.id}"] a.link`)).toHaveAttribute("href", g.url);
    const names = await links.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    const holders = await page.locator(".skel").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    for (const n of names) {
      expect(n.width).toBeGreaterThan(0);
      for (const s of holders) expect(intersects(n, s), "a placeholder covers a game name").toBe(false);
    }
    // Still inside the 300ms answer window.
    await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
  });

  for (const [name, opts] of Object.entries(SCENES)) {
    test(`guards: ${name} passes every visual guard and is captured`, async ({ page }, info) => {
      const { external } = await open(page, opts);
      await page.locator("main img").evaluateAll((imgs) => Promise.all(imgs.map((i) => (i as HTMLImageElement).decode())));
      await page.waitForTimeout(300);
      expect(await audit(page)).toEqual(CLEAN);
      expect(external).toEqual([]);
      await shoot(page, info, `nux-${name}`);
    });
  }
});
