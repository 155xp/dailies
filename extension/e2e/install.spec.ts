import { expect, test } from "@playwright/test";
import { Cdp } from "./cdp";
import { DIST } from "./harness";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DASHBOARD = "http://localhost:5173/";
const PAGE = `<!doctype html><title>dashboard</title><script>
window.__states = [];
addEventListener("message", (e) => e.data && e.data.source === "dailies-extension" && window.__states.push(e.data));
</script>`;

/**
 * Chrome does not inject declared content scripts into tabs open before install. The service worker injects
 * the bridge into open dashboard tabs on install, so the page gets its `state` without a reload.
 */
test("a dashboard tab open before install receives state without a reload", async () => {
  const cdp = Cdp.launch(null);
  try {
    const { session } = await cdp.open();
    cdp.on("Fetch.requestPaused", (p, s) => {
      if (s !== session) return;
      const { requestId, request } = p as { requestId: string; request: { url: string } };
      if (request.url !== DASHBOARD) return void cdp.send("Fetch.failRequest", { requestId, errorReason: "Failed" }, session);
      void cdp.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html" }],
        body: Buffer.from(PAGE).toString("base64"),
      }, session);
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
    await cdp.send("Page.enable", {}, session);
    const loaded = cdp.once("Page.loadEventFired", session);
    await cdp.send("Page.navigate", { url: DASHBOARD }, session);
    await loaded;
    expect(await cdp.evaluate<number>(session, "window.__states.length")).toBe(0);

    const navigations: string[] = [];
    cdp.on("Page.frameNavigated", (p, s) => s === session && navigations.push((p.frame as { url: string }).url));
    await cdp.send("Extensions.loadUnpacked", { path: DIST });

    let states = 0;
    for (let i = 0; i < 50 && !states; i++) {
      states = await cdp.evaluate<number>(session, "window.__states.length");
      if (!states) await sleep(100);
    }
    expect(states).toBe(1);
    expect(await cdp.evaluate(session, "window.__states[0]")).toMatchObject({ type: "state", records: [], misses: [], lastLogAt: null });
    expect(navigations).toEqual([]);

    // The page can ask again; one bridge answers, once.
    await cdp.evaluate(session, `window.postMessage({ source: "dailies-page", type: "request" }, location.origin), 1`);
    await sleep(300);
    expect(await cdp.evaluate<number>(session, "window.__states.length")).toBe(2);
  } finally {
    cdp.close();
  }
});
