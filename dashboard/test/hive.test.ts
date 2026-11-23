import { describe, expect, it } from "vitest";
import { fixtureRecord } from "../fixture-records";
import { hive } from "../src/cards/hive";

/**
 * `hive(words, pangrams)` gives the seven letters to draw, `letters[0]` in the middle cell,
 * and whether that middle letter is the known center (the one letter every found word shares).
 * It returns null when the letters themselves can't be known, and the card keeps its old layout.
 */
describe("Spelling Bee hive from the record", () => {
  it("real fixture with a pangram: seven letters from it, no single shared letter, so no center", () => {
    const { detail } = fixtureRecord("spelling-bee", "partial-paywall-2026-11-22");
    expect(detail.pangrams).toEqual(["pothead"]);
    // pothead, ahead, deadhead, deadheaded all share a, d, e and h: no single center.
    expect(hive(detail.words, detail.pangrams)).toEqual({ letters: ["a", "d", "e", "h", "o", "p", "t"], center: false });
  });

  it("real fixture without a pangram: the letters can't be known, so no hive", () => {
    const { detail } = fixtureRecord("spelling-bee", "partial-2026-11-22");
    expect(detail.pangrams).toEqual([]);
    expect(hive(detail.words, detail.pangrams)).toBeNull();
  });

  it("one letter shared by every found word becomes the center, the other six go round it in order", () => {
    expect(hive(["pothead", "path", "hope", "heat"], ["pothead"])).toEqual({ letters: ["h", "a", "d", "e", "o", "p", "t"], center: true });
  });

  it("only the pangram found: all seven letters are shared, so no center", () => {
    expect(hive(["pothead"], ["pothead"])).toEqual({ letters: ["a", "d", "e", "h", "o", "p", "t"], center: false });
  });

  it("ignores letter case", () => {
    expect(hive(["POTHEAD", "Path", "hope", "heat"], ["PotHead"])).toEqual({ letters: ["h", "a", "d", "e", "o", "p", "t"], center: true });
  });

  it("a pangram without exactly seven distinct letters gives no hive", () => {
    expect(hive(["deadheaded"], ["deadheaded"])).toBeNull();
    expect(hive(["photographed"], ["photographed"])).toBeNull();
  });

  it("a found word using a letter outside the pangram gives no hive", () => {
    expect(hive(["pothead", "hello"], ["pothead"])).toBeNull();
  });

  it("two pangrams with different letters give no hive; with the same letters, they agree", () => {
    expect(hive(["pothead", "anything"], ["pothead", "anything"])).toBeNull();
    expect(hive(["pothead", "hotpad", "teapod"], ["pothead", "teapodh"])).toEqual({ letters: ["a", "d", "e", "h", "o", "p", "t"], center: false });
  });

  it("no words and no pangram gives no hive", () => {
    expect(hive([], [])).toBeNull();
  });
});
