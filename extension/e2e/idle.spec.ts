import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Cdp } from "./cdp";
import { DIST, fixturePage, loadFixture, type Stored } from "./harness";

const IDLE_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Renderer trace events that mean script, timer or callback work happened. */
const WORK = new Set(["TimerInstall", "TimerFire", "FunctionCall", "EvaluateScript", "v8.compile", "EventDispatch", "FireIdleCallback", "FireAnimationFrame"]);

/**
 * Runs on a bare CDP pipe, not Playwright's browser: Playwright attaches DevTools to every service worker,
 * and an attached DevTools session keeps a worker alive, which would hide whether ours stops on its own.
 */
test("an idle, finished game tab does no extension work and the service worker stops", async () => {
  test.setTimeout(IDLE_MS + 90_000);
  const cdp = Cdp.launch(DIST);
  try {
    // An unpacked extension's id is the sha256 of its path, as letters a to p. Chrome runs other built-in workers.
    const extId = [...createHash("sha256").update(DIST).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
    let worker: { url: string } | undefined;
    for (let i = 0; i < 100 && !worker; i++) {
      worker = (await cdp.targets()).find((t) => t.type === "service_worker" && t.url.startsWith(`chrome-extension://${extId}/`));
      if (!worker) await sleep(100);
    }
    expect(worker, "extension service worker").toBeDefined();
    const swRunning = async () => (await cdp.targets()).some((t) => t.type === "service_worker" && t.url.includes(extId));

    // Serve the Wordle fixture on the game's real URL, on this page only.
    const f = loadFixture("wordle/win-2026-11-22");
    const { session } = await cdp.open();
    cdp.on("Fetch.requestPaused", (p, s) => {
      if (s !== session) return;
      const { requestId, request, resourceType } = p as { requestId: string; request: { url: string; method: string }; resourceType: string };
      const url = new URL(request.url).href;
      const hit = f.responses.find((r) => new URL(r.url).href === url && r.method === request.method);
      const doc = resourceType === "Document" && url === f.url;
      if (!doc && !hit) return void cdp.send("Fetch.failRequest", { requestId, errorReason: "Failed" }, session);
      const body = doc ? fixturePage(f) : JSON.stringify(hit!.body);
      void cdp.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: doc ? 200 : hit!.status,
        responseHeaders: [{ name: "Content-Type", value: doc ? "text/html" : "application/json" }],
        body: Buffer.from(body).toString("base64"),
      }, session);
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
    await cdp.send("Page.enable", {}, session);
    const loaded = cdp.once("Page.loadEventFired", session);
    await cdp.send("Page.navigate", { url: f.url }, session);
    await loaded;
    await cdp.evaluate(session, "window.__finish()");

    // Read storage from a short-lived extension page, then close it.
    const store = async (): Promise<Stored> => {
      const page = await cdp.open(`chrome-extension://${extId}/popup.html`);
      let value: Stored = {};
      for (let i = 0; i < 50; i++) {
        value = await cdp.evaluate<Stored>(page.session, "globalThis.chrome?.storage ? chrome.storage.local.get(null) : {}").catch(() => ({}));
        if (value.records && Object.keys(value.records).length) break;
        await sleep(100);
      }
      await cdp.send("Target.closeTarget", { targetId: page.targetId });
      return value;
    };
    const stored = await store();
    expect(Object.keys(stored.records ?? {})).toEqual(["wordle:2026-11-22"]);
    const loggedAt = Date.now();

    // A full idle minute on the finished game tab, traced.
    await sleep(3000);
    await cdp.send("Performance.enable", {}, session);
    const metric = async () =>
      Object.fromEntries((await cdp.send<{ metrics: { name: string; value: number }[] }>("Performance.getMetrics", {}, session)).metrics.map((m) => [m.name, m.value]));
    // A browser-wide trace: every process, the game tab's renderer and the extension's worker included.
    const trace = async (ms: number, during?: () => Promise<unknown>) => {
      const events: { name: string }[] = [];
      cdp.on("Tracing.dataCollected", (p) => events.push(...(p.value as typeof events)));
      await cdp.send("Tracing.start", { categories: "devtools.timeline,v8.execute", transferMode: "ReportEvents" });
      await during?.();
      await sleep(ms);
      const done = cdp.once("Tracing.tracingComplete");
      await cdp.send("Tracing.end");
      await done;
      return { total: events.length, work: events.filter((e) => WORK.has(e.name)).map((e) => e.name) };
    };
    const before = await metric();
    const idle = await trace(IDLE_MS);
    const after = await metric();
    const work = idle.work;
    // Control: the same trace must see a timer when the page sets one.
    const control = await trace(500, () => cdp.evaluate(session, "setTimeout(() => {}, 10), 1"));

    // Chrome stops an idle MV3 worker about 30s after its last event. Nothing here is attached to it.
    const running = await swRunning();
    const internals = await cdp.open("chrome://serviceworker-internals/");
    await sleep(1000);
    const status = await cdp.evaluate<string>(
      internals.session,
      `(() => { const t = document.body.innerText; const i = t.indexOf("chrome-extension://${extId}"); return i < 0 ? "not listed" : (t.slice(i).match(/Running Status:\\s*(\\w+)/)?.[1] ?? "unknown"); })()`,
    );
    // A tall page, so the still shows every registration, ours included, with its Running Status.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 2400, deviceScaleFactor: 1, mobile: false }, internals.session);
    const shot = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, internals.session);
    writeFileSync(test.info().outputPath("serviceworker-internals.png"), Buffer.from(shot.data, "base64"));

    const summary = {
      idleSeconds: IDLE_MS / 1000,
      secondsSinceLastLog: Math.round((Date.now() - loggedAt) / 1000),
      scriptMs: Math.round((after.ScriptDuration! - before.ScriptDuration!) * 100_000) / 100,
      taskMs: Math.round((after.TaskDuration! - before.TaskDuration!) * 100_000) / 100,
      traceEventsTotal: idle.total,
      controlWorkEvents: [...new Set(control.work)],
      workEvents: work,
      serviceWorkerTargetRunning: running,
      serviceWorkerInternalsStatus: status,
    };
    writeFileSync(test.info().outputPath("idle-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify(summary));

    expect(control.work, "the control trace sees a page timer").toContain("TimerInstall");
    expect(work).toEqual([]);
    expect(summary.scriptMs).toBeLessThan(1);
    expect(running).toBe(false);
    expect(status).toBe("STOPPED");
  } finally {
    cdp.close();
  }
});
