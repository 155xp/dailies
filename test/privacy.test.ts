import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The repo is public: no personal info in any tracked file or file name. Every hostname-looking
 * string must be on this list (a listed domain also covers its subdomains).
 */
const ALLOWED_DOMAINS = [
  // the nine games
  "krillion.io",
  "travle.earth",
  "enclose.horse",
  "nytimes.com",
  "nyt.com",
  "globle-game.com",
  "lessgames.com",
  // linked from the game pages saved in fixtures/
  "teuteuf.fr",
  "globle-capitals.com",
  "globle-leagues.com",
  "geogridgame.com",
  "bonedoggle.com",
  "less.gg",
  "trainwrecklabs.com",
  "itunes.apple.com",
  "soundcloud.com",
  "instagram.com",
  "discord.gg",
  "nytimes.onelink.me",
  // code hosting and standards
  "github.com",
  "w3.org",
  // the reserved test host the e2e harness serves the site from
  "dailies.test",
];
const ALLOWED_IPS = ["127.0.0.1", "0.0.0.0"];

const TLDS = "com|net|org|io|dev|app|earth|horse|co|me|sh|xyz|ai|gg|info|us|uk|de|fr|eu|ca|nl|jp|page|site|cloud|so|tv|fm|ly|be|local|lan|home|internal|localdomain|test";
const PATTERNS: Record<string, RegExp> = {
  "home directory": /(?:\/home\/|\/Users\/|[A-Z]:\\Users\\)(?!<)[\w.-]+/g,
  email: /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi,
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  // A lowercase dotted name ending in a real TLD, not followed by more name, a call, an optional chain
  // or an assignment (`re.test(`, `a.page?.x`, `a.page = {}`).
  domain: new RegExp(`\\b(?:[a-z0-9-]+\\.)+(?:${TLDS})\\b(?![\\w(?-]|\\.[a-z]|\\s*=)`, "g"),
};

/**
 * Words that must never appear (names, machine names), passed in at run time so they are never written
 * into the repo. Krillion's answer popularity is thousands of other players' answers, so any first name
 * turns up there by chance; that file is skipped for these words only.
 */
const CROWD = /^fixtures\/krillion\/[^/]+\/network\/answer-popularity\.json$/;
const privateWords = (process.env.DAILIES_PRIVATE_WORDS ?? "").split(",").map((w) => w.trim()).filter(Boolean);

const allowedDomain = (host: string) => ALLOWED_DOMAINS.some((d) => host.toLowerCase() === d || host.toLowerCase().endsWith(`.${d}`));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findPersonalInfo(name: string, text: string): string[] {
  const hits: string[] = [];
  const lines = `${name}\n${text}`.split("\n");
  lines.forEach((line, i) => {
    const where = i === 0 ? `${name} (path)` : `${name}:${i}`;
    for (const [kind, re] of Object.entries(PATTERNS)) {
      for (const [m] of line.matchAll(re)) {
        if (kind === "ip" && ALLOWED_IPS.includes(m)) continue;
        if (kind === "domain" && allowedDomain(m)) continue;
        hits.push(`${where}: ${kind} ${m}`);
      }
    }
    if (!CROWD.test(name)) for (const w of privateWords) if (new RegExp(`\\b${escape(w)}\\b`, "i").test(line)) hits.push(`${where}: private word`);
  });
  return hits;
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|webm|mp4|zip|woff2?|ttf)$/i;

describe("privacy", () => {
  it("the matchers catch each kind of personal info and pass the allowed names", () => {
    // Built from pieces so this file does not trip its own scan.
    const bad = ["/" + "home/someone/dailies", "C:" + "\\Users\\someone", "some.one" + "@" + "mail.example" + ".org", "192.168" + ".1.20", "my-laptop" + ".local", "dashboard.my-own-site" + ".dev"];
    for (const b of bad) expect(findPersonalInfo("x.md", b), b).not.toEqual([]);
    const fine = ["https://www.nytimes.com/games/wordle/index.html", "http://127.0.0.1/", "react@19.3.1", "test.info().project", "re.test(s)", "capture.page?.gameData", "capture.page = {};", "record.test.ts", "/home/<user>"];
    for (const f of fine) expect(findPersonalInfo("x.md", f), f).toEqual([]);
  });

  it("no tracked file or file name holds a home path, email, IP, private hostname or unlisted domain", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    expect(files.length).toBeGreaterThan(50);
    const hits = files.flatMap((f) => {
      const raw = BINARY.test(f) ? Buffer.alloc(0) : readFileSync(f);
      return findPersonalInfo(f, raw.includes(0) ? "" : raw.toString("utf8"));
    });
    expect(hits).toEqual([]);
  });
});
