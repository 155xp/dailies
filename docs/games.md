# Tracked games

This file records, for every game `dailies` tracks, what the game itself saves for a finished result and where.
Every field listed here is backed by a captured fixture under `fixtures/<game>/`. A field with no fixture is
marked "from game code, not captured" or "none".

All captures were made on 2026-11-22 (US Eastern evening) in a fresh, signed-out headless Chromium profile;
Spamle, added later, was captured the same way on 2026-11-23 (US Eastern midday).
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
| Spamle | https://spamle.com/ | localStorage `spamle-v1`, plus words from page memory | win, partial | yes, finished Daily only (`/rest/v1/rpc/day_totals`) |

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

## Spamle

- URL used: `https://spamle.com/` ("Name as many as you can. Rarer answers are worth more!"). Only the Daily is
  tracked: 5 categories a day. Not tracked: Practice, the Archive (replays of past Dailies), the tutorial.
- Puzzle id: the US Eastern date (`today` in the page is `America/New_York`), numbered from Daily #1 on 2026-11-11:
  2026-11-23 is Spamle #13 (`dayNo`, share text `Spamle #13`). New prompts at midnight Eastern.
- How a round runs (from the page code): 10 s to think (tap to skip), then a 7 s answer clock that each right
  answer resets. The clock really runs 8 s: it shows 7.0 and its last 2 shown seconds take 3 real seconds. Each
  right answer also banks bonus seconds equal to its points, up to 10 s, spent once when the clock runs out;
  answers in bonus time score but add no time. A right answer still in the box at zero counts.
- Capture: share (clipboard), localStorage, page memory, network, DOM. No IndexedDB. Both cases were played
  through the game's own page in a fresh signed-out profile, typing answers into its box.
- Cases: `win-2026-11-23` (all 5 rounds, 53 gumballs, 146 points, TOP 5%), `partial-2026-11-23` (2 of 5 rounds,
  13 gumballs, 27 points). Spamle has no win or loss; as with Krillion, "win" is the whole Daily played and
  "partial" is fewer rounds. A round still running is left out until it ends.

Fields (proof `*/storage.json` unless noted):

| Field | Where |
|---|---|
| the day's rounds | `spamle-v1.days[<Eastern date>].rounds[]`, in play order |
| Daily played live | `days[date].live: true`, set when a Daily round ends; Archive replays never set it, so the parser takes the latest live day |
| round finished | `rounds[i].done` |
| prompt | `rounds[i].p`, an id (`genres`). The text ("Music genres") is only in page memory: `page.json` |
| right answers | `rounds[i].g`, normalized keys in the order given (`westcoasthiphop`); display names ("West Coast hip-hop") only in page memory |
| points per answer, rarity | `rounds[i].s[j]`, 1 to 5 = Common, Uncommon, Rare, Epic, Legendary; written with each answer |
| answers that did not count | `rounds[i].w`, the typed text (the record keeps only the count) |
| bonus banked | `rounds[i].bonus` (seconds, at most 10) |
| round points, day score | sum of `s`; the day's score counts finished rounds only (`dayTotal`), 146 and 27 |
| gumballs | count of `g` over finished rounds (share text "53 gumballs") |
| round rating and targets | not stored; the page's `targets(P[id])` gives `{ok, good, great, top}` and the rating is the highest reached: Warm-up, Not bad, Good, Great, Spamtastic (`page.json`, `win-2026-11-23/dom.html`) |
| possible answers | not stored; `P[id].ans.length` (`page.json`) |
| percentile | `POST /rest/v1/rpc/day_totals` returns every other finisher's total for the page's day (`*/network/day-totals.json`, 2,429 numbers). Better than = (below + ties / 2) / n; shown as `TOP max(1, 100 - better)%`, "#1 TODAY" when every other total is lower, "FIRST TO FINISH" with none. The parser reproduces TOP 5%. |
| distribution | the same totals plus this player in 50-point buckets, the last 450 and up: the game's "where you landed" hill |
| which day the totals are for | `day_totals` takes no date. The leaderboard call in the same page names it (`/rest/v1/scores?day=eq.<date>&select=...`, `*/network/scores-board.trimmed.json`); totals count only when it matches the record's day |
| time, hints, streak | none recorded (the streak on screen is counted from `days`) |

Page memory (`*/page.json`): Spamle saves ids only. The extension's page-world hook reads, for the latest live
Daily's prompts only, the prompt text, the number of possible answers, the targets and the names of the answers
given, from the page's own top-level `P` and `targets` (`extension/src/spamle-page.ts`). It does this with each
`spamle-v1` write and once at load. Without it a record still saves, with prompt ids and answer keys in place of
words; a later read fills them in.

Colors (`win-2026-11-23/colors.json`, computed in the page):

| Rarity | Points | Color (`.r1`-`.r5`, `RAR`) | Gumball shade (`BALL`) | Share emoji |
|---|---|---|---|---|
| Common | 1 | #b8b4c8 | #7d7894 | white circle |
| Uncommon | 2 | #5ddc6a | #2f9a3c | green circle |
| Rare | 3 | #7cc8ff | #3484c4 | blue circle |
| Epic | 4 | #b06cff | #6e34b8 | purple circle |
| Legendary | 5 | #ffd23f | #d9a400 (ball body #ffe680) | yellow circle |

Round ratings (`--t0`-`--t4`): Warm-up #8e88c9, Not bad #ffd23f, Good #ff9f1c, Great #5dffb0, Spamtastic #b18cff;
the share and results screen draw them as white, yellow, orange, green and purple squares. The page is dark only
(`--bg` #0d0b26) and set in Press Start 2P and VT323.

Rarity comes from where an answer sits in its category's list (best known first): top 10% Common, next 15%
Uncommon (capped at 40 and 100 answers on big lists), next 40% Rare, next 25% Epic, last 10% Legendary; the last
answer is always Legendary and the one before at least Epic. The page code also lowers an answer's rarity once 10
or more players have named it often, but on spamle.com that table stays empty (a code comment says it feeds
another build of the game), so there rarity is by list position. The record keeps the points the game saved.

Share text: `Spamle #13`, then a candy and `53 gumballs · 146 pts · TOP 5%`, five lines `<emoji> <n> <Rarity>`,
then `spamle.com/?from=share`. The only share control is "Copy my result" on the finished Daily; a partial day has
none. The rank part is left out when there is no TOP % or #1.

Where results are saved: localStorage `spamle-v1` (all days, durable). Other keys are not read: `spamle-player`
(anonymous id and secret), `spamle-dev` (device id), `spamle-leagues`, `spamle-yest` (yesterday's popular answers),
`spamle-edits` (the schedule). Ids are redacted in the fixtures. Signed out, without a leaderboard name, the score
is not submitted to the board; each finished round is logged (`/rpc/log_round`, `network/log-round.json`).

UNVERIFIED: a player with a leaderboard name or account who played on another device gets that day's rounds copied
in with `?0`-style keys and no `live` flag. Such a day is not logged on the second device; the first one logs it.
"#1 TODAY" and "FIRST TO FINISH" are from the page code, not captured.

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
