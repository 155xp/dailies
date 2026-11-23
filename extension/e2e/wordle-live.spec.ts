import type { BrowserContext } from "@playwright/test";
import { localDay } from "../src/store";
import { LIVE_GUESSES, LIVE_KEY, liveRecord, liveState, solutionBody, solutionUrl } from "../../test/wordle-live";
import { expect, readStore, test } from "./harness";

const PAGE_URL = "https://www.nytimes.com/games/wordle/index.html";

/** How the page gets the day's solution: the live XHR client, fetch, a failing request, or no request at all. */
type Via = "xhr" | "fetch" | "error" | "none";

/**
 * A stand-in for the live Wordle page (dailies#11). Like the real app it asks for the solution at load through
 * its own XMLHttpRequest client: `open`, `withCredentials`, a 5s `timeout`, a Content-type header, an `onload`
 * property that parses `responseText`. Each guess is saved with `localStorage.setItem`; a win shows the stats
 * dialog, then saves. A guest never shares, so there is no share text.
 */
function livePage(day: string, via: Via): string {
  const data = JSON.stringify({ day, url: solutionUrl(day), key: LIVE_KEY, via, states: LIVE_GUESSES.map((_, i) => liveState(day, LIVE_GUESSES.slice(0, i + 1), i === LIVE_GUESSES.length - 1 ? "WIN" : "IN_PROGRESS")) });
  return `<!doctype html><meta charset="utf-8"><title>Wordle</title><body><main id="game">Playing</main>
<script>
const LIVE = ${data};
function get(url) {
  return new Promise((resolve, reject) => {
    const c = new XMLHttpRequest();
    c.open("GET", url, true);
    c.withCredentials = true;
    c.timeout = 5000;
    c.ontimeout = () => reject(new Error("timed out"));
    c.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    c.onload = () => { try { resolve(JSON.parse(c.responseText)); } catch (e) { reject(e); } };
    c.addEventListener("error", () => reject(new Error("Network error")));
    c.send();
  });
}
window.__solution =
  LIVE.via === "xhr" || LIVE.via === "error" ? get(LIVE.url).catch(() => null)
  : LIVE.via === "fetch" ? fetch(LIVE.url).then((r) => r.json()).catch(() => null)
  : Promise.resolve(null);
/** Play guess n (1-based). The last one wins: the stats dialog shows, then the state is saved. */
window.__guess = async (n) => {
  await window.__solution;
  if (n === LIVE.states.length) document.getElementById("game").innerHTML = '<div id="stats-dialog" role="dialog">Congratulations</div>';
  localStorage.setItem(LIVE.key, LIVE.states[n - 1]);
};
</script>`;
}

async function serveLive(context: BrowserContext, day: string, via: Via) {
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (req.url().startsWith("chrome-extension://")) return route.continue();
    if (req.resourceType() === "document" && req.url() === PAGE_URL) return route.fulfill({ contentType: "text/html", body: livePage(day, via) });
    if (req.url() === solutionUrl(day) && via !== "error") return route.fulfill({ contentType: "application/json", body: JSON.stringify(solutionBody(day)) });
    return route.abort();
  });
}

const play = async (page: import("@playwright/test").Page) => {
  for (let n = 1; n <= LIVE_GUESSES.length; n++) await page.evaluate((i) => (window as unknown as { __guess: (n: number) => Promise<void> }).__guess(i), n);
};

test.describe("Wordle, a live guest win (dailies#11)", () => {
  test("solution through XMLHttpRequest: logs tile marks and the puzzle number, no miss", async ({ context, page, extPage }) => {
    const day = localDay(new Date());
    const seen: string[] = [];
    page.on("request", (r) => r.url() === solutionUrl(day) && seen.push(r.resourceType()));
    await serveLive(context, day, "xhr");
    await page.goto(PAGE_URL);
    await play(page);
    expect(seen).toEqual(["xhr"]);

    const key = `wordle:${day}`;
    await expect.poll(async () => (await readStore(extPage)).records?.[key], { timeout: 5000 }).toEqual(liveRecord(day));
    await page.waitForTimeout(2500);
    const store = await readStore(extPage);
    expect(store.records?.[key]).toEqual(liveRecord(day));
    expect(store.misses ?? {}).toEqual({});
  });

  test("solution through fetch: still logs the same record", async ({ context, page, extPage }) => {
    const day = localDay(new Date());
    await serveLive(context, day, "fetch");
    await page.goto(PAGE_URL);
    await play(page);
    await expect.poll(async () => (await readStore(extPage)).records?.[`wordle:${day}`], { timeout: 5000 }).toEqual(liveRecord(day));
  });

  for (const via of ["none", "error"] as const) {
    test(`solution ${via === "none" ? "never requested" : "request fails"}: a clear miss, no record with empty marks`, async ({ context, page, extPage }) => {
      const day = localDay(new Date());
      await serveLive(context, day, via);
      await page.goto(PAGE_URL);
      await play(page);
      await expect.poll(async () => (await readStore(extPage)).misses?.[`wordle:${day}`]?.reason, { timeout: 5000 }).toMatch(/could not be read/);
      const store = await readStore(extPage);
      expect(store.records ?? {}).toEqual({});
    });
  }
});
