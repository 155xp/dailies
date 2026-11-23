import { expect, test, type Page } from "@playwright/test";
import { open, STATES, withState } from "./harness";

/**
 * dailies#14 nit: a held press near a played row's left or right edge must toggle Details like a fast click.
 * The row's press feedback (scale .99) used to shrink the very box under the pointer, so a 150ms hold 3px inside
 * an edge was released outside the row and no click reached it. Each case gets a fresh page.
 */
const INSET = 3;
const HOLD = 150;
const project = () => test.info().project.name;
const only1440and390 = () => test.skip(project().startsWith("1024"), "1440 and 390 only");

const row = (page: Page) => page.locator('.row[data-game="wordle"]');
const toggle = (page: Page) => row(page).locator(".disclosure");
const expanded = (page: Page) => toggle(page).getAttribute("aria-expanded");
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));

type Kind = "plain" | "link" | "disclosure" | "other";
interface Spot {
  x: number;
  y: number;
  kind: Kind;
}

/**
 * A point INSET px inside the row's left or right edge, at the y nearest the row's middle whose hit is the row
 * itself or a non-interactive child. If every y there lands on the game name or the Details button, that point.
 */
function edgeSpot([edge, inset]: ["left" | "right", number]): Spot {
  const li = document.querySelector('.row[data-game="wordle"]')!;
  const r = li.querySelector(".line")!.getBoundingClientRect();
  const x = edge === "left" ? r.left + inset : r.right - inset;
  const mid = (r.top + r.bottom) / 2;
  const found: Spot[] = [];
  for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y++) {
    const el = document.elementFromPoint(x, y);
    if (!el || !li.contains(el) || el.closest(".card-slot")) continue;
    const act = el.closest("a, button");
    const kind: Kind = !act ? "plain" : act.matches("a.name") ? "link" : act.matches(".disclosure") ? "disclosure" : "other";
    found.push({ x, y, kind });
  }
  const order: Kind[] = ["plain", "link", "disclosure", "other"];
  found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || Math.abs(a.y - mid) - Math.abs(b.y - mid));
  return found[0]!;
}

/** What holds at the point mid-press: the hit element, the row's hit box and the scaled line. */
function heldState({ x, y }: { x: number; y: number }) {
  const li = document.querySelector('.row[data-game="wordle"]')!;
  // The row's hit box: the row's one child besides the card slot, the box a press on the line lands in.
  const box = li.querySelector(":scope > :not(.card-slot)")!;
  const line = li.querySelector(".line")!;
  const el = document.elementFromPoint(x, y);
  return {
    inBox: !!el && box.contains(el),
    onLink: !!el?.closest("a.name"),
    box: box.getBoundingClientRect().toJSON() as DOMRect,
    transform: getComputedStyle(line).transform,
  };
}

const boxRect = (page: Page) => row(page).evaluate((li) => li.querySelector(":scope > :not(.card-slot)")!.getBoundingClientRect().toJSON() as DOMRect);

/** mouse.move, mouse.down, a 150ms hold (the state is read at its end), mouse.up. */
async function hold(page: Page, s: Spot) {
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD);
  const held = await page.evaluate(heldState, { x: s.x, y: s.y });
  await page.mouse.up();
  return held;
}

/** Reads a computed `matrix(a, b, c, d, e, f)` in the test runner, which has no DOMMatrix. */
const scaleOf = (t: string) => {
  const [a, b, c, d] = t === "none" ? [1, 0, 0, 1] : t.slice(t.indexOf("(") + 1, -1).split(",").map(Number);
  return { a: a!, d: d!, b: b!, c: c! };
};

for (const edge of ["left", "right"] as const) {
  test(`a held ${HOLD}ms press ${INSET}px inside the ${edge} edge of a played row toggles Details, and again toggles it back`, async ({ page }) => {
    only1440and390();
    await open(page, { ext: withState(STATES.done) });
    const s = await page.evaluate(edgeSpot, [edge, INSET] as ["left" | "right", number]);
    expect(s, "a point inside the row at that edge").toBeTruthy();
    const rest = await boxRect(page);

    if (s.kind === "link") {
      // 390 left: the game name covers the row's left 3px at every y. The name never toggles (dailies#14).
      expect(project().startsWith("390"), "only the 390 left edge may be the game name").toBe(true);
      expect(edge).toBe("left");
      const tab = page.context().waitForEvent("page", { timeout: 2000 }).catch(() => null);
      const held = await hold(page, s);
      expect(held.onLink, "the game name is the hit target there").toBe(true);
      await (await tab)?.close();
      await page.waitForTimeout(300);
      expect(await expanded(page)).toBe("false");
      await expect(row(page).locator(".card")).toHaveCount(0);
      return;
    }

    expect(["plain", "disclosure"], `hit kind at ${edge}`).toContain(s.kind);
    if (s.kind === "disclosure") expect(project().startsWith("390") && edge === "right", "only the 390 right edge may be the Details button").toBe(true);

    expect(await expanded(page)).toBe("false");
    for (const want of ["true", "false"]) {
      const held = await hold(page, s);
      expect(held.inBox, "the pointer is still on the row's hit box mid-press").toBe(true);
      expect(held.box.width).toBeCloseTo(rest.width, 1);
      expect(held.box.left).toBeCloseTo(rest.left, 1);
      // Exactly one toggle per press: a row and button both toggling would cancel out.
      await expect(toggle(page)).toHaveAttribute("aria-expanded", want);
      await page.waitForTimeout(200);
      expect(await expanded(page), "still one toggle after the press").toBe(want);
      await expect(row(page).locator(".card")).toHaveCount(want === "true" ? 1 : 0);
      await settle(page);
    }
  });
}

test("press feedback is kept: the line scales to .99 mid-hold, transform only, and the row's hit box does not shrink", async ({ page }) => {
  only1440and390();
  await open(page, { ext: withState(STATES.done) });
  const rest = await boxRect(page);
  const line = row(page).locator(".line");
  const props = await line.evaluate((el) => getComputedStyle(el).transitionProperty.split(", "));
  expect(props).not.toContain("all");
  expect(props).toContain("transform");
  expect(props.every((p) => p === "background-color" || p === "transform")).toBe(true);
  const s = await page.evaluate(edgeSpot, ["right", INSET] as ["left" | "right", number]);
  const held = await hold(page, s);
  const m = scaleOf(held.transform);
  expect(m.a).toBeCloseTo(0.99, 3);
  expect(m.d).toBeCloseTo(0.99, 3);
  expect([m.b, m.c]).toEqual([0, 0]);
  expect(held.box.width).toBeCloseTo(rest.width, 1);
  expect(held.box.height).toBeCloseTo(rest.height, 1);
  expect(held.box.left).toBeCloseTo(rest.left, 1);
  expect(held.box.top).toBeCloseTo(rest.top, 1);
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a held edge press has no scale and still toggles Details", async ({ page }) => {
    only1440and390();
    await open(page, { ext: withState(STATES.done) });
    const s = await page.evaluate(edgeSpot, ["right", INSET] as ["left" | "right", number]);
    const held = await hold(page, s);
    expect(held.transform).toBe("none");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  });
});
