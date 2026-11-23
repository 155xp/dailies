import { describe, expect, it } from "vitest";
import { lastDays, localDay, streaks } from "../src/history";

describe("history days and streaks", () => {
  it("lists the last N local days, oldest first, ending today", () => {
    const days = lastDays("2026-11-22", 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-10-24");
    expect(days.at(-1)).toBe("2026-11-22");
    expect(lastDays("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("reads a Date as the local calendar day", () => {
    expect(localDay(new Date(2026, 10, 22, 23, 59))).toBe("2026-11-22");
  });

  it("counts the current streak through today, or through yesterday while today is still open", () => {
    expect(streaks(["2026-11-20", "2026-11-21", "2026-11-22"], "2026-11-22")).toEqual({ current: 3, best: 3 });
    expect(streaks(["2026-11-20", "2026-11-21"], "2026-11-22")).toEqual({ current: 2, best: 2 });
    expect(streaks(["2026-11-19", "2026-11-20"], "2026-11-22")).toEqual({ current: 0, best: 2 });
  });

  it("keeps the best streak across gaps and ignores duplicates", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-10", "2026-11-22", "2026-11-22"];
    expect(streaks(days, "2026-11-22")).toEqual({ current: 1, best: 4 });
    expect(streaks([], "2026-11-22")).toEqual({ current: 0, best: 0 });
  });
});
