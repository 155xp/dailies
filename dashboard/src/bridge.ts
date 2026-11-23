import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { RECORD, type DailyRecord } from "../../src/record";

const MISS = z.object({ game: z.string(), date: z.string(), reason: z.string(), at: z.string() });
const STATE = z.object({
  source: z.literal("dailies-extension"),
  type: z.literal("state"),
  version: z.string(),
  records: z.array(RECORD),
  misses: z.array(MISS),
  lastLogAt: z.string().nullable(),
});

export type Miss = z.infer<typeof MISS>;
export type Status = "loading" | "connected" | "missing" | "error";
export interface ExtensionState {
  status: Status;
  records: DailyRecord[];
  misses: Miss[];
  lastLogAt: string | null;
}

/** No `state` within this long of a request means the extension is not there. */
export const ANSWER_MS = 300;

const blank = (status: Status): ExtensionState => ({ status, records: [], misses: [], lastLogAt: null });

/**
 * Reads the extension's storage through its content script, per the shared contract:
 * ask with a `request` message, take any `state` message, and re-ask only on focus or
 * when the tab becomes visible. No timers run except the one answer deadline.
 */
export function useExtension() {
  const [state, setState] = useState<ExtensionState>(() => blank("loading"));
  const [waiting, setWaiting] = useState(false);
  const deadline = useRef<number | undefined>(undefined);

  const request = useCallback(() => {
    window.postMessage({ source: "dailies-page", type: "request" }, location.origin);
    if (deadline.current !== undefined) return;
    setWaiting(true);
    deadline.current = window.setTimeout(() => {
      deadline.current = undefined;
      setWaiting(false);
      setState(blank("missing"));
    }, ANSWER_MS);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.source !== "dailies-extension" || e.data.type !== "state") return;
      window.clearTimeout(deadline.current);
      deadline.current = undefined;
      setWaiting(false);
      const parsed = STATE.safeParse(e.data);
      setState(parsed.success ? { status: "connected", records: parsed.data.records, misses: parsed.data.misses, lastLogAt: parsed.data.lastLogAt } : blank("error"));
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", request);
    document.addEventListener("visibilitychange", onVisible);
    request();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", request);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(deadline.current);
      deadline.current = undefined;
    };
  }, [request]);

  return { ...state, waiting, request };
}
