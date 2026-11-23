import { describe, expect, it } from "vitest";
import { applyMiss, applyRecord, recordKey, todayRows, type State } from "../../extension/src/store";
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

describe("misses against today's log", () => {
  it("drops a miss for a game already logged today, even under its own earlier game day", () => {
    const logged = merge(empty(), applyRecord(empty(), win, new Date(2026, 10, 23, 9, 0)));
    const miss = { game: "wordle" as const, date: "2026-11-23", reason: "x", at: new Date(2026, 10, 23, 9, 1).toISOString() };
    expect(applyMiss(logged, miss)).toBeNull();
  });

  it("keeps a miss when the game's only record was logged on an earlier day", () => {
    const logged = merge(empty(), applyRecord(empty(), win, new Date(2026, 10, 22, 9, 0)));
    const miss = { game: "wordle" as const, date: "2026-11-23", reason: "x", at: new Date(2026, 10, 23, 9, 1).toISOString() };
    expect(applyMiss(logged, miss)?.misses).toEqual({ "wordle:2026-11-23": miss });
  });
});

describe("Spamle: a revisit that reads storage before the page's words", () => {
  it("keeps the logged names, writes nothing, and does not count the old Daily as logged on a later day", () => {
    const full = loadCapture("spamle", "win-2026-11-23");
    const named = PARSERS.spamle(full)!;
    const loggedAt = new Date(2026, 10, 23, 12, 39);
    const state = merge(empty(), applyRecord(empty(), named, loggedAt));
    expect(named.detail.rounds[0]!.answers[4]!.answer).toBe("West Coast hip-hop");

    // The next day the page is opened again. An allowlisted response lands before load, so the capture has
    // storage and network but not the page snapshot: prompts are null and answers fall back to saved keys.
    const bare = structuredClone(full);
    Reflect.deleteProperty(bare, "page");
    const early = PARSERS.spamle(bare)!;
    expect(early.detail.rounds[0]!.answers[4]!.answer).toBe("westcoasthiphop");
    const revisit = new Date(2026, 10, 24, 9, 0);
    expect(applyRecord(state, early, revisit, false)).toBeNull();

    // The load read, with the snapshot again, is the record already stored.
    expect(applyRecord(state, named, revisit, true)).toBeNull();
    expect(state.records[recordKey("spamle", "2026-11-23")]!.detail).toEqual(named.detail);
    expect(state.loggedAt[recordKey("spamle", "2026-11-23")]).toBe(loggedAt.toISOString());
    expect(state.lastLogAt).toBe(loggedAt.toISOString());
    expect(todayRows(state, revisit).find((r) => r.game.id === "spamle")?.status).toBe("none");
  });

  it("still takes a later capture with more finished rounds, keeping the words it already had", () => {
    // The same play after 2 of 5 rounds, with the snapshot.
    const full = loadCapture("spamle", "win-2026-11-23");
    const two = structuredClone(full);
    const saved = two.localStorage!["spamle-v1"] as { days: Record<string, { rounds: unknown[] }> };
    saved.days["2026-11-23"]!.rounds = saved.days["2026-11-23"]!.rounds.slice(0, 2);
    const early = PARSERS.spamle(two)!;
    expect(early).toMatchObject({ status: "partial", score: 59 });
    const state = merge(empty(), applyRecord(empty(), early, new Date(2026, 10, 23, 12, 36)));

    // The finished Daily, captured without the snapshot: the two known rounds keep their words.
    Reflect.deleteProperty(full, "page");
    const later = PARSERS.spamle(full)!;
    const at = new Date(2026, 10, 23, 12, 39);
    const next = merge(state, applyRecord(state, later, at));
    const stored = next.records[recordKey("spamle", "2026-11-23")] as typeof later;
    expect(stored).toMatchObject({ status: "won", score: 146 });
    expect(stored.detail.rounds[0]!.answers[4]!.answer).toBe("West Coast hip-hop");
    expect(stored.detail.rounds.map((r) => r.prompt)).toEqual(["Music genres", "Pokémon types and moves", null, null, null]);
    expect(stored.detail.rounds[2]!.answers[0]!.answer).toBe("great");
    expect(next.loggedAt[recordKey("spamle", "2026-11-23")]).toBe(at.toISOString());
  });
});
