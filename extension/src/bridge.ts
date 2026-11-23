/// <reference types="chrome" />
import type { State } from "./store";

/**
 * Dashboard origins only: hands the page the stored results through `window.postMessage`, on load, when the
 * page asks, and when storage changes. Event-driven, no polling. See the shared contract in the PR.
 */
async function post() {
  const s = (await chrome.storage.local.get(["records", "misses", "lastLogAt"])) as Partial<State>;
  window.postMessage(
    {
      source: "dailies-extension",
      type: "state",
      version: chrome.runtime.getManifest().version,
      records: Object.values(s.records ?? {}),
      misses: Object.values(s.misses ?? {}),
      lastLogAt: s.lastLogAt ?? null,
    },
    location.origin,
  );
}

window.addEventListener("message", (e: MessageEvent) => {
  const m = e.data as { source?: string; type?: string } | undefined;
  if (e.source === window && e.origin === location.origin && m?.source === "dailies-page" && m.type === "request") void post();
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void post();
});
void post();
