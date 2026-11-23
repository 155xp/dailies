import { allowResponse, gameForUrl, type GameDef } from "./games";

/**
 * MAIN world, document_start, on the 9 game pages only. Wraps `Storage.prototype.setItem`, `fetch` and `XMLHttpRequest` so the
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

    // Wordle loads its solution through XMLHttpRequest. Same messages as fetch, posted on `loadend`.
    const xhr = XMLHttpRequest.prototype;
    const { open, send } = xhr;
    const allowed = new WeakMap<XMLHttpRequest, { url: string; method: string }>();
    xhr.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      allowed.delete(this);
      try {
        const href = new URL(String(url), location.href).href;
        if (allowResponse(game, href)) allowed.set(this, { url: href, method: String(method).toUpperCase() });
      } catch {
        // An invalid URL: the original open throws for the page as it always did.
      }
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof xhr.open;
    xhr.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const req = allowed.get(this);
      if (req) {
        const id = ++next;
        post({ kind: "request", id });
        let requestBody: unknown;
        try {
          requestBody = typeof body === "string" ? JSON.parse(body) : undefined;
        } catch {
          requestBody = body;
        }
        this.addEventListener("loadend", () => {
          let json: unknown;
          try {
            json = this.responseType === "json" ? this.response : !this.responseType || this.responseType === "text" ? JSON.parse(this.responseText) : undefined;
          } catch {
            json = undefined;
          }
          if (!this.status || json == null) return post({ kind: "response", id });
          const response = { url: this.responseURL || req.url, method: req.method, status: this.status, body: json, ...(requestBody !== undefined && { requestBody }) };
          post({ kind: "response", id, response });
        }, { once: true });
      }
      return send.call(this, body);
    };
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
