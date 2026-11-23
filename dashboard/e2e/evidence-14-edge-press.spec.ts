import { join } from "node:path";
import { test } from "@playwright/test";
import { open, STATES, withState } from "./harness";

/** Evidence only, for the dailies#14 edge-press nit: the played Wordle row at rest, hovered, held 3px inside its right edge, and open. */
const OUT = join(import.meta.dirname, "..", "test-results", "screens", "14", "edge-press");

test("played row at rest, hover, mid-press near the edge and open", async ({ page }, info) => {
  test.skip(info.project.name.startsWith("1024"), "1440 and 390");
  const [width, scheme] = info.project.name.split("-");
  await open(page, { ext: withState(STATES.done) });
  const row = page.locator('.row[data-game="wordle"]');
  const r = (await row.boundingBox())!;
  const pad = 8;
  const clip = { x: Math.max(0, r.x - pad), y: r.y - pad, width: Math.min(r.width + 2 * pad, page.viewportSize()!.width), height: r.height + 2 * pad };
  const still = (state: string) => page.screenshot({ path: join(OUT, `${state}-${width}-${scheme}.png`), clip });
  const edge = { x: r.x + r.width - 3, y: r.y + r.height / 2 };
  if (width === "390") edge.y = r.y + r.height - 14;

  await page.mouse.move(0, 0);
  await still("rest");
  await page.mouse.move(edge.x, edge.y);
  await page.waitForTimeout(250);
  await still("hover");
  await page.mouse.down();
  await page.waitForTimeout(150);
  await still("press");
  await page.mouse.up();
  await row.locator(".card").waitFor();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)).then(() => undefined));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  // The open card runs past the fold at 390, so the row takes its own element still.
  await row.screenshot({ path: join(OUT, `open-${width}-${scheme}.png`) });
});
