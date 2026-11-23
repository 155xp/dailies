import { expect, test, type Page } from "@playwright/test";
import { GAMES } from "../src/games";
import { BASE, NOW, open, serve, STATES, withState, type FakeMode } from "./harness";

/**
 * dailies#16: the snapshot the app leaves for the next visit, and the shell it buys. Written before the
 * change; never edited after. The static shell is read with the app's JS refused, so only index.html and
 * its one inline script run; then the same snapshot is loaded with the app, in loading and once resolved.
 */
const KEY = "dailies-shell";
const TODAY = "2026-11-22";
const YESTERDAY = "2026-11-21";
const HINT = "Play any game below. Your result shows up here when you finish.";
const PARTIAL = ["krillion", "travle", "wordle", "connections", "spelling-bee"];
const ALL = GAMES.map((g) => g.id);

interface Case {
  snapshot: string | null;
  ext: FakeMode | "none";
  status: "connected" | "missing";
  hint: boolean;
}
const json = (date: string, state: string, played: string[]) => JSON.stringify({ date, state, played });
const CASES: Record<string, Case> = {
  "no snapshot: a first visit reserves the install card": { snapshot: null, ext: "none", status: "missing", hint: false },
  "an unreadable snapshot is read as none": { snapshot: "{not json", ext: "none", status: "missing", hint: false },
  "missing yesterday is still missing": { snapshot: json(YESTERDAY, "missing", []), ext: "none", status: "missing", hint: false },
  "a stale date, connected yesterday: a new day, empty, with the hint": { snapshot: json(YESTERDAY, "connected", ["wordle"]), ext: withState(STATES.empty), status: "connected", hint: true },
  "empty today: the hint, no install card": { snapshot: json(TODAY, "empty", []), ext: withState(STATES.empty), status: "connected", hint: true },
  "connected today: played rows reserve their second line at 390, no hint": { snapshot: json(TODAY, "connected", PARTIAL), ext: withState(STATES.partial), status: "connected", hint: false },
  "connected today, all played": { snapshot: json(TODAY, "connected", ALL), ext: withState(STATES.done), status: "connected", hint: false },
};

const seed = (page: Page, snapshot: string | null) =>
  page.addInitScript(
    ({ key, value }) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    { key: KEY, value: snapshot },
  );

/** Where Today and each row sit, and whether the hint shows: what the shell reserves. */
const geometry = (page: Page) =>
  page.evaluate(
    ({ urls, hint }) => {
      const box = (el: Element) => ({ top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.getBoundingClientRect().height) });
      const today = [...document.querySelectorAll("h2")].find((e) => e.textContent?.trim() === "Today")!;
      const hinted = [...document.querySelectorAll("p")].some((p) => p.textContent?.trim() === hint && p.checkVisibility({ visibilityProperty: true }));
      return { today: box(today), rows: urls.map((u) => box(document.querySelector(`a[href="${u}"]`)!.closest("li")!)), hint: hinted };
    },
    { urls: GAMES.map((g) => g.url), hint: HINT },
  );
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

/** index.html alone, with its inline script: the app's scripts are refused. */
async function shell(page: Page) {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.route(/\.js(\?|$)/, (route) => route.abort());
  await page.goto(BASE);
  await page.getByRole("heading", { level: 2, name: "Today" }).waitFor();
  const g = await geometry(page);
  await page.unroute(/\.js(\?|$)/);
  return g;
}

test.describe("16 snapshot and shell", () => {
  for (const [name, c] of Object.entries(CASES)) {
    test(`${name}: the shell, the app's loading view and the resolved page agree`, async ({ page }) => {
      await seed(page, c.snapshot);
      const before = await shell(page);
      expect(before.hint, "hint reserved").toBe(c.hint);

      await open(page, { ext: { kind: "silent" }, clock: "frozen" });
      await expect(page.locator("main")).toHaveAttribute("data-status", "loading");
      expect(await geometry(page), "loading view").toEqual(before);

      await open(page, { ext: c.ext });
      await expect(page.locator("main")).toHaveAttribute("data-status", c.status);
      await settle(page);
      expect(await geometry(page), "resolved").toEqual(before);
    });
  }

  const WRITES: [string, FakeMode | "none", unknown][] = [
    ["missing", "none", { date: TODAY, state: "missing", played: [] }],
    ["empty", withState(STATES.empty), { date: TODAY, state: "empty", played: [] }],
    ["partial", withState(STATES.partial), { date: TODAY, state: "connected", played: PARTIAL }],
    ["done", withState(STATES.done), { date: TODAY, state: "connected", played: ALL }],
  ];
  for (const [name, ext, expected] of WRITES) {
    test(`${name}: the app writes the snapshot for the next visit`, async ({ page }) => {
      await seed(page, null);
      await open(page, { ext });
      await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY)).toEqual(expected);
    });
  }

  test("an answer the page can't read leaves the last snapshot as it was", async ({ page }) => {
    const last = json(TODAY, "connected", PARTIAL);
    await seed(page, last);
    await open(page, { ext: { kind: "invalid" } });
    await expect(page.locator("main")).toHaveAttribute("data-status", "error");
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(last);
  });
});
