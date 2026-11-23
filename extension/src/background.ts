/// <reference types="chrome" />
import { RECORD } from "../../src/record";
import { gameForUrl } from "./games";
import type { ContentMessage } from "./page";
import { applyMiss, applyRecord, loadState, showBadge, type State } from "./store";

/**
 * The MV3 service worker. It wakes only on a message from a game page, writes `chrome.storage.local`,
 * sets the badge, and goes idle. No alarms, no timers, no keep-alive.
 */
async function handle(msg: ContentMessage, sender: chrome.runtime.MessageSender) {
  // Only a game's own page may report for that game.
  const from = sender.id === chrome.runtime.id && sender.url ? gameForUrl(sender.url)?.id : undefined;
  if (!from) return;
  const state = await loadState();
  let patch: Partial<State> | null = null;
  if (msg.type === "record") {
    const parsed = RECORD.safeParse(msg.record);
    if (parsed.success && parsed.data.game === from) patch = applyRecord(state, parsed.data, new Date(), msg.atLoad === true);
  } else if (msg.type === "miss" && msg.game === from) {
    patch = applyMiss(state, { game: msg.game, date: msg.date, reason: String(msg.reason).slice(0, 200), at: new Date().toISOString() });
  }
  if (patch) await chrome.storage.local.set(patch);
  // Every wake refreshes the badge, so yesterday's dot clears on the first game page of a new day.
  await showBadge({ ...state, ...patch });
}

// One message at a time, so two pages finishing together never overwrite each other's write.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg: ContentMessage, sender) => {
  queue = queue.then(() => handle(msg, sender)).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => void loadState().then((s) => showBadge(s)));
/**
 * Chrome injects declared content scripts only into pages loaded after install, so on install or update
 * (a one-shot event) the bridge is injected into dashboard tabs that were already open.
 */
async function injectBridge() {
  const bridge = chrome.runtime.getManifest().content_scripts?.find((c) => c.js?.includes("bridge.js"));
  if (!bridge?.matches) return;
  for (const tab of await chrome.tabs.query({ url: bridge.matches })) {
    if (tab.id !== undefined) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["bridge.js"] }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void loadState().then((s) => showBadge(s));
  if (reason === "install" || reason === "update") void injectBridge();
});
