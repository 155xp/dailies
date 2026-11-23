/// <reference types="chrome" />
import { RECORD } from "../../src/record";
import { gameForUrl } from "./games";
import type { ContentMessage } from "./page";
import { applyMiss, applyRecord, STATE_KEYS, type State } from "./store";

/**
 * The MV3 service worker. It wakes only on a message from a game page, writes `chrome.storage.local`,
 * sets the badge, and goes idle. No alarms, no timers, no keep-alive.
 */
async function load(): Promise<State> {
  const s = (await chrome.storage.local.get([...STATE_KEYS])) as Partial<State>;
  return { records: s.records ?? {}, misses: s.misses ?? {}, loggedAt: s.loggedAt ?? {}, ...(s.lastLogAt && { lastLogAt: s.lastLogAt }) };
}

async function handle(msg: ContentMessage, sender: chrome.runtime.MessageSender) {
  // Only a game's own page may report for that game.
  const from = sender.id === chrome.runtime.id && sender.url ? gameForUrl(sender.url)?.id : undefined;
  if (!from) return;
  const state = await load();
  let patch: Partial<State> | null = null;
  if (msg.type === "record") {
    const parsed = RECORD.safeParse(msg.record);
    if (parsed.success && parsed.data.game === from) patch = applyRecord(state, parsed.data, new Date());
  } else if (msg.type === "miss" && msg.game === from) {
    patch = applyMiss(state, { game: msg.game, date: msg.date, reason: String(msg.reason).slice(0, 200), at: new Date().toISOString() });
  }
  if (patch) await chrome.storage.local.set(patch);
}

// One message at a time, so two pages finishing together never overwrite each other's write.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg: ContentMessage, sender) => {
  queue = queue.then(() => handle(msg, sender)).catch(() => {});
});
