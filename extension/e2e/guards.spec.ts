import { expect, test } from "@playwright/test";
import { checkGuards, type Guard } from "./guards";

const page = (body: string) =>
  `<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:16px;font:17px/1.4 sans-serif}</style><body>${body}</body>`;

/** Known-bad states, each of which exactly one guard must catch. */
const BAD: [Guard, string][] = [
  ["empty", `<div data-guard="chart" style="width:300px;height:120px"></div>`],
  ["empty", `<div data-guard="tiles" style="width:300px;height:60px"><span hidden>x</span></div>`],
  ["clipped", `<p style="width:120px;overflow:hidden;white-space:nowrap">A result line far too long to fit its box</p>`],
  ["clipped", `<div style="width:2000px;height:20px"></div>`],
  ["blank", `<section data-guard="panel" style="height:400px;padding:16px"><p style="margin:0">One line</p></section>`],
  ["duplicate", `<h2>Today</h2><p>Wordle</p><h2>Today</h2>`],
  ["duplicate", `<p data-guard="value">405</p><p data-guard="value">405</p>`],
  ["copy", `<p>Logged \u{1F7E9} today</p>`],
  ["copy", `<p>Wordle — logged</p>`],
  ["copy", `<p style="font-size:13px;text-transform:uppercase">Overview</p><h2>Results</h2>`],
  ["copy", `<p>You're all set for today</p>`],
  ["type", `<p style="font-size:11px">Logged 9:41 AM</p>`],
];

test.describe("visual guards catch known-bad states", () => {
  for (const [guard, body] of BAD) {
    test(`${guard}: ${body.slice(0, 60)}`, async ({ page: p }) => {
      await p.setViewportSize({ width: 390, height: 800 });
      await p.setContent(page(body));
      const found = await checkGuards(p);
      expect(found.map((v) => v.guard)).toContain(guard);
      expect(found.filter((v) => v.guard !== guard)).toEqual([]);
    });
  }

  test("a clean state passes every guard", async ({ page: p }) => {
    await p.setViewportSize({ width: 390, height: 800 });
    await p.setContent(
      page(`<h1>Today</h1><section data-guard="panel" style="padding:16px"><p style="margin:0">Wordle</p><p style="margin:0">Logged 9:41 AM</p></section>
        <div data-guard="tiles" style="display:flex;gap:4px"><span style="width:20px;height:20px;background:#6aaa64"></span></div>`),
    );
    expect(await checkGuards(p)).toEqual([]);
  });
});
