import { allowResponse, gameForUrl, type GameDef } from "./games";

/**
 * MAIN world, document_start, on the 9 game pages only. Wraps `Storage.prototype.setItem` and `fetch` so the
 * game's own writes and allowlisted responses post one message each. Nothing runs unless the page acts.
 */
function install(game: GameDef) {
  const post = (m: Record<string, unknown>) => {
    try {
      window.postMessage({ source: "dailies-hook", ...m }, location.origin);
    } catch {
      // A value that cannot be cloned is skipped; the load read and Retry still see storage.
    }
  };
  const globals = () => {
    if (!game.globals) return undefined;
    const w = window as unknown as Record<string, unknown>;
    try {
      return JSON.parse(JSON.stringify(Object.fromEntries(game.globals.map((g) => [g, w[g]])))) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };

  const keys = game.keys;
  if (keys) {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      setItem.call(this, key, value);
      if (this === window.localStorage && keys.test(String(key))) post({ kind: "storage", key: String(key), page: globals() });
    };
  }

  if (game.responses) {
    const original = window.fetch;
    let next = 0;
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const promise = original.call(this, input, init);
      const url = new URL(input instanceof Request ? input.url : String(input), location.href).href;
      if (allowResponse(game, url)) {
        // Announce the request so the content script waits for its answer before reading storage.
        const id = ++next;
        post({ kind: "request", id });
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        let requestBody: unknown;
        try {
          requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        } catch {
          requestBody = init?.body;
        }
        promise
          .then((res) => res.clone().json().then((body: unknown) => {
            const response = { url: res.url || url, method, status: res.status, body, ...(requestBody !== undefined && { requestBody }) };
            post({ kind: "response", id, response });
          }))
          .catch(() => post({ kind: "response", id }));
      }
      return promise;
    } as typeof fetch;
  }

  if (game.share) {
    const onShare = (text: unknown) => typeof text === "string" && post({ kind: "share", text });
    const clip = globalThis.Clipboard?.prototype;
    if (clip) {
      const writeText = clip.writeText;
      clip.writeText = function (this: Clipboard, text: string) {
        onShare(text);
        return writeText.call(this, text);
      };
    }
    const share = Navigator.prototype.share;
    if (share) {
      Navigator.prototype.share = function (this: Navigator, data?: ShareData) {
        onShare(data?.text);
        return share.call(this, data);
      };
    }
  }

  if (game.globals) document.addEventListener("DOMContentLoaded", () => post({ kind: "page", page: globals() }), { once: true });
}

const game = gameForUrl(location.href);
if (game) install(game);
