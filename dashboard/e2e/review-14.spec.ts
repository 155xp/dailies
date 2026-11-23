import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { open, STATES, withState, type OpenOptions } from "./harness";

/**
 * dailies#14 design review: two notes that read as body copy are set at the body size, and the header's
 * extension pill gives a finger a 44px target at 390 without changing how it looks or where anything sits.
 */
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "14");
const phone = () => test.info().project.name.startsWith("390");
const shot = () => test.info().project.name;

const PILLS: Record<string, OpenOptions & { slug: string }> = {
  "Extension not found": { slug: "not-found", ext: "none" },
  "Extension connected": { slug: "connected", ext: withState(STATES.empty) },
  "Extension connected · last log": { slug: "last-log", ext: withState(STATES.done) },
};

const size = (page: Page, text: string) => page.getByText(text, { exact: false }).evaluate((el) => getComputedStyle(el).fontSize);

test("the note beside Copy address is body size, 17px", async ({ page }) => {
  await open(page, PILLS["Extension not found"]!);
  const note = page.getByText("Chrome won't open this address from a link");
  expect(await size(page, "Chrome won't open this address from a link")).toBe("17px");
  await note.locator("xpath=..").screenshot({ path: join(OUT, `copy-note-${shot()}.png`) });
});

test("the high-contrast setting's description is body size, 17px", async ({ page }) => {
  await open(page, PILLS["Extension connected"]!);
  expect(await size(page, "Wordle tiles in orange and blue")).toBe("17px");
  await page.locator(".setting").screenshot({ path: join(OUT, `palette-setting-${shot()}.png`) });
});

for (const [label, opts] of Object.entries(PILLS)) {
  test(`at 390 the "${label}" pill takes a 44 by 44 tap anywhere on its centre lines, with no change to the header`, async ({ page }) => {
    test.skip(!phone(), "390 only");
    await open(page, opts);
    const pill = page.locator(".pill");
    await expect(pill).toContainText(label);
    const m = await pill.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
      const hits = (x: number, y: number) => el.contains(document.elementFromPoint(x, y));
      const band: boolean[] = [];
      for (let d = -21.5; d <= 21.5; d += 1) band.push(hits(cx, cy + d), hits(cx + d, cy));
      const title = document.querySelector("h1")!.getBoundingClientRect();
      const what = document.querySelector(".what")!.getBoundingClientRect();
      const text = el.querySelector(":scope > span")!.getBoundingClientRect();
      return {
        band,
        titleHit: hits(title.left + title.width / 2, title.top + title.height / 2),
        title: title.toJSON() as DOMRect,
        pill: r.toJSON() as DOMRect,
        // The pill keeps its look: 6px above and below its text, and never under 32px.
        look: Math.abs(r.height - Math.max(32, text.height + 12)),
        // The header keeps its flow: the description sits the 4px row gap under the taller of title and pill.
        gap: what.top - Math.max(title.bottom, r.bottom),
      };
    });
    expect(m.band.every(Boolean), "every point of the 44px cross hits the pill").toBe(true);
    expect(m.titleHit, "the title is not under the pill's target").toBe(false);
    const overlap = m.title.left < m.pill.right && m.pill.left < m.title.right && m.title.top < m.pill.bottom && m.pill.top < m.title.bottom;
    expect(overlap, "pill and title apart").toBe(false);
    expect(m.look).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.gap - 4)).toBeLessThanOrEqual(0.5);
    await page.locator(".head").screenshot({ path: join(OUT, `pill-${opts.slug}-${shot()}.png`) });
  });
}

test("the pill keeps its hover, a .97 press over 100 to 150ms, and its focus ring", async ({ page }) => {
  await open(page, PILLS["Extension not found"]!);
  const pill = page.locator(".pill");
  const t = await pill.evaluate((el) => {
    const s = getComputedStyle(el);
    const props = s.transitionProperty.split(", ");
    return { props, ms: s.transitionDuration.split(", ").map((d) => parseFloat(d) * 1000)[props.indexOf("transform")] };
  });
  expect(t.props).not.toContain("all");
  expect(t.ms).toBeGreaterThanOrEqual(100);
  expect(t.ms).toBeLessThanOrEqual(150);
  if (!phone()) {
    const bg = () => pill.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rest = await bg();
    await pill.hover();
    await page.waitForTimeout(200);
    expect(await bg()).not.toBe(rest);
  }
  const box = (await pill.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await pill.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(0.97, 3);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift");
  await pill.evaluate((el) => (el as HTMLElement).focus());
  expect(await pill.evaluate((el) => el.matches(":focus-visible") && getComputedStyle(el).outlineWidth)).toBe("2px");
});
