// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

/** A minimal `chrome` for the bridge: empty storage, one onChanged listener list. */
function stubChrome() {
  const changed: (() => void)[] = [];
  const chrome = {
    runtime: { id: "test", getManifest: () => ({ version: "0.1.0" }) },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener: (l: () => void) => changed.push(l) },
    },
  };
  vi.stubGlobal("chrome", chrome);
  return { changed };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("dashboard bridge", () => {
  it("is idempotent: injected again into a page that already has it, it answers each request once", async () => {
    const { changed } = stubChrome();
    const states: unknown[] = [];
    window.addEventListener("message", (e) => (e.data as { source?: string })?.source === "dailies-extension" && states.push(e.data));

    await import("../../extension/src/bridge");
    vi.resetModules();
    await import("../../extension/src/bridge"); // the install-time injection, on top of the declared script
    await flush();
    expect(states).toHaveLength(1);
    expect(changed).toHaveLength(1);

    states.length = 0;
    // happy-dom's postMessage leaves source and origin unset; Chrome sets both (see e2e/install.spec.ts).
    window.dispatchEvent(new MessageEvent("message", { data: { source: "dailies-page", type: "request" }, source: window, origin: location.origin }));
    await flush();
    await flush();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ source: "dailies-extension", type: "state", version: "0.1.0", records: [], misses: [], lastLogAt: null });
  });
});
