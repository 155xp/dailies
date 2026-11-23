import { describe, expect, it } from "vitest";
import { buildManifest } from "../../extension/src/manifest";

/** The 9 game patterns from the design spec, Part 2, in display order. */
const GAMES = [
  "https://krillion.io/*",
  "https://travle.earth/*",
  "https://enclose.horse/*",
  "https://www.nytimes.com/games/wordle/*",
  "https://www.nytimes.com/games/connections*",
  "https://www.nytimes.com/puzzles/spelling-bee*",
  "https://www.nytimes.com/crosswords/game/mini*",
  "https://globle-game.com/*",
  "https://lessgames.com/songless*",
];
const LOCAL = ["http://localhost/*", "http://127.0.0.1/*"];

describe("manifest", () => {
  it("lists only the 9 game patterns plus the local dashboard origins", () => {
    const m = buildManifest({ version: "1.0.0" });
    expect(m.host_permissions).toEqual([...GAMES, ...LOCAL]);
    expect(m.content_scripts).toEqual([
      { matches: GAMES, js: ["hook.js"], run_at: "document_start", world: "MAIN" },
      { matches: GAMES, js: ["content.js"], run_at: "document_start" },
      { matches: LOCAL, js: ["bridge.js"], run_at: "document_idle" },
    ]);
  });

  it("adds dashboard origins from DAILIES_DASHBOARD_ORIGINS to the bridge only", () => {
    const m = buildManifest({ version: "1.0.0", dashboardOrigins: " https://a.example , https://b.example:8443/ " });
    const dash = [...LOCAL, "https://a.example/*", "https://b.example:8443/*"];
    expect(m.host_permissions).toEqual([...GAMES, ...dash]);
    expect(m.content_scripts?.[0]?.matches).toEqual(GAMES);
    expect(m.content_scripts?.[2]?.matches).toEqual(dash);
  });

  it("rejects a dashboard entry that is not a bare http(s) origin", () => {
    for (const bad of ["<all_urls>", "*://*/*", "https://a.example/path", "https://*.example", "ftp://a.example"]) {
      expect(() => buildManifest({ version: "1.0.0", dashboardOrigins: bad })).toThrow();
    }
  });

  it("asks for storage and scripting only: no alarms, tabs, webRequest or all-urls access", () => {
    const m = buildManifest({ version: "1.0.0" });
    // scripting: on install or update, inject the bridge into dashboard tabs that were already open.
    expect(m.permissions).toEqual(["storage", "scripting"]);
    expect(m.optional_permissions).toBeUndefined();
    const text = JSON.stringify(m);
    for (const banned of ["<all_urls>", "alarms", "webRequest", '"tabs"', "*://*"]) expect(text).not.toContain(banned);
  });

  it("uses an MV3 service worker, never a persistent background page", () => {
    const m = buildManifest({ version: "1.0.0" });
    expect(m.manifest_version).toBe(3);
    expect(m.background).toEqual({ service_worker: "background.js", type: "module" });
  });
});
