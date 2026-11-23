import { writeFileSync } from "node:fs";
import type { CDPSession } from "@playwright/test";
import { expect, loadFixture, readStore, serveFixture, test } from "./harness";

const IDLE_MS = 60_000;

/** Renderer trace events that mean script or timer work happened. */
const WORK = new Set(["TimerInstall", "TimerFire", "FunctionCall", "EvaluateScript", "v8.compile", "EventDispatch", "FireIdleCallback", "FireAnimationFrame"]);

async function trace(cdp: CDPSession, ms: number) {
  const events: { name: string; ts: number; args?: { data?: { url?: string; type?: string } } }[] = [];
  cdp.on("Tracing.dataCollected", (e) => events.push(...(e.value as typeof events)));
  await cdp.send("Tracing.start", { categories: "devtools.timeline,v8.execute", transferMode: "ReportEvents" });
  await new Promise((r) => setTimeout(r, ms));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.end");
  await done;
  return events.filter((e) => WORK.has(e.name));
}

test("an idle, finished game tab does no extension work and the service worker stops", async ({ context, page, extPage }) => {
  test.setTimeout(IDLE_MS * 2 + 60_000);
  const f = loadFixture("wordle/win-2026-11-22");
  await serveFixture(context, f);
  await page.goto(f.url);
  await page.evaluate(() => (window as unknown as { __finish: () => Promise<void> }).__finish());
  await expect.poll(async () => Object.keys((await readStore(extPage)).records ?? {}), { timeout: 5000 }).toHaveLength(1);
  const loggedAt = Date.now();
  await extPage.close();

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metric = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
  // Let the 2s check window and any trailing work finish, then measure a full idle minute.
  await page.waitForTimeout(3000);
  const before = await metric();
  const work = await trace(cdp, IDLE_MS);
  const after = await metric();

  const scriptMs = (after.ScriptDuration! - before.ScriptDuration!) * 1000;
  const taskMs = (after.TaskDuration! - before.TaskDuration!) * 1000;

  // The service worker: Chrome stops an idle MV3 worker after 30s. Nothing here holds it open.
  const internals = await context.newPage();
  await internals.goto("chrome://serviceworker-internals/");
  const status = await internals.evaluate(() => {
    const text = document.body.innerText;
    const at = text.indexOf("chrome-extension://");
    return at < 0 ? "not listed" : (text.slice(at).match(/Running Status:\s*(\w+)/)?.[1] ?? "unknown");
  });
  await internals.screenshot({ path: test.info().outputPath("serviceworker-internals.png"), fullPage: true });

  const summary = {
    idleSeconds: IDLE_MS / 1000,
    secondsSinceLastLog: Math.round((Date.now() - loggedAt) / 1000),
    scriptMs: Math.round(scriptMs * 100) / 100,
    taskMs: Math.round(taskMs * 100) / 100,
    workEvents: work.map((e) => e.name),
    serviceWorker: status,
  };
  writeFileSync(test.info().outputPath("idle-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));

  expect(work).toEqual([]);
  expect(scriptMs).toBeLessThan(1);
  expect(status).toBe("STOPPED");
});
