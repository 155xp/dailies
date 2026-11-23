import { PARSERS } from "../../src/parsers";
import { loadCapture } from "../../test/capture";
import { CASES, expect, fixtureHosts, loadFixture, readStore, serveFixture, test } from "./harness";

/** Cases with no finished result: Globle unsolved, and the Mini, which is gated signed out. */
const NOTHING = new Set(["globle/partial-2026-11-22", "mini/gated-2026-11-22", "mini/gated-2026-11-23"]);
const RECORDED = new Set(["wordle/win-2026-11-22", "krillion/win-2026-11-22", "enclose-horse/win-2026-11-22"]);

for (const id of CASES) {
  const [game, dir] = id.split("/") as [keyof typeof PARSERS, string];
  const tag = RECORDED.has(id) ? { tag: "@recording" } : {};

  test(`${id}: finishing logs one result with no clicks, and replays add nothing`, tag, async ({ context, page, extPage }) => {
    const f = loadFixture(id);
    const requests: string[] = [];
    context.on("request", (r) => requests.push(r.url()));
    await serveFixture(context, f);

    await page.goto(f.url);
    await page.evaluate(() => (window as unknown as { __finish: () => Promise<void> }).__finish());

    if (NOTHING.has(id)) {
      await page.waitForTimeout(2500);
      const store = await readStore(extPage);
      expect(Object.keys(store.records ?? {})).toEqual([]);
      expect(Object.keys(store.misses ?? {})).toEqual([]);
    } else {
      const expected = PARSERS[game](loadCapture(game, dir))!;
      const key = `${game}:${expected.date}`;
      await expect.poll(async () => (await readStore(extPage)).records?.[key], { timeout: 5000 }).toEqual(expected);
      const first = await readStore(extPage);

      // Reload and replay the finish: same game and puzzle, so storage must not change at all.
      await page.reload();
      await page.evaluate(() => (window as unknown as { __finish: () => Promise<void> }).__finish());
      await page.waitForTimeout(2500);
      const again = await readStore(extPage);
      expect(Object.keys(again.records ?? {})).toEqual([key]);
      expect(again).toEqual(first);
      expect(again.misses ?? {}).toEqual({});

      if (RECORDED.has(id)) {
        await extPage.setViewportSize({ width: 360, height: 640 });
        await extPage.reload();
        await expect(extPage.getByText(/^Logged \d/)).toHaveCount(1);
        await extPage.screenshot({ path: test.info().outputPath(`${game}-popup-after-capture.png`), fullPage: true });
      }
    }

    // Nothing leaves the browser except the game page and the game's own API calls.
    const allowed = fixtureHosts(f);
    const outside = requests.filter((u) => !u.startsWith("chrome-extension://") && !allowed.has(new URL(u).host));
    expect(outside).toEqual([]);
  });
}
