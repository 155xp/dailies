import { createServer } from "node:http";
import { test, expect } from "./harness";

const PAGE = `<!doctype html><script>
window.replies = [];
addEventListener('message', e => {
  if (e.data?.source === 'dailies-extension') window.replies.push(e.data);
});
window.request = () => postMessage({source:'dailies-page',type:'request'}, location.origin);
</script>`;

for (const host of ["127.0.0.1", "localhost"]) {
  test(`prod zip answers nothing on http://${host}:<random port>`, async ({ context, page }) => {
    const server = createServer((_req, res) => res.end(PAGE));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No server port");
      await page.goto(`http://${host}:${address.port}/`);
      await page.evaluate("window.request()");
      await page.waitForTimeout(2100);
      expect(await page.evaluate("window.replies")).toEqual([]);
    } finally {
      await context.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}

test("prod dashboard request receives stored records; foreign window messages are ignored", async ({ context, page, extPage }) => {
  const records = { saved: { game: "wordle", date: "2026-11-23" } };
  await extPage.evaluate((records) => chrome.storage.local.set({ records }), records);
  await context.route("https://dailies.enci.dev/**", (route) => route.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto("https://dailies.enci.dev/");
  await expect.poll(() => page.evaluate("window.replies.length")).toBe(1);
  await page.evaluate(`window.replies = []; window.request()`);
  await expect.poll(() => page.evaluate("window.replies")).toEqual([
    { source: "dailies-extension", type: "state", version: "0.1.0", records: Object.values(records), misses: [], lastLogAt: null },
  ]);
  await page.evaluate(`window.replies = []; window.dispatchEvent(new MessageEvent('message', {
    data: {source:'dailies-page',type:'request'}, origin: location.origin, source: null
  })); window.dispatchEvent(new MessageEvent('message', {
    data: {source:'dailies-page',type:'request'}, origin: 'https://evil.example', source: window
  }))`);
  await page.waitForTimeout(2100);
  expect(await page.evaluate("window.replies")).toEqual([]);
});

test("prod bridge stays silent even if injected into a non-allowlisted game origin", async ({ context, page, extPage }) => {
  await context.route("https://krillion.io/**", (route) => route.fulfill({ contentType: "text/html", body: PAGE }));
  await page.goto("https://krillion.io/");
  const tabId = await extPage.evaluate(async () => (await chrome.tabs.query({ url: "https://krillion.io/*" }))[0]?.id);
  if (tabId === undefined) throw new Error("Missing game tab");
  await extPage.evaluate(async (tabId) => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"] });
  }, tabId);
  await page.evaluate("window.request()");
  await extPage.evaluate(() => chrome.storage.local.set({ lastLogAt: "changed" }));
  await page.waitForTimeout(2100);
  expect(await page.evaluate("window.replies")).toEqual([]);
});
