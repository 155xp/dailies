/// <reference types="chrome" />
import type { State } from "./store";

declare const __DAILIES_DASHBOARD_ORIGINS__: readonly string[];
const allowedOrigin = (origin: string) => __DAILIES_DASHBOARD_ORIGINS__.includes(origin);

/**
 * Dashboard origins only: hands the page the stored results through `window.postMessage`, on load, when the
 * page asks, and when storage changes. Event-driven, no polling. See the shared contract in the PR.
 *
 * It can arrive twice in one page: declared, and injected on install. The first live copy wins; a copy left by
 * an earlier install of the extension has a dead runtime (no id) and is replaced.
 */
const page = window as unknown as { __dailiesBridge?: { id?: string } };
if (allowedOrigin(location.origin) && !page.__dailiesBridge?.id) {
  page.__dailiesBridge = chrome.runtime;
  start();
}

function start() {
  async function post() {
    if (!allowedOrigin(location.origin)) return;
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
    if (e.source === window && e.origin === location.origin && allowedOrigin(e.origin) && m?.source === "dailies-page" && m.type === "request") void post();
  });
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void post();
  });
  void post();
}
