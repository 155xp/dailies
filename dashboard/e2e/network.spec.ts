import { expect, test, type Page } from "@playwright/test";
import { BASE, open, ORIGIN, STATES, withState, type OpenOptions } from "./harness";

type Ext = { __ext: { set(m: unknown): void } };

const NOTE = "Results stay in this browser only, with no sign-in and no upload.";

const SCENES: Record<string, OpenOptions> = {
  loading: { ext: "none", clock: "frozen" },
  missing: { ext: "none" },
  empty: { ext: withState(STATES.empty) },
  partial: { ext: withState(STATES.partial) },
  done: { ext: withState(STATES.done) },
  error: { ext: { kind: "invalid" } },
};

/** Every request the page makes, from the browser's side, whether or not the harness serves it. */
function record(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  page.on("websocket", (ws) => urls.push(ws.url()));
  return urls;
}

const offOrigin = (urls: string[]) => urls.filter((u) => new URL(u).origin !== ORIGIN);

test.describe("5b local only", () => {
  for (const [name, opts] of Object.entries(SCENES)) {
    test(`${name}: the local-only note sits under the title, and nothing is requested from another host`, async ({ page }) => {
      const urls = record(page);
      const { external } = await open(page, opts);
      if (name !== "loading") {
        const note = page.locator(".local");
        await expect(note).toHaveText(NOTE);
        const [h1, n] = [(await page.locator("h1").boundingBox())!, (await note.boundingBox())!];
        expect(n.y).toBeGreaterThan(h1.y + h1.height - 1);
        expect(Math.abs(n.x - h1.x)).toBeLessThan(1);
      }
      for (const d of await page.locator(".disclosure").all()) await d.click();
      await page.waitForTimeout(300);
      expect(urls.length).toBeGreaterThan(0);
      expect(offOrigin(urls)).toEqual([]);
      expect(external).toEqual([]);
    });
  }

  test("installing: the steps, their buttons and a late connection stay on this origin", async ({ page }) => {
    const urls = record(page);
    const { external } = await open(page, { ext: { kind: "silent" } });
    const href = await page.locator(".install .step a[download]").getAttribute("href");
    expect(new URL(href!, BASE).origin).toBe(ORIGIN);
    await page.getByRole("button", { name: "Copy address" }).click();
    await page.getByRole("button", { name: "Check again" }).click();
    await page.waitForTimeout(400);
    await page.evaluate((s) => (window as never as Ext).__ext.set({ kind: "state", state: s }), STATES.done);
    await expect(page.locator("main")).toHaveAttribute("data-status", "connected");
    await expect(page.locator(".local")).toHaveText(NOTE);
    expect(offOrigin(urls)).toEqual([]);
    expect(external).toEqual([]);
  });

  test("the cards preview page requests nothing from another host", async ({ page }) => {
    const urls = record(page);
    const { external } = await open(page, { ext: "none" });
    await page.goto(new URL("cards/index.html", BASE).href);
    await page.waitForLoadState("networkidle");
    expect(offOrigin(urls)).toEqual([]);
    expect(external).toEqual([]);
  });

  test("the built code has no sign-in, upload or tracking hooks", async ({ page }) => {
    await open(page, { ext: "none" });
    const scripts = await page.evaluate(async () => {
      const srcs = [...document.querySelectorAll("script[src]")].map((s) => (s as HTMLScriptElement).src);
      return (await Promise.all(srcs.map((s) => fetch(s).then((r) => r.text())))).join("\n");
    });
    expect(scripts.length).toBeGreaterThan(1000);
    expect(scripts).not.toMatch(/sendBeacon|new WebSocket|new EventSource|XMLHttpRequest\(|navigator\.credentials|google-analytics|googletagmanager/);
  });
});
