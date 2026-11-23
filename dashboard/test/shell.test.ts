import { describe, expect, it } from "vitest";
import type { DailyRecord } from "../../src/record";
import { GAMES } from "../src/games";
import { predict, SHELL_KEY, snapshotOf } from "../src/shell";

/** dailies#16 snapshot logic. Written before the change; never edited after. */
const TODAY = "2026-11-22";
const YESTERDAY = "2026-11-21";
const raw = (v: unknown) => JSON.stringify(v);
const rec = (game: DailyRecord["game"], date = TODAY) => ({ game, date }) as DailyRecord;
const miss = (game: string, date = TODAY) => ({ game, date, reason: "r", at: `${date}T12:00:00Z` });

describe("the shell's prediction from the last snapshot", () => {
  it("is stored under one key", () => {
    expect(SHELL_KEY).toBe("dailies-shell");
  });

  it("no snapshot: a first visit, read as missing, with every row one line", () => {
    expect(predict(null, TODAY)).toEqual({ state: "missing", played: [] });
  });

  it("an unreadable or unknown snapshot is read as no snapshot", () => {
    for (const bad of ["", "{not json", "null", "42", raw({ date: TODAY, state: "loading", played: [] }), raw({ date: TODAY })]) {
      expect(predict(bad, TODAY), bad).toEqual({ state: "missing", played: [] });
    }
  });

  it("missing stays missing, whatever the day", () => {
    expect(predict(raw({ date: TODAY, state: "missing", played: [] }), TODAY)).toEqual({ state: "missing", played: [] });
    expect(predict(raw({ date: YESTERDAY, state: "missing", played: [] }), TODAY)).toEqual({ state: "missing", played: [] });
  });

  it("a stale date: a new day with nothing played yet, so empty, with no played rows", () => {
    expect(predict(raw({ date: YESTERDAY, state: "connected", played: ["wordle", "travle"] }), TODAY)).toEqual({ state: "empty", played: [] });
    expect(predict(raw({ date: YESTERDAY, state: "empty", played: ["mini"] }), TODAY)).toEqual({ state: "empty", played: [] });
  });

  it("connected today keeps its played games", () => {
    expect(predict(raw({ date: TODAY, state: "connected", played: ["krillion", "wordle"] }), TODAY)).toEqual({ state: "connected", played: ["krillion", "wordle"] });
  });

  it("empty today keeps any played-not-logged rows, which take two lines too", () => {
    expect(predict(raw({ date: TODAY, state: "empty", played: [] }), TODAY)).toEqual({ state: "empty", played: [] });
    expect(predict(raw({ date: TODAY, state: "empty", played: ["mini"] }), TODAY)).toEqual({ state: "empty", played: ["mini"] });
  });

  it("drops played entries that are not strings", () => {
    expect(predict(raw({ date: TODAY, state: "connected", played: ["wordle", 3, null] }), TODAY)).toEqual({ state: "connected", played: ["wordle"] });
  });

  it("runs on its own, so index.html can inline it as written", () => {
    const inlined = new Function(`return (${predict.toString()})`)() as typeof predict;
    expect(inlined(raw({ date: TODAY, state: "connected", played: ["wordle"] }), TODAY)).toEqual({ state: "connected", played: ["wordle"] });
    expect(inlined(null, TODAY)).toEqual({ state: "missing", played: [] });
  });
});

describe("the snapshot the app writes", () => {
  it("connected with results today: connected, the played games in display order, played-not-logged included", () => {
    const s = snapshotOf("connected", [rec("wordle"), rec("krillion"), rec("travle", YESTERDAY)], [miss("spelling-bee"), miss("mini", YESTERDAY)], TODAY);
    expect(s).toEqual({ date: TODAY, state: "connected", played: ["krillion", "wordle", "spelling-bee"] });
    expect(s!.played).toEqual(GAMES.map((g) => g.id).filter((id) => s!.played.includes(id)));
  });

  it("connected with nothing logged today: empty, keeping any played-not-logged rows", () => {
    expect(snapshotOf("connected", [rec("wordle", YESTERDAY)], [], TODAY)).toEqual({ date: TODAY, state: "empty", played: [] });
    expect(snapshotOf("connected", [], [miss("mini")], TODAY)).toEqual({ date: TODAY, state: "empty", played: ["mini"] });
  });

  it("missing: missing", () => {
    expect(snapshotOf("missing", [], [], TODAY)).toEqual({ date: TODAY, state: "missing", played: [] });
  });

  it("loading and error write nothing, so the last good snapshot stands", () => {
    expect(snapshotOf("loading", [], [], TODAY)).toBeNull();
    expect(snapshotOf("error", [rec("wordle")], [], TODAY)).toBeNull();
  });

  it("round trips: what the app writes today predicts the same state and rows", () => {
    const s = snapshotOf("connected", [rec("wordle")], [miss("mini")], TODAY)!;
    expect(predict(raw(s), TODAY)).toEqual({ state: "connected", played: ["wordle", "mini"] });
  });
});
