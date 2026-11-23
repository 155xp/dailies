import { describe, expect, it } from "vitest";
import { parseMini } from "../../src/parsers/mini";
import { loadCapture } from "../capture";

describe("parseMini", () => {
  it("finds no result signed out, where the board is gated (fixtures/mini/*/dom.html)", () => {
    expect(parseMini(loadCapture("mini", "gated-2026-11-22"))).toBeNull();
    expect(parseMini(loadCapture("mini", "gated-2026-11-23"))).toBeNull();
  });
});
