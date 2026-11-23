import { describe, expect, it } from "vitest";
import { applyMiss, applyRecord, recordKey, type State } from "../../extension/src/store";
import { PARSERS } from "../../src/parsers";
import { loadCapture } from "../capture";

const empty = (): State => ({ records: {}, misses: {}, loggedAt: {} });
const merge = (state: State, patch: Partial<State> | null): State => ({ ...state, ...patch });
const at = new Date("2026-11-22T14:41:00Z");

const win = PARSERS.wordle(loadCapture("wordle", "win-2026-11-22"))!;
const loss = PARSERS.wordle(loadCapture("wordle", "loss-2026-11-22"))!;

describe("storing records", () => {
  it("keys a record by game and day", () => {
    const patch = applyRecord(empty(), win, at);
    expect(Object.keys(patch?.records ?? {})).toEqual(["wordle:2026-11-22"]);
    expect(patch?.lastLogAt).toBe(at.toISOString());
    expect(patch?.loggedAt).toEqual({ "wordle:2026-11-22": at.toISOString() });
  });

  it("writes nothing when a replay or reload captures the same record again", () => {
    const state = merge(empty(), applyRecord(empty(), win, at));
    expect(applyRecord(state, structuredClone(win), new Date("2026-11-22T15:00:00Z"))).toBeNull();
  });

  it("overwrites, never duplicates, when the same game and day captures a different result", () => {
    const state = merge(empty(), applyRecord(empty(), win, at));
    const next = merge(state, applyRecord(state, loss, new Date("2026-11-22T15:00:00Z")));
    expect(Object.keys(next.records)).toEqual(["wordle:2026-11-22"]);
    expect(next.records[recordKey("wordle", "2026-11-22")]).toEqual(loss);
  });

  it("keeps other days and games", () => {
    const other = { ...win, date: "2026-11-21" };
    const state = merge(empty(), applyRecord(empty(), other, at));
    const next = merge(state, applyRecord(state, win, at));
    expect(Object.keys(next.records).sort()).toEqual(["wordle:2026-11-21", "wordle:2026-11-22"]);
  });

  it("clears a 'played, not logged' miss once the record arrives", () => {
    const miss = { game: "wordle" as const, date: "2026-11-22", reason: "No saved result found", at: at.toISOString() };
    const missed = merge(empty(), applyMiss(empty(), miss));
    expect(missed.misses["wordle:2026-11-22"]).toEqual(miss);
    const logged = merge(missed, applyRecord(missed, win, at));
    expect(logged.misses).toEqual({});
  });

  it("ignores a miss for a game and day that is already logged, and repeats of the same miss", () => {
    const logged = merge(empty(), applyRecord(empty(), win, at));
    const miss = { game: "wordle" as const, date: "2026-11-22", reason: "x", at: at.toISOString() };
    expect(applyMiss(logged, miss)).toBeNull();
    const missed = merge(empty(), applyMiss(empty(), miss));
    expect(applyMiss(missed, { ...miss, at: new Date().toISOString() })).toBeNull();
  });
});

describe("replays after a storage round trip", () => {
  it("treats a record with its keys in another order as the same record", () => {
    const sortKeys = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])) : v;
    const state = merge(empty(), applyRecord(empty(), win, at));
    const stored = { ...state, records: sortKeys(state.records) as State["records"] };
    expect(applyRecord(stored, win, new Date())).toBeNull();
  });
});

describe("a reload that sees less", () => {
  it("never erases detail an earlier capture saved", () => {
    const connections = PARSERS.connections(loadCapture("connections", "win-2026-11-22"))!;
    const state = merge(empty(), applyRecord(empty(), connections, at));
    // Reloaded before sharing: no share text, so no public puzzle number.
    expect(applyRecord(state, { ...connections, puzzleNo: null }, new Date())).toBeNull();
    // Reloaded before the puzzle response: Wordle grades come back empty.
    const wordle = merge(empty(), applyRecord(empty(), win, at));
    expect(applyRecord(wordle, { ...win, detail: { ...win.detail, evaluations: win.detail.evaluations.map(() => []) } }, new Date())).toBeNull();
  });
});

describe("a read at page load", () => {
  it("only fills gaps in a stored record, so an early read cannot overwrite a full one", () => {
    const connections = PARSERS.connections(loadCapture("connections", "win-2026-11-22"))!;
    const state = merge(empty(), applyRecord(empty(), connections, at));
    // Before the puzzle response, words are card positions.
    const early = { ...connections, detail: { ...connections.detail, guesses: connections.detail.guesses.map((g) => ({ ...g, words: ["1", "2", "3", "4"] })) } };
    expect(applyRecord(state, early, new Date(), true)).toBeNull();
  });

  it("still logs a game finished before the extension was installed", () => {
    expect(applyRecord(empty(), win, at, true)?.records).toEqual({ "wordle:2026-11-22": win });
  });
});
