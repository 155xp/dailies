// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAMES } from "../../extension/src/games";
import { startCapture, type ContentMessage } from "../../extension/src/page";
import { loadCapture } from "../capture";

const game = (id: string) => GAMES.find((g) => g.id === id)!;
const hook = (data: Record<string, unknown>) =>
  window.dispatchEvent(new MessageEvent("message", { data: { source: "dailies-hook", ...data }, source: window }));
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function storeFixture(name: string, dir: string) {
  const storage = loadCapture(name, dir).localStorage ?? {};
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
}

let sent: ContentMessage[];
let stop: (() => void) | undefined;

beforeEach(() => {
  sent = [];
  localStorage.clear();
  document.body.innerHTML = "";
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const start = (id: string) => {
  const ctl = startCapture({ game: game(id), win: window, send: (m) => void sent.push(m) });
  stop = ctl.dispose;
  return ctl;
};

describe("Spelling Bee rank observer", () => {
  it("reads on a rank change and is disconnected on pagehide", async () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    document.body.innerHTML = `<div data-testid="sb-progress" aria-label="Good Start, score 4."></div>`;
    storeFixture("spelling-bee", "partial-2026-11-22");
    const page = loadCapture("spelling-bee", "partial-2026-11-22").page ?? {};
    start("spelling-bee");
    hook({ kind: "page", page });
    await flush();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0]?.[0]).toBe(document.querySelector("[data-testid=sb-progress]"));
    expect(sent.filter((m) => m.type === "record").at(-1)).toMatchObject({ record: { detail: { rank: "Good Start" } } });

    storeFixture("spelling-bee", "partial-paywall-2026-11-22");
    document.querySelector("[data-testid=sb-progress]")!.setAttribute("aria-label", "Solid, score 37.");
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.filter((m) => m.type === "record").at(-1)).toMatchObject({ record: { detail: { rank: "Solid" } } });

    window.dispatchEvent(new Event("pagehide"));
    expect(disconnect).toHaveBeenCalled();
    const count = sent.length;
    document.querySelector("[data-testid=sb-progress]")!.setAttribute("aria-label", "Nice, score 40.");
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.length).toBe(count);
  });

  it("creates no observer for any other game", () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    for (const g of GAMES.filter((x) => x.id !== "spelling-bee")) {
      startCapture({ game: g, win: window, send: () => {} }).dispose();
    }
    expect(observe).not.toHaveBeenCalled();
  });
});

describe("'played, not logged' check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<dialog id="stats-dialog" open></dialog>`;
  });

  it("reports a miss 2s after a finished screen with no saved result", async () => {
    start("wordle");
    await vi.advanceTimersByTimeAsync(1999);
    expect(sent.some((m) => m.type === "miss")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent.find((m) => m.type === "miss")).toMatchObject({ type: "miss", game: "wordle", reason: expect.any(String) });
  });

  it("is cleared when the result is captured within 2s", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    start("wordle");
    storeFixture("wordle", "win-2026-11-22");
    hook({ kind: "storage", key: "games-state-wordleV2/ANON" });
    await flush();
    expect(sent.find((m) => m.type === "record")).toBeDefined();
    expect(clear).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.some((m) => m.type === "miss")).toBe(false);
  });

  it("is cleared on pagehide", async () => {
    start("wordle");
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.some((m) => m.type === "miss")).toBe(false);
  });

  it("is a single one-shot timer however often it is triggered, and nothing repeats", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    start("wordle");
    for (let i = 0; i < 5; i++) document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    hook({ kind: "storage", key: "games-state-wordleV2/ANON" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timeout.mock.calls.filter(([, ms]) => ms === 2000)).toHaveLength(1);
    expect(interval).not.toHaveBeenCalled();
    expect(sent.filter((m) => m.type === "miss")).toHaveLength(1);
  });

  it("starts no timer when the page shows no finished screen", async () => {
    document.body.innerHTML = "";
    const timeout = vi.spyOn(globalThis, "setTimeout");
    start("wordle");
    await vi.advanceTimersByTimeAsync(5000);
    expect(timeout.mock.calls.filter(([, ms]) => ms === 2000)).toHaveLength(0);
    expect(sent.some((m) => m.type === "miss")).toBe(false);
  });
});

describe("retry", () => {
  it("re-reads once and logs a result the hooks missed", async () => {
    const ctl = start("wordle");
    await flush();
    expect(sent.some((m) => m.type === "record")).toBe(false);
    storeFixture("wordle", "win-2026-11-22");
    await expect(ctl.retry()).resolves.toBe(true);
    expect(sent.find((m) => m.type === "record")).toMatchObject({ record: { game: "wordle", status: "won" } });
  });
});
