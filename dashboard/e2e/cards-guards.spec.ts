import { expect, test, type Page } from "@playwright/test";
import { audit, type Audit } from "./guards";
import { BASE, NOW, serve } from "./harness";

/** Each guard must catch a known-bad state planted in a real card. */
async function planted(page: Page, html: string): Promise<Audit> {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.locator('.card[data-game="wordle"]').evaluate((c, h) => c.insertAdjacentHTML("beforeend", h), html);
  return audit(page);
}

test("(a) an empty chart at first paint is caught", async ({ page }) => {
  const out = await planted(page, '<div data-chart style="height:80px"></div>');
  expect(out.empty).toHaveLength(1);
});

test("(b) tiles overflowing their box are caught", async ({ page }) => {
  const out = await planted(page, '<div data-tiles style="width:40px;height:20px;overflow:hidden;display:flex"><i style="flex:none;width:200px;height:20px;background:#6aaa64"></i></div>');
  expect(out.clipped.join()).toContain("i");
});

test("(b) a card pushing the page sideways is caught", async ({ page }) => {
  const out = await planted(page, '<p style="width:3000px">wide</p>');
  expect(out.clipped.join()).toContain("scrolls sideways");
});

test("(c) a card more than 35% blank is caught", async ({ page }) => {
  const out = await planted(page, '<div style="height:1600px"></div>');
  expect(out.blank.join()).toContain("article.card");
});

test("(d) a duplicate headline and a duplicate value are caught", async ({ page }) => {
  const out = await planted(page, '<h3>Krillion</h3><p data-value="wordle figure 3/6">3/6</p>');
  expect(out.duplicate.join()).toContain('headline "Krillion"');
  expect(out.duplicate.join()).toContain("value");
});

test("(e) emoji, em dashes, eyebrow labels and self-congratulatory copy are caught", async ({ page }) => {
  const out = await planted(page, '<p>\u{1F7E9}\u{1F7E8}</p><p>Solved — fast</p><p style="text-transform:uppercase">result</p><p>All set</p>');
  const text = out.banned.join("\n");
  expect(text).toContain("emoji");
  expect(text).toContain("em dash");
  expect(text).toContain("eyebrow");
  expect(text).toContain("self-congratulatory");
});
