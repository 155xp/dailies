import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Capture, CapturedResponse } from "../src/types";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

type Json = Record<string, unknown>;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Fixture network files use a few shapes; turn each recorded call into a CapturedResponse. */
function toResponse(raw: Json): CapturedResponse | null {
  const req = (raw.request ?? {}) as Json;
  const url = (req.url ?? raw.url) as string | undefined;
  if (!url) return null;
  const res: CapturedResponse = {
    url,
    method: String(req.method ?? raw.method ?? "GET"),
    body: "body" in raw ? raw.body : raw.response,
  };
  if (typeof raw.status === "number") res.status = raw.status;
  if (req.body !== undefined) res.requestBody = req.body;
  return res;
}

/** IndexedDB fixtures are `{ db: { stores: { store: { entries: [{ value }] } } } }`. */
function flattenIndexedDB(raw: Json): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [db, info] of Object.entries(raw)) {
    const stores = ((info as Json).stores ?? {}) as Record<string, { entries?: { value: unknown }[] }>;
    for (const [store, data] of Object.entries(stores)) {
      out[`${db}/${store}`] = (data.entries ?? []).map((e) => e.value);
    }
  }
  return out;
}

/** Load a fixture case directory as the Capture the extension would build on the live page. */
export function loadCapture(game: string, dir: string, file = "storage.json"): Capture {
  const base = join(FIXTURES, game, dir);
  const capture: Capture = {};

  if (existsSync(join(base, "share.txt"))) {
    capture.share = readFileSync(join(base, "share.txt"), "utf8");
  }

  if (existsSync(join(base, file))) {
    const storage = readJson(join(base, file)) as Json;
    if (storage.localStorage) capture.localStorage = storage.localStorage as Json;
    if (storage.indexedDB) capture.indexedDB = flattenIndexedDB(storage.indexedDB as Json);
  }

  // Values a game keeps only in page memory, read in the page by the hook (`page.json`, Spamle).
  if (existsSync(join(base, "page.json"))) capture.page = { ...(readJson(join(base, "page.json")) as Json) };

  const net = join(base, "network");
  if (existsSync(net)) {
    capture.responses = [];
    capture.page ??= {};
    for (const name of readdirSync(net).sort()) {
      const raw = readJson(join(net, name));
      if (raw && typeof raw === "object" && "gameData" in raw) {
        capture.page.gameData = (raw as Json).gameData;
        continue;
      }
      for (const entry of Array.isArray(raw) ? raw : [raw]) {
        const res = toResponse(entry as Json);
        if (res) capture.responses.push(res);
      }
    }
  }
  return capture;
}
