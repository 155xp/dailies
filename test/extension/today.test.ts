import { describe, expect, it } from "vitest";
import { GAMES } from "../../extension/src/games";
import { badgeFor, todayRows, type State } from "../../extension/src/store";
import { PARSERS } from "../../src/parsers";
import { loadCapture } from "../capture";

const now = new Date(2026, 10, 22, 18, 0);
const morning = new Date(2026, 10, 22, 9, 41).toISOString();
const yesterday = new Date(2026, 10, 21, 20, 0).toISOString();
const wordle = PARSERS.wordle(loadCapture("wordle", "win-2026-11-22"))!;
const travle = PARSERS.travle(loadCapture("travle", "win-2026-11-22"))!;

const state = (s: Partial<State> = {}): State => ({ records: {}, misses: {}, loggedAt: {}, ...s });

describe("today's rows", () => {
  it("lists the 10 games in the fixed order, none played", () => {
    const rows = todayRows(state(), now);
    expect(rows.map((r) => r.game.id)).toEqual(GAMES.map((g) => g.id));
    expect(rows.every((r) => r.status === "none")).toBe(true);
  });

  it("marks a game logged with its time, and a game played but not logged with the reason", () => {
    const rows = todayRows(
      state({
        records: { "wordle:2026-11-22": wordle },
        loggedAt: { "wordle:2026-11-22": morning },
        misses: { "connections:2026-11-22": { game: "connections", date: "2026-11-22", reason: "Could not read it", at: morning } },
      }),
      now,
    );
    expect(rows.find((r) => r.game.id === "wordle")).toMatchObject({ status: "logged", at: morning });
    expect(rows.find((r) => r.game.id === "connections")).toMatchObject({ status: "missed", reason: "Could not read it" });
    expect(rows.filter((r) => r.status === "none")).toHaveLength(GAMES.length - 2);
  });

  it("counts a record logged today even when the game's own day differs (Travle's day is UTC)", () => {
    const rows = todayRows(state({ records: { "travle:2026-11-21": { ...travle, date: "2026-11-21" } }, loggedAt: { "travle:2026-11-21": morning } }), now);
    expect(rows.find((r) => r.game.id === "travle")?.status).toBe("logged");
  });

  it("resets on the next day", () => {
    const old = state({ records: { "wordle:2026-11-21": { ...wordle, date: "2026-11-21" } }, loggedAt: { "wordle:2026-11-21": yesterday } });
    expect(todayRows(old, now).find((r) => r.game.id === "wordle")?.status).toBe("none");
    expect(badgeFor(old, now).text).toBe("");
  });
});

describe("badge", () => {
  it("is empty with nothing logged today", () => {
    expect(badgeFor(state(), now)).toEqual({ text: "", color: expect.any(String) });
  });

  it("is a small neutral dot after a capture, with no count", () => {
    const b = badgeFor(state({ records: { "wordle:2026-11-22": wordle }, loggedAt: { "wordle:2026-11-22": morning } }), now);
    expect(b.text.trim()).toBe("");
    expect(b.text.length).toBe(1);
    expect(b.color).toBe("#8d8d86");
  });

  it("is a red-11 dot while any game today is played but not logged", () => {
    const miss = { game: "wordle" as const, date: "2026-11-22", reason: "x", at: morning };
    const b = badgeFor(state({ misses: { "wordle:2026-11-22": miss } }), now);
    expect(b.text.length).toBe(1);
    expect(b.color).toBe("#ce2c31");
  });
});
