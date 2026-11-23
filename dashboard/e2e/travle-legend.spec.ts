import { expect, test } from "@playwright/test";
import type { RecordOf } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { audit, CLEAN } from "./guards";
import { BASE, NOW, serve } from "./harness";

/** dailies#15 review (Codex): a long country name beside a long rating must not spill out of its legend row. */
const win = fixtureRecord("travle", "win-2026-11-22");
const long: RecordOf<"travle"> = {
  ...win,
  detail: { ...win.detail, guesses: [...win.detail.guesses, { country: "USA", rating: "near-perfect" }, { country: "CAF", rating: "near-perfect" }] },
};

test("legend rows grow to fit a wrapped country name; no row's text spills into the next", async ({ page }) => {
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((r) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = { records: r }), [long]);
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const c = page.locator('.card[data-game="travle"]');
  await expect(c).toHaveAttribute("data-geo", "ready", { timeout: 10_000 });
  await expect(c.locator('[data-row="USA"] [data-name]')).toHaveText("United States of America");
  const rows = await c.locator("[data-legend] [data-row]").evaluateAll((els) =>
    els.map((li) => {
      const box = li.getBoundingClientRect();
      const ink = [...li.querySelectorAll("*")].flatMap((k) => {
        const range = document.createRange();
        range.selectNodeContents(k);
        return [...range.getClientRects()].filter((r) => r.width > 0);
      });
      return {
        code: li.getAttribute("data-row")!,
        top: box.top,
        bottom: box.bottom,
        spill: ink.filter((r) => r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5).length,
      };
    }),
  );
  expect(rows).toHaveLength(long.detail.guesses.length);
  for (const r of rows) expect(r.spill, r.code).toBe(0);
  for (let i = 1; i < rows.length; i++) expect(rows[i]!.top, `${rows[i - 1]!.code} / ${rows[i]!.code}`).toBeGreaterThanOrEqual(rows[i - 1]!.bottom - 0.5);
  expect(await audit(page)).toEqual(CLEAN);
});
