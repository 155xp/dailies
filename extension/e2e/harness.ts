import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";

const DIST = resolve(import.meta.dirname, "..", "dist");
const FIXTURES = resolve(import.meta.dirname, "..", "..", "fixtures");

type Json = Record<string, unknown>;
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;

export interface Fixture {
  url: string;
  storage: [string, string][];
  responses: { url: string; method: string; status: number; body: unknown; requestBody?: unknown }[];
  idb: Json;
  dom: string;
  gameData?: unknown;
}

/** Every fixture case as `game/dir`. */
export const CASES = readdirSync(FIXTURES).flatMap((g) => readdirSync(join(FIXTURES, g)).map((d) => `${g}/${d}`));

/** A fixture case as a page can replay it: the storage the game wrote, its responses, its result screen. */
export function loadFixture(id: string): Fixture {
  const base = join(FIXTURES, id);
  const meta = readJson(join(base, "meta.json")) as { sourceUrl: string };
  const store = (existsSync(join(base, "storage.json")) ? readJson(join(base, "storage.json")) : {}) as Json;
  const storage = Object.entries((store.localStorage ?? {}) as Json).map(
    ([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)] as [string, string],
  );
  const responses: Fixture["responses"] = [];
  let gameData: unknown;
  const net = join(base, "network");
  for (const name of existsSync(net) ? readdirSync(net).sort() : []) {
    const raw = readJson(join(net, name));
    if (raw && typeof raw === "object" && "gameData" in raw) gameData = (raw as Json).gameData;
    for (const e of (Array.isArray(raw) ? raw : [raw]) as Json[]) {
      const req = (e.request ?? {}) as Json;
      const url = (req.url ?? e.url) as string | undefined;
      if (!url) continue;
      const body = "body" in e ? e.body : e.response;
      responses.push({ url, method: String(req.method ?? e.method ?? "GET"), status: Number(e.status ?? 200), body, requestBody: req.body });
    }
  }
  // The result screen, made inert: no scripts, media or external references.
  const domFile = join(base, "dom.html");
  const dom = existsSync(domFile)
    ? readFileSync(domFile, "utf8")
        .replace(/<(script|style|iframe|video|audio|object)\b[\s\S]*?<\/\1>/gi, "")
        .replace(/<(img|source|link|image|use)\b[^>]*>/gi, "")
        .replace(/url\([^)]*\)/gi, "none")
    : "";
  return { url: meta.sourceUrl, storage, responses, idb: (store.indexedDB ?? {}) as Json, dom, ...(gameData ? { gameData } : {}) };
}

/** Hosts a fixture page may talk to: the game page and the game's own API hosts. */
export const fixtureHosts = (f: Fixture) => new Set([f.url, ...f.responses.map((r) => r.url)].map((u) => new URL(u).host));

/**
 * Serve the fixture at the game's real URL. The page shows the game as playing; `window.__finish(viaSetItem)`
 * replays what the game does at the end: IndexedDB writes, the game's own API calls, the result screen,
 * then the localStorage writes (through `setItem`, or by property assignment, which the hook cannot see).
 */
export async function serveFixture(context: BrowserContext, f: Fixture) {
  const responses = new Map(f.responses.map((r) => [`${r.method} ${r.url}`, r]));
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url().replace(/#.*$/, "");
    if (req.resourceType() === "document" && url === f.url) {
      return route.fulfill({ contentType: "text/html", body: fixturePage(f) });
    }
    const hit = responses.get(`${req.method()} ${url}`);
    if (hit) return route.fulfill({ status: hit.status, contentType: "application/json", body: JSON.stringify(hit.body) });
    return route.abort();
  });
}

function fixturePage(f: Fixture): string {
  const data = JSON.stringify({ storage: f.storage, idb: f.idb, dom: f.dom, responses: f.responses.map(({ body: _b, ...r }) => r) });
  return `<!doctype html><meta charset="utf-8"><title>fixture</title><body><main id="game">Playing</main>
<script>${f.gameData ? `window.gameData = ${JSON.stringify(f.gameData)};` : ""}
const FIX = ${data.replace(/</g, "\\u003c")};
function writeIdb(name, info) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, info.version || 1);
    open.onupgradeneeded = () => {
      for (const [store, s] of Object.entries(info.stores || {})) open.result.createObjectStore(store, s.keyPath ? { keyPath: s.keyPath } : {});
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const stores = Object.keys(info.stores || {});
      if (!stores.length) { db.close(); return resolve(); }
      const tx = db.transaction(stores, "readwrite");
      for (const [store, s] of Object.entries(info.stores)) for (const e of s.entries || []) {
        s.keyPath ? tx.objectStore(store).put(e.value) : tx.objectStore(store).put(e.value, e.key);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
window.__finish = async (viaSetItem = true) => {
  for (const [name, info] of Object.entries(FIX.idb)) if (info && info.stores) await writeIdb(name, info);
  for (const r of FIX.responses) {
    const init = { method: r.method };
    if (r.requestBody !== undefined && r.method !== "GET") init.body = typeof r.requestBody === "string" ? r.requestBody : JSON.stringify(r.requestBody);
    try { await (await fetch(r.url, init)).text(); } catch {}
  }
  document.getElementById("game").innerHTML = FIX.dom;
  for (const [k, v] of FIX.storage) viaSetItem ? localStorage.setItem(k, v) : (localStorage[k] = v);
};
</script>`;
}

export interface Stored {
  records?: Record<string, { game: string; date: string }>;
  misses?: Record<string, { game: string; date: string; reason: string; at: string }>;
  loggedAt?: Record<string, string>;
  lastLogAt?: string;
}

export const readStore = (page: Page): Promise<Stored> => page.evaluate(() => chrome.storage.local.get(null)) as Promise<Stored>;

export const test = base.extend<{ context: BrowserContext; sw: Worker; extensionId: string; extPage: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, info) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
      ...(info.tags.includes("@recording") ? { recordVideo: { dir: info.outputPath("video"), size: { width: 1024, height: 640 } } } : {}),
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => use(new URL(sw.url()).host),
  /** An extension page to read storage from, so tests never hold the service worker awake. */
  extPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});

export { expect } from "@playwright/test";
