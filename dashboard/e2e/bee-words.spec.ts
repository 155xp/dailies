import { expect, test } from "@playwright/test";
import type { RecordOf } from "../../src/record";
import { fixtureRecord } from "../fixture-records";
import { BASE, NOW, serve } from "./harness";

/** dailies#10, one-weight rule: a pangram is marked by ink-12 against ink-11 plus a thin underline, never by weight. */
test("Spelling Bee: pangrams are ink-12 with a 1px underline 3px below, other words ink-11 with none, all in one weight", async ({ page }) => {
  const bee: RecordOf<"spelling-bee"> = fixtureRecord("spelling-bee", "partial-paywall-2026-11-22");
  await serve(page);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => ((window as unknown as { __CARDS__: unknown }).__CARDS__ = p), { records: [bee] });
  await page.goto(BASE + "cards/index.html");
  await page.locator("main[data-status=ready]").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const words = await page.locator(".card [data-words] [data-word]").evaluateAll((els) =>
    els.map((e) => {
      const cs = getComputedStyle(e);
      return { text: e.textContent, pangram: e.hasAttribute("data-pangram"), color: cs.color, weight: cs.fontWeight, line: cs.textDecorationLine, thickness: cs.textDecorationThickness, offset: cs.textUnderlineOffset };
    }),
  );
  // ink-12 is the body ink; ink-11 is the meta ink.
  const ink12 = await page.evaluate(() => getComputedStyle(document.body).color);
  const ink11 = await page.locator(".card .meta").first().evaluate((e) => getComputedStyle(e).color);
  expect(ink12).not.toBe(ink11);

  const pangrams = words.filter((w) => w.pangram);
  const rest = words.filter((w) => !w.pangram);
  expect(pangrams.map((w) => w.text)).toEqual(["Pothead"]);
  expect(rest.length).toBeGreaterThan(0);
  for (const w of pangrams) expect(w).toMatchObject({ color: ink12, weight: "400", line: "underline", thickness: "1px", offset: "3px" });
  for (const w of rest) expect(w).toMatchObject({ color: ink11, weight: "400", line: "none" });

  // One weight on the page: no other weight of the face is declared or loaded.
  const weights = await page.evaluate(() => [...document.fonts].map((f) => f.weight));
  expect(new Set(weights)).toEqual(new Set(["400"]));
});
