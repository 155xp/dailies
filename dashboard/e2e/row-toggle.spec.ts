import { expect, test, type Locator, type Page } from "@playwright/test";
import { open, STATES, withState } from "./harness";

/**
 * dailies#14 new-user walk: a played row toggles its Details from a click anywhere outside the game name. A row
 * with no Details (not played yet, or played and not logged) has no action of its own, so it shows no hover or press.
 */
const fine = () => !test.info().project.name.startsWith("390");
const row = (page: Page, game: string) => page.locator(`.row[data-game="${game}"]`);
const line = (page: Page, game: string) => row(page, game).locator(".line");
const toggle = (page: Page, game: string) => row(page, game).locator(".disclosure");
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

/** Points on the row that are not the name or the Details button: its status, tiles, result and a bare spot. */
function spots(el: Element) {
  const mid = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const out: Record<string, { x: number; y: number }> = {};
  for (const sel of [".status", ".strip", ".result"]) {
    const k = el.querySelector(sel);
    if (k) out[sel] = mid(k.getBoundingClientRect());
  }
  const r = el.getBoundingClientRect();
  for (let x = r.left + 2; x < r.right - 2 && !out.bare; x += 4)
    for (const y of [r.top + 4, r.top + r.height / 2, r.bottom - 4]) if (document.elementFromPoint(x, y) === el && !out.bare) out.bare = { x, y };
  return out;
}

const lineStyle = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el);
    const props = s.transitionProperty.split(", ");
    const ms = s.transitionDuration.split(", ").map((d) => parseFloat(d) * 1000);
    return { bg: s.backgroundColor, cursor: s.cursor, scale: new DOMMatrix(s.transform === "none" ? undefined : s.transform).a, props, ms: Object.fromEntries(props.map((p, i) => [p, ms[i % ms.length]!])) };
  });

test("a played row toggles Details from a click anywhere outside the game name, the same as the button", async ({ page }) => {
  await open(page, { ext: withState(STATES.done) });
  const points = await line(page, "wordle").evaluate(spots);
  expect(Object.keys(points).sort()).toEqual([".result", ".status", ".strip", "bare"]);
  let expanded = false;
  for (const [what, p] of Object.entries(points)) {
    await page.mouse.click(p.x, p.y);
    expanded = !expanded;
    await expect(toggle(page, "wordle"), what).toHaveAttribute("aria-expanded", String(expanded));
    await expect(row(page, "wordle").locator(".card"), what).toHaveCount(expanded ? 1 : 0);
    await settle(page);
  }
  await toggle(page, "wordle").click();
  await expect(toggle(page, "wordle")).toHaveAttribute("aria-expanded", String(!expanded));
});

test("the game name still opens the game in a new tab and does not toggle Details", async ({ page }) => {
  await open(page, { ext: withState(STATES.done) });
  const link = row(page, "wordle").locator("a.name");
  expect(await link.evaluate((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")])).toEqual(["https://www.nytimes.com/games/wordle/index.html", "_blank", "noopener"]);
  const [tab] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
  await tab.close();
  await expect(toggle(page, "wordle")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "wordle").locator(".card")).toHaveCount(0);
});

test("a row with no Details shows no hover or press and a click on it does nothing", async ({ page }) => {
  await open(page, { ext: withState(STATES.partial) });
  for (const game of ["songless", "spelling-bee"]) {
    const l = line(page, game);
    await expect(l.locator(".disclosure")).toHaveCount(0);
    const rest = await lineStyle(l);
    expect(rest.cursor).not.toBe("pointer");
    const p = (await l.evaluate(spots))[".status"]!;
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    expect((await lineStyle(l)).bg, `${game} hover`).toBe(rest.bg);
    let opened = false;
    page.context().once("page", () => (opened = true));
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect((await lineStyle(l)).scale, `${game} press`).toBe(1);
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(opened, `${game} click opens nothing`).toBe(false);
    await expect(row(page, game).locator(".card")).toHaveCount(0);
  }
});

test("keyboard: the link, then one toggle button with nothing interactive inside; Enter and Space toggle with correct ARIA", async ({ page }) => {
  await open(page, { ext: withState(STATES.done) });
  const tabbable = await line(page, "wordle").evaluate((el) => ({
    stops: [...el.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].map((k) => k.className.split(" ").find((c) => c === "name" || c === "disclosure") ?? k.tagName),
    nested: el.querySelectorAll("button :is(a, button, input, select, textarea, [tabindex])").length,
  }));
  expect(tabbable).toEqual({ stops: ["name", "disclosure"], nested: 0 });
  const focused = () => page.evaluate(() => {
    const el = document.activeElement!;
    return { cls: el.className.split(" ").find((c) => c === "name" || c === "disclosure"), ring: el.matches(":focus-visible") && `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}` };
  });
  const link = row(page, "wordle").locator("a.name");
  await page.keyboard.press("Tab");
  while (!(await link.evaluate((e) => e === document.activeElement))) await page.keyboard.press("Tab");
  expect(await focused()).toEqual({ cls: "name", ring: "solid 2px" });
  await page.keyboard.press("Tab");
  expect(await focused()).toEqual({ cls: "disclosure", ring: "solid 2px" });
  const aria = () => toggle(page, "wordle").evaluate((b) => {
    const id = b.getAttribute("aria-controls");
    const target = id ? document.getElementById(id) : null;
    return { expanded: b.getAttribute("aria-expanded"), resolves: id === null || !!target, controlsCard: !!target?.querySelector(".card") };
  });
  expect(await aria()).toEqual({ expanded: "false", resolves: true, controlsCard: false });
  await page.keyboard.press("Enter");
  expect(await aria()).toEqual({ expanded: "true", resolves: true, controlsCard: true });
  await settle(page);
  await page.keyboard.press("Space");
  expect(await aria()).toEqual({ expanded: "false", resolves: true, controlsCard: false });
  await page.keyboard.press(" ");
  expect(await aria()).toEqual({ expanded: "true", resolves: true, controlsCard: true });
});

for (const reduced of [false, true]) {
  test(`row states${reduced ? " under reduced motion" : ""}: 150ms colour hover, ${reduced ? "no scale" : "a .99 press over 100 to 150ms"}, and the card-slot ${reduced ? "fade" : "rise"}`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { ext: withState(STATES.done) });
    const l = line(page, "wordle");
    const rest = await lineStyle(l);
    expect(rest.props).not.toContain("all");
    expect(rest.props.every((p) => p === "background-color" || p === "transform")).toBe(true);
    expect(rest.ms["background-color"]).toBe(150);
    expect(rest.ms.transform).toBeGreaterThanOrEqual(100);
    expect(rest.ms.transform).toBeLessThanOrEqual(150);
    const p = (await l.evaluate(spots))[".status"]!;
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(200);
    if (fine()) {
      const hovered = await lineStyle(l);
      expect(hovered.bg).not.toBe(rest.bg);
      expect(hovered.cursor).toBe("pointer");
    }
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect((await lineStyle(l)).scale).toBeCloseTo(reduced ? 1 : 0.99, 3);
    await page.mouse.up();
    const anims = await row(page, "wordle").locator(".card-slot").evaluate((el) => el.getAnimations().map((a) => [(a as CSSAnimation).animationName, a.effect!.getTiming().duration]));
    expect(anims).toEqual([reduced ? ["fade", 150] : ["rise", 200]]);
    await settle(page);
    await page.mouse.click(p.x, p.y);
    await expect(row(page, "wordle").locator(".card-slot")).toHaveCount(0);
  });
}

test("at 390 a played row is a tap target at least 44px tall and a tap on it toggles Details", async ({ page }) => {
  test.skip(fine(), "390 only");
  await open(page, { ext: withState(STATES.done) });
  const l = line(page, "wordle");
  expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const p = (await l.evaluate(spots))[".result"]!;
  await page.touchscreen.tap(p.x, p.y);
  await expect(toggle(page, "wordle")).toHaveAttribute("aria-expanded", "true");
  await settle(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect(toggle(page, "wordle")).toHaveAttribute("aria-expanded", "false");
});
