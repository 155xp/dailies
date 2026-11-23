import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRecord } from "../fixture-records";
import { aboutKm, distanceKm, resolve } from "../src/cards/geo";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");
const cases = <G extends "travle" | "globle">(game: G) => readdirSync(join(FIXTURES, game)).map((dir) => fixtureRecord(game, dir));

/** Every country name any Travle or Globle fixture carries: guesses, routes, and Globle's countries. */
const NAMES = [
  ...cases("travle").flatMap((r) => [...r.detail.guesses.map((g) => g.country), ...r.detail.optimalRoute]),
  ...cases("globle").flatMap((r) => r.detail.countries),
];

describe("geo name resolver", () => {
  it("maps every country name in fixtures/travle and fixtures/globle to a world-atlas feature", () => {
    expect(NAMES.length).toBeGreaterThan(20);
    for (const name of new Set(NAMES)) {
      const c = resolve(name);
      expect(c, name).not.toBeNull();
      expect(c!.feature.type, name).toBe("Feature");
      expect(c!.feature.geometry, name).toBeTruthy();
      expect(c!.name.length, name).toBeGreaterThan(0);
    }
  });

  it("reads ISO codes and the games' own spellings", () => {
    expect(resolve("CHL")?.name).toBe("Chile");
    expect(resolve("CRI")?.name).toBe("Costa Rica");
    expect(resolve("Türkiye")?.feature).toBe(resolve("Turkey")?.feature);
    expect(resolve("United States")?.feature).toBe(resolve("USA")?.feature);
    expect(resolve("afghanistan")?.name).toBe("Afghanistan");
  });

  it("returns null for unknown names and never throws", () => {
    for (const name of ["", "  ", "Atlantis", "ZZZ", "XK?", "null", "constructor", "__proto__", "toString", "\u{1F1EB}\u{1F1F7}", "a".repeat(500)]) {
      expect(() => resolve(name), name).not.toThrow();
      expect(resolve(name), name).toBeNull();
    }
  });
});

describe("geo distances", () => {
  it("measures the great-circle distance between centroids in km", () => {
    const hav = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) => {
      const r = Math.PI / 180;
      const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(a));
    };
    const [af, pk, br] = [resolve("Afghanistan")!, resolve("Pakistan")!, resolve("Brazil")!];
    expect(Math.abs(distanceKm(af, pk) - hav(af.center, pk.center))).toBeLessThan(1);
    expect(distanceKm(af, pk)).toBeGreaterThan(300);
    expect(distanceKm(af, pk)).toBeLessThan(1500);
    expect(distanceKm(af, br)).toBeGreaterThan(11000);
    const [lon, lat] = resolve("Chile")!.center;
    expect(lon).toBeGreaterThan(-76);
    expect(lon).toBeLessThan(-66);
    expect(lat).toBeGreaterThan(-56);
    expect(lat).toBeLessThan(-17);
  });

  it("rounds a distance to the nearest 100 km in words", () => {
    expect(aboutKm(1234)).toBe("about 1,200 km");
    expect(aboutKm(1250)).toBe("about 1,300 km");
    expect(aboutKm(12960)).toBe("about 13,000 km");
    expect(aboutKm(640)).toBe("about 600 km");
    expect(aboutKm(87)).toBe("under 100 km");
  });
});
