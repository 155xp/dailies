import type { DailyRecord } from "../../src/record";
import type { CapturedResponse } from "../../src/types";
import { captureFrom } from "./capture";
import type { Game, GameDef } from "./games";
import { localDay } from "./store";

/** Content script to service worker. */
export type ContentMessage =
  | { type: "record"; record: DailyRecord }
  | { type: "miss"; game: Game; date: string; reason: string }
  | { type: "seen" };

/** MAIN-world hook to content script, through `window.postMessage`. */
export type HookMessage = { source: "dailies-hook"; page?: Record<string, unknown> } & (
  | { kind: "storage"; key: string }
  | { kind: "response"; response: CapturedResponse }
  | { kind: "share"; text: string }
  | { kind: "page" }
);

/** How long a finished screen may show with no record before it counts as "played, not logged". */
export const MISS_AFTER_MS = 2000;

const NOT_SAVED = "The result screen showed, but the game saved no result this extension can read.";
const NOT_READ = "The result screen showed, but the saved result could not be read.";

/** Read a whole IndexedDB store without creating or upgrading the page's database. */
async function readAll(win: Window, name: string, store: string): Promise<unknown[] | undefined> {
  const idb = win.indexedDB;
  if (!idb?.databases || !(await idb.databases()).some((d) => d.name === name)) return undefined;
  return new Promise((resolve) => {
    const req = idb.open(name);
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        return resolve(undefined);
      }
      const get = db.transaction(store, "readonly").objectStore(store).getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(undefined);
      get.transaction!.oncomplete = () => db.close();
    };
  });
}

/**
 * Capture on one game page. Every read is triggered by an event: a hook message (the page wrote its own
 * storage or got an allowlisted response), the one read at load, Spelling Bee's rank node changing, or a
 * click while a result screen shows. The only timer is the one-shot "played, not logged" check.
 */
export function startCapture({ game, win, send }: { game: GameDef; win: Window; send: (m: ContentMessage) => void }) {
  const doc = win.document;
  const responses: CapturedResponse[] = [];
  let page: Record<string, unknown> = {};
  let share: string | undefined;
  let indexedDB: Record<string, unknown[]> = {};
  let lastSent = "";
  let logged = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | "fired" | undefined;
  let observer: MutationObserver | undefined;

  const storage = () => {
    const out: Record<string, string> = {};
    for (let i = 0; i < win.localStorage.length; i++) {
      const key = win.localStorage.key(i)!;
      if (game.keys?.test(key)) out[key] = win.localStorage.getItem(key) ?? "";
    }
    return out;
  };

  const readIndexedDB = async () => {
    if (!game.indexedDB) return;
    const { db, store } = game.indexedDB;
    const rows = await readAll(win, db, store).catch(() => undefined);
    if (rows) indexedDB = { [`${db}/${store}`]: rows };
  };

  const stopTimer = () => {
    if (timer !== undefined && timer !== "fired") clearTimeout(timer);
    timer = undefined;
  };

  /** Parse what the page holds now; send the record if it is new. */
  const read = (): boolean => {
    if (disposed) return false;
    const record = captureFrom(game, { ...(share !== undefined && { share }), storage: storage(), responses, page, indexedDB });
    if (!record) return false;
    logged = true;
    stopTimer();
    const json = JSON.stringify(record);
    if (json !== lastSent) {
      lastSent = json;
      send({ type: "record", record });
    }
    return true;
  };

  /** A result screen with no record starts the single one-shot check. */
  const checkFinished = () => {
    if (disposed || logged || timer !== undefined || !game.finished || !doc.querySelector(game.finished)) return;
    timer = setTimeout(async () => {
      timer = "fired";
      await readIndexedDB();
      if (read() || disposed) return;
      const saved = Object.keys(storage()).length > 0 || Object.keys(indexedDB).length > 0;
      send({ type: "miss", game: game.id, date: localDay(new Date()), reason: saved ? NOT_READ : NOT_SAVED });
    }, MISS_AFTER_MS);
  };

  const onHook = (e: MessageEvent) => {
    const m = e.data as HookMessage | undefined;
    if (e.source !== win || m?.source !== "dailies-hook") return;
    if (m.page) page = { ...page, ...m.page };
    if (m.kind === "share" && game.share) share = String(m.text);
    if (m.kind === "response") {
      responses.push(m.response);
      if (game.indexedDB) {
        void readIndexedDB().then(() => (read(), checkFinished()));
        return;
      }
    }
    read();
    checkFinished();
  };

  const watchRank = () => {
    const node = game.observe ? doc.querySelector(game.observe) : null;
    if (!node || observer || disposed) return;
    observer = new MutationObserver(() => read());
    observer.observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
  };

  const idle = () => {
    const afterRead = () => {
      if (disposed) return;
      if (!read()) send({ type: "seen" });
      checkFinished();
      watchRank();
    };
    if (game.indexedDB) void readIndexedDB().then(afterRead);
    else afterRead();
  };

  const onHide = () => {
    stopTimer();
    observer?.disconnect();
    observer = undefined;
  };
  const onShow = (e: PageTransitionEvent) => e.persisted && idle();
  const onLoad = () => idle();

  win.addEventListener("message", onHook);
  win.addEventListener("pagehide", onHide);
  win.addEventListener("pageshow", onShow);
  doc.addEventListener("click", checkFinished, { capture: true, passive: true });
  if (doc.readyState === "complete") idle();
  else win.addEventListener("load", onLoad, { once: true });

  return {
    /** Re-read once, for the popup's Retry. */
    retry: async () => {
      await readIndexedDB();
      return read();
    },
    dispose: () => {
      onHide();
      disposed = true;
      win.removeEventListener("message", onHook);
      win.removeEventListener("pagehide", onHide);
      win.removeEventListener("pageshow", onShow);
      win.removeEventListener("load", onLoad);
      doc.removeEventListener("click", checkFinished, { capture: true });
    },
  };
}
