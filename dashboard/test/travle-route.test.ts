import { describe, expect, it } from "vitest";
import { fixtureRecord } from "../fixture-records";
import { resolve, touches } from "../src/cards/geo";
import { playerRoute } from "../src/cards/travle-route";

const win = fixtureRecord("travle", "win-2026-11-22").detail;
const loss = fixtureRecord("travle", "loss-2026-11-22").detail;
const borders = (a: string, b: string) => touches(resolve(a)!, resolve(b)!);
const codes = (d: typeof win) => d.guesses.map((g) => g.country);

describe("land borders from the atlas", () => {
  it("knows which countries share a border", () => {
    expect(borders("CRI", "PAN")).toBe(true);
    expect(borders("PER", "CHL")).toBe(true);
    expect(borders("COL", "ECU")).toBe(true);
    expect(borders("MEX", "CRI")).toBe(false);
    expect(borders("ESP", "CHL")).toBe(false);
    expect(borders("AUS", "PER")).toBe(false);
  });
});

describe("the player's route", () => {
  it("won: a chain of bordering countries from the start to the end through the player's guesses", () => {
    const r = playerRoute(win.optimalRoute, codes(win), borders);
    expect(r.path).toEqual(["CRI", "PAN", "COL", "PER", "CHL"]);
    expect(r.missing).toEqual([]);
    for (let i = 1; i < r.path.length; i++) expect(borders(r.path[i - 1]!, r.path[i]!), `${r.path[i - 1]} ${r.path[i]}`).toBe(true);
    for (const c of r.path.slice(1, -1)) expect(codes(win)).toContain(c);
  });

  it("lost: the chain borrows the shortest-route countries the player missed, and they number the game's N away", () => {
    const r = playerRoute(loss.optimalRoute, codes(loss), borders);
    expect(r.path[0]).toBe("CRI");
    expect(r.path.at(-1)).toBe("CHL");
    expect(r.missing).toEqual(["PAN", "COL", "PER"]);
    expect(r.missing.length).toBe(loss.away);
    for (let i = 1; i < r.path.length; i++) expect(borders(r.path[i - 1]!, r.path[i]!), `${r.path[i - 1]} ${r.path[i]}`).toBe(true);
  });

  it("prefers the player's own detour over a route country they never guessed", () => {
    const touch = new Set(["A-B", "B-C", "C-D", "B-X", "X-D"]);
    const t = (a: string, b: string) => touch.has(`${a}-${b}`) || touch.has(`${b}-${a}`);
    const r = playerRoute(["A", "B", "C", "D"], ["B", "X"], t);
    expect(r.path).toEqual(["A", "B", "X", "D"]);
    expect(r.missing).toEqual(["C"]);
  });

  it("orders the chain by borders, not by when each country was guessed", () => {
    const touch = new Set(["A-B", "B-C", "C-D"]);
    const t = (a: string, b: string) => touch.has(`${a}-${b}`) || touch.has(`${b}-${a}`);
    expect(playerRoute(["A", "B", "C", "D"], ["C", "B"], t).path).toEqual(["A", "B", "C", "D"]);
  });

  it("with no border data, or no guesses, falls back to the shortest route itself", () => {
    expect(playerRoute(["A", "B", "C"], ["B"], () => false).path).toEqual(["A", "B", "C"]);
    expect(playerRoute(["A", "B", "C"], [], () => false)).toEqual({ path: ["A", "B", "C"], missing: ["B"] });
    expect(playerRoute(["A", "B"], [], () => false)).toEqual({ path: ["A", "B"], missing: [] });
  });
});
