import { describe, expect, it } from "vitest";
import { captureFrom } from "../../extension/src/capture";
import { GAMES } from "../../extension/src/games";
import { grade, parseWordle } from "../../src/parsers/wordle";
import { RECORD, type RecordOf } from "../../src/record";
import { loadCapture } from "../capture";
import { LIVE_GUESSES, liveRecord, liveResponse, liveStorage, solutionBody, solutionUrl, wordleNumber } from "../wordle-live";

/** dailies#11: the day QA won as a guest. */
const DAY = "2026-11-23";
const wordle = GAMES.find((g) => g.id === "wordle")!;
const view = (responses = [liveResponse(DAY)]) => ({ storage: liveStorage(DAY), responses, page: {}, indexedDB: {} });

describe("Wordle, a live guest win (dailies#11)", () => {
  it("numbers days the way the fixtures do", () => {
    expect(wordleNumber("2026-11-22")).toBe(1982);
    expect(wordleNumber(DAY)).toBe(1983);
  });

  it("logs tile marks and the puzzle number from the solution response", () => {
    const record = captureFrom(wordle, view());
    expect(record).toEqual(liveRecord(DAY));
    expect(RECORD.safeParse(record).success).toBe(true);
  });

  it("derives the puzzle number from the date when the solution response is missing", () => {
    expect(parseWordle({ localStorage: liveStorage(DAY) })?.puzzleNo).toBe(1983);
    const fixture = loadCapture("wordle", "win-2026-11-22");
    expect(parseWordle({ localStorage: fixture.localStorage! })?.puzzleNo).toBe(1982);
  });

  it("stores no record with empty tile marks when nothing can grade the guesses", () => {
    expect(parseWordle({ localStorage: liveStorage(DAY) })?.detail.guesses).toEqual(LIVE_GUESSES);
    expect(captureFrom(wordle, view([]))).toBeNull();
  });

  it("ignores a failed solution response", () => {
    const failed = { url: solutionUrl(DAY), method: "GET", status: 404, body: { status: "ERROR" } };
    expect(captureFrom(wordle, view([failed]))).toBeNull();
  });
});

describe("Wordle grading with repeated letters", () => {
  it("marks only as many letters present as the solution has left (SPEED against ABIDE)", () => {
    expect(grade("speed", "abide")).toEqual(["absent", "absent", "present", "absent", "present"]);
  });

  it("lets a correct letter use up its copy before any present one (ABBEY against KEBAB)", () => {
    expect(grade("abbey", "kebab")).toEqual(["present", "present", "correct", "present", "absent"]);
    expect(grade("eerie", "speed")).toEqual(["present", "present", "absent", "absent", "absent"]);
  });

  it("grades repeated letters through the capture path", () => {
    const storage = { "games-state-wordleV2/ANON": JSON.stringify({ states: [{ puzzleId: "4824", printDate: DAY, data: { boardState: ["speed", "abide", "", "", "", ""], status: "WIN", hardMode: false } }] }) };
    const body = { ...solutionBody(DAY), solution: "abide" };
    const record = captureFrom(wordle, { storage, responses: [{ ...liveResponse(DAY), body }], page: {}, indexedDB: {} }) as RecordOf<"wordle"> | null;
    expect(record?.detail.evaluations).toEqual([
      ["absent", "absent", "present", "absent", "present"],
      ["correct", "correct", "correct", "correct", "correct"],
    ]);
  });
});
