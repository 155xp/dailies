import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { chromium } from "@playwright/test";

type Params = Record<string, unknown>;
type Listener = (params: Params, sessionId?: string) => void;

/**
 * A bare Chrome DevTools Protocol client over `--remote-debugging-pipe`. Unlike Playwright it attaches only to
 * the targets a test asks for, so it never attaches to (and keeps alive) the extension's service worker.
 */
export class Cdp {
  private next = 0;
  private pending = new Map<number, { resolve: (v: Params) => void; reject: (e: Error) => void }>();
  private listeners = new Map<string, Listener[]>();
  private constructor(
    private proc: ChildProcess,
    private out: Writable,
  ) {
    let buf = "";
    (proc.stdio[4] as Readable).on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      for (let i = buf.indexOf("\0"); i >= 0; i = buf.indexOf("\0")) {
        const msg = JSON.parse(buf.slice(0, i)) as { id?: number; method?: string; params?: Params; result?: Params; error?: { message: string }; sessionId?: string };
        buf = buf.slice(i + 1);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) p?.reject(new Error(msg.error.message));
          else p?.resolve(msg.result ?? {});
        } else if (msg.method) for (const l of this.listeners.get(msg.method) ?? []) l(msg.params ?? {}, msg.sessionId);
      }
    });
  }

  static launch(extensionDir: string): Cdp {
    const proc = spawn(
      chromium.executablePath(),
      [
        "--headless",
        "--remote-debugging-pipe",
        `--user-data-dir=${mkdtempSync(join(tmpdir(), "dailies-cdp-"))}`,
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
    );
    return new Cdp(proc, proc.stdio[3] as Writable);
  }

  send<T = Params>(method: string, params: Params = {}, sessionId?: string): Promise<T> {
    const id = ++this.next;
    this.out.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + "\0");
    return new Promise((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: Params) => void, reject }));
  }

  on(method: string, listener: Listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  once(method: string, sessionId?: string): Promise<Params> {
    return new Promise((resolve) => {
      const l: Listener = (p, s) => {
        if (sessionId && s !== sessionId) return;
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((x) => x !== l));
        resolve(p);
      };
      this.on(method, l);
    });
  }

  async targets() {
    return (await this.send<{ targetInfos: { targetId: string; type: string; url: string }[] }>("Target.getTargets")).targetInfos;
  }

  /** Open a tab and attach to it alone. */
  async open(url = "about:blank"): Promise<{ targetId: string; session: string }> {
    const { targetId } = await this.send<{ targetId: string }>("Target.createTarget", { url });
    const { sessionId } = await this.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    return { targetId, session: sessionId };
  }

  async evaluate<T>(session: string, expression: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string } }>(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      session,
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }

  close() {
    this.proc.kill();
  }
}
