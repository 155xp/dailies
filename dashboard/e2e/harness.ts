import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { PARSERS } from "../../src/parsers";
import type { DailyRecord } from "../../src/record";
import { loadCapture } from "../../test/capture";

/** The built site is served from a made-up host under a nested path, to prove it works from any static host. */
export const ORIGIN = "http://dailies.test";
export const BASE_PATH = "/any/base/path/";
export const BASE = ORIGIN + BASE_PATH;
const DIST = join(import.meta.dirname, "..", "dist");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
};

/** 4:41 PM in New York on the day every fixture was captured. */
export const NOW = new Date("2026-11-22T21:41:00Z");
export const LAST_LOG = "2026-11-22T14:41:00Z";

export interface Miss {
  game: DailyRecord["game"];
  date: string;
  reason: string;
  at: string;
}
export interface ExtState {
  records: DailyRecord[];
  misses: Miss[];
  lastLogAt: string | null;
}

/** A record per game, parsed from the real fixtures by the real parsers. */
function fixture(game: DailyRecord["game"], dir: string): DailyRecord {
  const record = PARSERS[game](loadCapture(game, dir));
  if (!record) throw new Error(`no record for ${game}/${dir}`);
  return record;
}

const miss = (game: DailyRecord["game"], reason: string): Miss => ({ game, date: "2026-11-22", reason, at: LAST_LOG });

export const STATES = {
  empty: { records: [], misses: [], lastLogAt: null },
  partial: {
    records: [fixture("krillion", "partial-2026-11-22"), fixture("travle", "loss-2026-11-22"), fixture("wordle", "win-2026-11-22"), fixture("connections", "loss-2026-11-22")],
    misses: [miss("spelling-bee", "The result screen changed. Open Spelling Bee once more to retry")],
    lastLogAt: LAST_LOG,
  },
  /**
   * Every game played. The Mini has no captured result (it is gated signed out, fixtures/mini), so it
   * shows as played but not logged rather than as an invented result.
   */
  done: {
    records: [
      fixture("krillion", "win-2026-11-22"),
      fixture("travle", "win-2026-11-22"),
      fixture("enclose-horse", "win-2026-11-22"),
      fixture("wordle", "win-2026-11-22"),
      fixture("connections", "win-2026-11-22"),
      fixture("spelling-bee", "partial-2026-11-22"),
      fixture("globle", "win-2026-11-22"),
      fixture("songless", "win-2026-11-22"),
    ],
    misses: [miss("mini", "The Mini saved no result while signed out. Sign in and open it once more to retry")],
    lastLogAt: LAST_LOG,
  },
} satisfies Record<string, ExtState>;

export type FakeMode = { kind: "state"; state: ExtState } | { kind: "invalid" } | { kind: "silent" };

/**
 * Runs in the page before any script: stands in for the extension's content script.
 * It answers `request` messages with `state` exactly as the shared contract says, and can be
 * switched, detached or made to post a fresh state from the test through `window.__ext`.
 */
function fakeExtension(initial: FakeMode) {
  let mode = initial;
  let attached = true;
  const ext = { requests: 0, set, detach: () => (attached = false), post };
  function post() {
    if (!attached || mode.kind === "silent") return;
    const body = mode.kind === "invalid" ? { records: "not a list" } : { version: "0.0.0", ...mode.state };
    window.postMessage({ source: "dailies-extension", type: "state", ...body }, location.origin);
  }
  function set(next: FakeMode) {
    mode = next;
    post();
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "dailies-page" || e.data.type !== "request") return;
    ext.requests++;
    post();
  });
  (window as unknown as { __ext: typeof ext }).__ext = ext;
  document.addEventListener("DOMContentLoaded", post);
}

/** Serve `dist` and refuse anything else, recording each refused URL. */
export async function serve(page: Page): Promise<string[]> {
  const external: string[] = [];
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname.startsWith(BASE_PATH)) {
      const file = join(DIST, url.pathname.slice(BASE_PATH.length) || "index.html");
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
    }
    external.push(url.href);
    return route.abort();
  });
  return external;
}

export interface OpenOptions {
  ext: FakeMode | "none";
  /** "frozen" stops timers so the loading state can be held for a screenshot. */
  clock?: "fixed" | "frozen";
}

export async function open(page: Page, { ext, clock = "fixed" }: OpenOptions) {
  const external = await serve(page);
  if (clock === "frozen") await page.clock.install({ time: NOW });
  else await page.clock.setFixedTime(NOW);
  if (ext !== "none") await page.addInitScript(fakeExtension, ext);
  await page.goto(BASE);
  if (clock === "fixed") await page.locator("main[data-status]:not([data-status=loading])").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return { external };
}

export const withState = (state: ExtState): FakeMode => ({ kind: "state", state });

/** Full-page still for the CI artifact, named by state and project. */
export async function shoot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: join(import.meta.dirname, "..", "test-results", "screens", `${name}-${info.project.name}.png`), fullPage: true });
}
