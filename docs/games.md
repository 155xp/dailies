# Tracked games

This file records, for every game `dailies` tracks, what the game itself saves for a finished result and where.
Every field listed here is backed by a captured fixture under `fixtures/<game>/`. A field with no fixture is
marked "from game code, not captured" or "none".

All captures were made on 2026-11-22 (US Eastern evening) in a fresh, signed-out headless Chromium profile.
Preference order for sources: the game's own share text, then its localStorage / IndexedDB state, then its
network responses, and only then the DOM.

Each case directory holds a `meta.json` (`game`, `case`, `sourceUrl`, `capturedAt`, `puzzleId`, `sources`,
`notes`) plus whichever of `share.txt`, `storage.json`, `network/*.json`, `dom.html` and `colors.json` the game
exposed. Account ids, anonymous player ids, run ids, signed receipts, player names, puzzle credit names and
ad or analytics keys are replaced with `REDACTED` or dropped. `test/fixtures.test.ts` checks this.

Emoji in share text are described by name in this document. The exact bytes are in each `share.txt`.

## Summary

| Game | URL used | Main source | Cases | Percentile or distribution |
|---|---|---|---|---|
| Krillion | https://krillion.io/ | localStorage `krillion:stats:v1` | win, partial (x2) | yes, server (`/api/today/complete`) |
| Travle | https://travle.earth | localStorage `travle-past-games` | win, loss | yes, server (`auth.teuteuf.fr/travle/scores`) |
| enclose.horse | https://enclose.horse/ | localStorage `enclose_submissions` | win, partial | yes, server (submit response, `/api/stats`) |
| Wordle (NYT) | https://www.nytimes.com/games/wordle/index.html | localStorage `games-state-wordleV2/ANON` | win, loss | none signed out |
| Connections (NYT) | https://www.nytimes.com/games/connections | localStorage `games-state-connections/ANON` | win, loss | none signed out |
| Spelling Bee (NYT) | https://www.nytimes.com/puzzles/spelling-bee | localStorage `games-state-spelling_bee/ANON` | partial (x2) | none signed out |
| Mini Crossword (NYT) | https://www.nytimes.com/crosswords/game/mini | nothing signed out (gated) | gated (x2) | none signed out |
| Globle | https://globle-game.com | localStorage `guesses`, `statistics` | win, partial | none |
| Songless (lessgames) | https://lessgames.com/songless | IndexedDB `game-store` / `sessions` | win, loss | yes, today only (`/songless/stats`) |

Songle: not tracked. lessgames.com lists Wordless, Songless, Spelling Bee, More/less, Clueless and Guessless
(sitemap adds Mapless), and `https://lessgames.com/songle` returns 404. Other things named Songle are an iOS
app with no web version and a web game reported as defunct. None is a separate web daily, so Songless is the
only song game tracked.

## Krillion

- URL used: `https://krillion.io/` ("Krillion, the daily dive": 7 prompts, 25 seconds each, rarer correct
  answers score more).
- Candidates seen: "Krillion Space" (a separate daily space trivia game on other sites), fan Minecraft and
  Roblox versions, and in-site modes (Keep Diving, Archive, Themed Packs, a party mode). Only krillion.io's daily
  dive is tracked.
- Puzzle id: date `YYYY-MM-DD` plus `dayNumber` from `GET /api/today` (`{date, dayNumber, resetsAt, prompts}`).
  Captured: 2026-11-22, Dive #130. Resets at 05:00 UTC (midnight US Eastern). Proof:
  `fixtures/krillion/win-2026-11-22/network/today.json`.
- Capture: share (clipboard and `navigator.share`), localStorage, network, DOM. No IndexedDB.
- Cases: `win-2026-11-22` (405 points, 7 of 7 correct), `partial-2026-11-22` (50 points, 3 correct, 2 wrong
  then timed out, 2 blank), `partial-2026-11-22-correction` (70 points, shows the server spelling correction).
  The game has no win or loss; "win" is a full correct dive.

Fields for a finished dive (all in `krillion:stats:v1.history[date]`, proof `*/storage.json`):

| Field | Where |
|---|---|
| score | `score` (405, 50); depth on screen is score x 10 metres, not stored |
| every answer in order | `results[i]` = `{promptId, promptText, rawAnswer, answer, tier, score, quip?, receipt}` |
| answer color | `results[i].tier` (`null` for a miss), also `tiers[i]` (`"miss"` for a miss) |
| wrong answer | `rawAnswer` = last typed text, `answer: null`, `tier: null`, `score: 0` |
| blank timeout | `rawAnswer: null`, `answer: null`, `tier: null`, `score: 0` |
| server correction | resubmitted text becomes `rawAnswer` (`partial-2026-11-22-correction/network/submit.json`) |
| streak and totals | `gamesPlayed, totalScore, bestScore, currentStreak, maxStreak, lastPlayedDate` |
| time | none (only the signed receipt's `issuedAt`, redacted) |
| hints | none |
| percentile | `POST /api/today/complete` returns `{sample, betterThan, dist[20]}`; shown as "better than 90%" (`*/network/today-complete.json`). Not stored locally. |
| answer popularity | `GET /api/answer-popularity?date=` maps each answer to a player count per prompt (`*/network/answer-popularity.json`) |

`krillion:game:v1` holds the dive in progress and is deleted when the dive ends (`*/storage-midgame.json`).
`krillion:player:v1` is the anonymous player id (redacted).

Colors (CSS variables `--tier-<tier>` on `:root`, proof `*/dom-colors.json`):

| Color | Tier | Points | Data value | Share emoji |
|---|---|---|---|---|
| #8fa3c4 | Plankton | 10 | `plankton` | bubbles |
| #4de3ff | Schooler | 30 | `schooler` | fish |
| #ff5252 | Rare | 60 | `rare` | squid |
| #9d7bff | Deep Cut | 85 | `deepcut` | lantern |
| #ffd166 | One in a Krillion | 100 | `krillion` | glowing star |
| #ff9f43 | Too Clever | 15 | `tooclever` (legend only, never produced) | unknown |
| #3d4f6e | Nothing landed (miss) | 0 | `null` / `"miss"` | black square |

A colorblind palette (`:root.colorblind`) overrides these; values are in `dom-colors.json`.

Share text: `Krillion #<dayNumber>` and a shrimp, the score, a blank line, one emoji per prompt. No URL.

Where results are saved: localStorage `krillion:stats:v1` (durable, keyed by date). The server also keeps each
answer and run, keyed by the anonymous player id.

## Travle

- URL used: `https://travle.earth` (daily mode). Not tracked: Weekly Challenge, Practice, hard mode.
- Puzzle id: daily number `gameId` / `puzzleIx` (1439 on 2026-11-22, Costa Rica to Chile), shown as `#travle
  #1439` in share text. `travle-game-state.hash` is `start:end:avoid` ISO3 codes.
- Capture: share (`navigator.clipboard.write`), localStorage, network. No IndexedDB.
- Cases: `win-2026-11-22` (6 guesses, +3, no hints), `loss-2026-11-22` (7 of 7 used, 3 away, 1 hint).

| Field | Where (proof `*/storage.json` unless noted) |
|---|---|
| solved | `travle-past-games.games[].won`; `travle-game-state.gameProgress` (`won`, `lost`) |
| guesses used | `games[].guesses`; par is `games[].minGuesses` |
| per-guess detail | `travle-game-state.pastGuessIds[i]` (ISO3) and `guessRatings[i]` |
| optimal route | `travle-game-state.gameSummary.optimalSolution` |
| distance left on a loss | `gameSummary.guessesNeededToSolve.length` (share shows "3 away") |
| hints | `games[].numHints`, `travle-game-state.hintsData[]` (`loss-2026-11-22`) |
| perfect | `games[].perfect` |
| time | none |
| percentile | "Top 95%" on the result chart (`win-2026-11-22/dom.html`), computed client side |
| distribution | `GET auth.teuteuf.fr/travle/scores/travle:<id>` returns 14 counts (`*/network/scores-get-*.json`) |

Distribution buckets: index `t*2 + (hints ? 1 : 0)`, where `t` is 0 for failed, 1 for perfect, else
`2 + extraGuesses`. Pairs are failed, perfect, +0, +1, +2, +3, +4.

Colors: per-guess ratings are stored as emoji in `guessRatings`, not CSS:

| Value | Meaning |
|---|---|
| check mark | on the shortest route |
| green square | on a shortest path but not next (from game code, not captured) |
| orange square | small detour |
| red square | bigger detour |

The map fills (`*/colors.json`) show connection to the start, not the rating: start #d3869b, target #7daea3,
connected guess #ddc7a1, disconnected guess #504a45.

Where results are saved: localStorage `travle-past-games` (`{games: [{gameId, guesses, minGuesses, won, numHints,
perfect}]}`, permanent history) and `travle-game-state` (today only). The server gets only an anonymous bucket.

## enclose.horse

- URL used: `https://enclose.horse/`. Per-day page `https://enclose.horse/play/<YYYY-MM-DD>`, stats page
  `https://enclose.horse/stats/<YYYY-MM-DD>`.
- Puzzle id: the player's local date picks the daily; each daily has a 6 character level id (`uwtFBO`),
  `dayNumber` (328) and name ("Contraption"). All storage is keyed by level id. Proof:
  `fixtures/enclose-horse/win-2026-11-22/network/daily-level.json`.
- Capture: share (clipboard), localStorage, network, DOM. No IndexedDB.
- Cases: `win-2026-11-22` (49 of 49, diamond, rank 1, plus the optional bonus round 36 of 36),
  `partial-2026-11-22` (4 of 13 walls, 10 points, bronze, percentile 1).

| Field | Where |
|---|---|
| score | `enclose_submissions[levelId].score` (`*/storage.json`); submit response `score` |
| walls (the layout) | `enclose_submissions[levelId].walls`, flat cell indexes `row*cols + col` |
| easy mode | `enclose_submissions[levelId].isEasy` |
| optimal score and walls | submit response `stats.optimalScore`, `stats.optimalWalls` (`*/network/submit.json`) |
| medal | derived: 100% diamond, 90% gold, 80% silver, else bronze |
| rank and percentile | submit response `rank`, `percentile` (server only) |
| distribution | submit response `stats.histogram[]`; `/api/stats/<date>` adds `medalPcts`, difficulty (`network/stats-page.json`) |
| bonus round | its own level id and `enclose_submissions` entry (`storage-after-bonus.json`, `network/bonus-*.json`) |
| time, hints | none |

Reconstructing the layout for a card:

1. Map: `daily-level.json` `.response.map`, newline-separated rows. `.` grass, `~` water, `H` horse, `U` unicorn
   (bonus), `W` fixed wall, `C` cherry (+3), `G` golden apple (+10), `S` bees (-5), digits and letters are
   portal pairs. In the page it is `window.__LEVEL__.map`.
2. Walls: `enclose_submissions[levelId].walls` (same list as the submit body).
3. Enclosed cells are not stored. Flood fill from the horse over 4-neighbours (portals jump), blocked by water,
   fixed walls and player walls. Reaching the border means the horse escapes. Score = cells reached + 3 per
   cherry + 10 per apple - 5 per bee swarm. A test script recomputed 49, 10 and 36 from the fixtures, matching
   the game.

Colors: the board is a canvas drawn from sprites, so these are sampled pixels (`win-2026-11-22/colors.json`):
grass #1b6b3a, water #062f48, player wall #777474, enclosed area #b1852a / #cda857, unicorn pen #aa8ccd, horse
#ffffff. Result band by medal: diamond #d4f4ff, gold #fff0b3, silver #e0e0e0, bronze #e8d4c4.

Share text: `https://enclose.horse Day <n>`, then medal line and percent (for example gem, "PERFECT!", gem, 100%).
No layout in share text.

Where results are saved: localStorage `enclose_submissions` (durable, one entry per level id) and
`enclose_progress` (unsubmitted work). Rank, percentile and histogram exist only on the server. The API refuses
requests that do not come from the site's own pages, so the extension reads them from the page's own responses.

## Wordle (NYT)

- URL used: `https://www.nytimes.com/games/wordle/index.html`, signed out.
- Puzzle id: `/svc/wordle/v2/<local YYYY-MM-DD>.json` returns `id` (4823, used in storage), `days_since_launch`
  (1982, the public number, "Wordle 1,982" in share text) and `print_date`. Chosen by the browser's local date.
- Capture: share (clipboard), localStorage, network, DOM. No IndexedDB.
- Cases: `win-2026-11-22` (3 of 6), `loss-2026-11-22` (X of 6).

| Field | Where (proof `*/storage.json`) |
|---|---|
| solved | `states[0].data.status` (`WIN`, `FAIL`) |
| guesses | `data.boardState` (words), `data.currentRowIndex` (count) |
| per-letter colors | not stored; recompute from `boardState` and `solution` (`network/puzzle-2026-11-22.json`), or read share squares |
| hard mode | `data.hardMode` |
| time, hints | none |
| distribution | none signed out; the stats modal is a sign-up wall (`win-2026-11-22/dom.html`) |

Colors (light mode, `colors.json`): correct #6aaa64, present #c9b458, absent #787c7e. Share uses green, yellow
and white squares in light mode.

Where results are saved: localStorage `games-state-wordleV2/ANON` (latest puzzle only). Nothing is posted
signed out.

## Connections (NYT)

- URL used: `https://www.nytimes.com/games/connections`, signed out.
- Puzzle id: `/svc/connections/v2/<local YYYY-MM-DD>.json` `id` (1370, used in storage). The page and share
  text say "Puzzle #1260"; that number is in no JSON, only the DOM and share text.
- Capture: share (clipboard), localStorage, network, DOM.
- Cases: `win-2026-11-22` (1 mistake), `loss-2026-11-22` (4 mistakes).

| Field | Where (proof `*/storage.json`) |
|---|---|
| solved | `data.puzzleWon`, `data.puzzleComplete` |
| mistakes | `data.mistakes` (max 4) |
| guesses | `data.guesses[]` = `{cards: [{position, level}], correct}` in order |
| solved groups | `data.solvedCategories[]` (groups revealed after a loss are not added) |
| time, hints | none |
| distribution | none signed out (`win-2026-11-22/dom.html` stats section) |

Colors (`colors.json`, value is `level`): yellow #f9df6d (0), green #a0c35a (1), blue #b0c4ef (2), purple
#ba81c5 (3).

Where results are saved: localStorage `games-state-connections/ANON`.

## Spelling Bee (NYT)

- URL used: `https://www.nytimes.com/puzzles/spelling-bee`, signed out.
- Puzzle id: `window.gameData.today.id` (9300) and `printDate`, inline in the page (`network/gameData.json`).
- Capture: localStorage, page data, DOM. No share text: signed out play never reaches the share screen.
- Cases: `partial-2026-11-22` (4 points, Good Start), `partial-paywall-2026-11-22` (37 points, Solid). Signed out
  play stops at Solid with "Subscribe to keep playing", so Genius and Queen Bee need a subscriber.

| Field | Where (proof `*/storage.json`) |
|---|---|
| found words | `data.answers` (entry order) |
| rank | `data.rank` |
| points | not stored; 4 letters = 1, longer = length, pangram +7 (matches `play-log.json`) |
| pangrams | `gameData.today.pangrams` intersected with found words |
| rank thresholds | percent of max points: Good Start 2, Moving Up 5, Good 8, Solid 15, Nice 25, Great 40, Amazing 50, Genius 70, Queen Bee 100 |
| time, guesses, hints | none |
| distribution | none (`partial-2026-11-22/dom.html`) |

Colors: no per-word result colors. Rank dots reached #f7da21, not reached #ebebeb (`colors.json`).

Where results are saved: localStorage `games-state-spelling_bee/ANON`.

## Mini Crossword (NYT)

- URL used: `https://www.nytimes.com/crosswords/game/mini` and `.../mini/2026/11/22`, signed out.
- Puzzle id: numeric `id` plus `publicationDate` (`network/puzzle.json`); `/svc/crosswords/v2/oracle/mini.json`
  gives the current id. New Minis go live the evening before the print date (6pm ET weekends, 10pm ET weekdays,
  `network/oracle.json`).
- Signed out the page shows only "Subscribe to play the Mini." with no grid (`*/dom.html`), so both cases are
  `gated`. No result, time, share text or colors could be captured, and nothing is written to localStorage.
- From game code, not captured: a signed-in save holds `cells`, `checked`, `revealed`, `firstSolve` (seconds),
  `playTimeSeconds`, `firstSolveUsedAid`, `star` and streaks.

## Globle

- URL used: `https://globle-game.com` (then `/game`).
- Puzzle id: the player's local date, stored as `guesses.day`. No puzzle number. The answer comes encrypted from
  `/answer?day=...` and is decrypted in the page.
- Capture: share (`navigator.share` or clipboard), localStorage, DOM. Nothing is uploaded.
- Cases: `win-2026-11-22` (9 guesses), `partial-2026-11-22` (4 guesses, unsolved). There is no loss state.

| Field | Where (proof `*/storage.json`) |
|---|---|
| solved | `statistics.lastWinPuzzleDate` equals `guesses.day` |
| guesses | `guesses.countries[]` (names, in order) |
| score | `guesses.countries.length`, also last of `statistics.usedGuesses` |
| per-guess color | not stored; only `statistics.emojiGuesses` on a win, and the share text |
| win time | `statistics.lastWin` |
| streaks | `statistics.currentStreak`, `maxStreak`, `gamesWon` |
| hints | none |
| distribution | none; the stats modal shows only totals and streaks (`win-2026-11-22/dom.html`) |

Colors: the globe is a canvas. Fill is a sequential orange-red scale over closest-border distance (0 to 15,000
km), the answer is green. `colors.json` lists the exact fill per guess. Emoji: under 10% of 15,000 km red,
under 25% orange, under 50% yellow, else white.

Where results are saved: localStorage `guesses` (today) and `statistics` (updated on wins only).

## Songless (lessgames)

- URL used: `https://lessgames.com/songless`, default "Top Hits" tab (category 0). Pop, Rock, Hip Hop and EDM are
  separate dailies with the same storage scheme.
- Puzzle id: `challengeDate` plus `categoryId`; share number `#451`. Resets about 05:00 UTC.
- Capture: share (clipboard), IndexedDB, network, DOM.
- Cases: `win-2026-11-22` (attempt 4), `loss-2026-11-22` (5 skips).

| Field | Where (proof `*/storage.json`) |
|---|---|
| solved | IndexedDB `game-store` / `sessions` / `[date, "songless", category]` `.state` (`won`, `lost`) |
| attempts used | `gameData.guesses` |
| per-attempt detail | `gameData.board[]` = `{state, id?, artist?, track?}`, state `correct`, `present`, `incorrect`, `skipped` |
| answer | `gameData.answer` (only after the game ends) |
| clip length | not stored; attempt n plays 0.1, 0.5, 2, 8, 15 seconds |
| percentile | `GET api.lessgames.com/songless/stats` `daily.distribution` (`*/network/stats.json`); "top 19.1% today" |

Colors (`dom-colors.json`): correct rgb(85,183,37), right artist wrong song rgb(218,195,22), wrong
rgb(198,33,33), skipped rgb(48,52,54).

Where results are saved: IndexedDB `game-store`, store `sessions`. localStorage holds settings only.

## NYT games: signed-in players

Signed out, all four NYT games keep only today's state in localStorage under `games-state-<game>/ANON`. From
the game code (not captured, since no account was used): a signed-in player's key becomes
`games-state-<game>/<account id>`, and the game also syncs to `POST /svc/games/state`. Stats (streaks, guess or
mistake distribution) come from `GET /svc/games/state/<game>/latests?puzzle_ids=<id>`, which returns 403 signed
out (`network/*-403.json`, `state-latests.json`).

What needs an account or subscription:

- Free account: stats, streaks, guess distribution (Wordle), mistake distribution (Connections), badges.
- Subscription: the Mini at all, Spelling Bee above Solid, archives.

How the extension reads it once the player is signed in on their own browser: a content script on
`www.nytimes.com` reads localStorage keys matching `^games-state-<game>/` (works signed in or out), and for
stats either calls the same `latests` endpoint with the player's own cookies (`credentials: "include"`) or
observes the page's own requests. It must drop the account id before saving anything.

## Capture check

Every UNVERIFIED item from the design research (key names, selectors, colors, where the result is saved) is
confirmed, corrected or left UNVERIFIED in [CAPTURE.md](CAPTURE.md), with a fixture source for each row.
