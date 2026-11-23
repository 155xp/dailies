import { expect, test } from "@playwright/test";
import { audit } from "./guards";

/** A deliberately bad page: every guard must catch its own fault, and only its own. */
const BAD = {
  empty: `<div data-chart style="width:200px;height:80px"></div>`,
  clipped: `<div style="width:80px;overflow:hidden;white-space:nowrap">A label far too long for its box</div><div style="width:2000px">wide</div>`,
  blank: `<section data-panel style="height:400px;padding:16px"><p>One line in a tall card</p></section>`,
  duplicate: `<h2>History</h2><h2>History</h2><p data-value="Current streak 3">3</p><p data-value="Current streak 3">3</p>`,
  emoji: `<p>Solved \u{1F7E9}\u{1F7E9}</p>`,
  emDash: `<p>Today — three games</p>`,
  eyebrow: `<p style="text-transform:uppercase;font-size:12px">Overview</p><h2>Results</h2>`,
  cheer: `<p>You're all set, nice!</p>`,
  numbered: `<p>01 Download it</p>`,
};

test.describe("visual guards catch a known-bad page", () => {
  test.beforeEach(() => test.skip(test.info().project.name !== "1440-light", "runs once"));

  test("each fault is caught by its guard", async ({ page }) => {
    const run = async (html: string) => {
      await page.setContent(`<body style="margin:0;font:17px sans-serif">${html}</body>`);
      return audit(page);
    };
    expect((await run(BAD.empty)).empty).toHaveLength(1);
    const clipped = (await run(BAD.clipped)).clipped;
    expect(clipped.some((c) => c.includes("sideways"))).toBe(true);
    expect(clipped.some((c) => c.includes("A label far too long"))).toBe(true);
    expect((await run(BAD.blank)).blank).toHaveLength(1);
    expect((await run(BAD.duplicate)).duplicate).toEqual(['headline "History" x2', 'value "Current streak 3" x2']);
    expect((await run(BAD.emoji)).banned.join()).toContain("emoji");
    expect((await run(BAD.emDash)).banned.join()).toContain("em dash");
    expect((await run(BAD.eyebrow)).banned.join()).toContain("eyebrow");
    expect((await run(BAD.cheer)).banned.join()).toContain("self-congratulatory");
    expect((await run(BAD.numbered)).banned.join()).toContain("numbered marker");
  });

  test("a clean page passes every guard", async ({ page }) => {
    await page.setContent(`<body style="margin:0;font:17px sans-serif"><section data-panel style="padding:16px"><h2>History</h2><div data-tiles><span style="display:inline-block;width:12px;height:12px;background:#6aaa64"></span></div></section></body>`);
    expect(await audit(page)).toEqual({ empty: [], clipped: [], blank: [], duplicate: [], banned: [] });
  });
});
