# Capture check

The design research for each game marked some claims UNVERIFIED: key names, selectors, colors and where the
result is saved. This table resolves each one against a real finished game captured in `fixtures/`. A row is
CONFIRMED when a fixture shows the claim, CORRECTED when a fixture shows something else, and stays UNVERIFIED
when no fixture can show it yet.

Emoji are written by name. Exact share text is in each case's `share.txt`.

## UNVERIFIED items

| # | Game | Spec claim | Result | Value from the fixtures | Source |
|---|---|---|---|---|---|
| 1 | Krillion | Colorblind override palette (`:root.colorblind`) values | CONFIRMED | plankton #d7e1f2, tooclever #ffb35c, schooler #7deaff, rare #ff7bac, deepcut #bfa7ff, krillion #ffe08a, miss #a3b6d6 | `fixtures/krillion/win-2026-11-22/dom-colors.json` (`cssTierVars[":root.colorblind"]`) |
| 2 | Krillion | `POST /api/today/complete` returns `betterThan` and `dist` | CONFIRMED | `{sample, betterThan, dist}` with 20 buckets; `sample` equals the sum of `dist` | `fixtures/krillion/*/network/today-complete.json` |
| 3 | Travle | Today's world game is stored under `travle-game-state` | CONFIRMED | `travle-game-state` holds `puzzleIx, hash, pastGuessIds, guessRatings, gameProgress, hintsData, hardMode, perfect, gameSummary`; history is in `travle-past-games` | `fixtures/travle/*/storage.json` |
| 4 | Travle | In-page hex color per guess rating | CORRECTED | No CSS color per rating. The results screen renders the rating emoji themselves (`emoji-row`). Map fills show connection to the start country, not the rating: start #d3869b, target #7daea3, connected #ddc7a1, disconnected #504a45. Cards use the four rating roles. | `fixtures/travle/win-2026-11-22/dom.html`, `fixtures/travle/win-2026-11-22/colors.json` |
| 5 | Travle | Percentile: none found, treat as no | CORRECTED | Yes. The result chart shows "Top 95%" (win) and "Top 100%" (loss). The raw distribution is `GET https://auth.teuteuf.fr/travle/scores/travle:<id>` with 14 counts; the parser reproduces both figures. | `fixtures/travle/*/dom.html`, `fixtures/travle/*/network/scores-get-last.json` |
| 6 | enclose.horse | Board tile colors; `#186b3b` is probably the grass | CORRECTED | `#186b3b` is the page background (`--grass-bg`). Sampled canvas pixels: grass #1b6b3a, water #062f48, player wall #777474, enclosed area #b1852a / #cda857, horse #ffffff. Tiles are sprites, so these are dominant shades. | `fixtures/enclose-horse/win-2026-11-22/colors.json` |
| 7 | enclose.horse | Exact submit endpoint path | CONFIRMED | `POST https://api.enclose.horse/api/levels/<levelId>/submit`, body `{walls, isEasy?}`; response `{score, wallsUsed, rank, percentile, stats: {histogram, optimalScore, optimalWalls, ...}}` | `fixtures/enclose-horse/*/network/submit.json` |
| 8 | Connections | Stored under `games-state-connections-collection/{regiId or ANON}` | CORRECTED | Signed out: `games-state-connections/ANON`. The `-collection` key was not written. | `fixtures/connections/*/storage.json` |
| 9 | Connections | Guesses hold `correct` and `solvedLevel` | CORRECTED | `data = {puzzleComplete, puzzleWon, mistakes, guesses: [{cards: [{position, level}], correct}], solvedCategories: [{cards, level, orderSolved}], isPlayingArchive}`. There is no `solvedLevel`; each card carries its true `level`. | `fixtures/connections/*/storage.json` |
| 10 | Spelling Bee | No text share exists | CONFIRMED up to Solid | Signed out, no share control appears at Good Start or Solid, and the clipboard and share hooks recorded nothing. | `fixtures/spelling-bee/*/dom.html`, `fixtures/spelling-bee/*/meta.json` |
| 11 | Spelling Bee | No text share exists (Genius and above) | UNVERIFIED | Signed-out play stops at Solid behind "Subscribe to keep playing". | `fixtures/spelling-bee/partial-paywall-2026-11-22/dom.html` |
| 12 | Spelling Bee | localStorage key for found words | CONFIRMED | `games-state-spelling_bee/ANON`, `data = {answers, rank, isRevealed, isPlayingArchive}`. Points are not stored. | `fixtures/spelling-bee/*/storage.json` |
| 13 | Mini | Time and solved fields in saved state | UNVERIFIED | Signed out the board never loads ("Subscribe to play the Mini.") and nothing is saved. | `fixtures/mini/*/dom.html`, `fixtures/mini/*/storage.json` |
| 14 | Globle | Exact map fill hex stops | CONFIRMED per guess | Computed in page by the game's own color function, Default palette, light theme: 0 km rgb(127, 0, 0), 217 km rgb(175, 7, 5), 1,300 km rgb(223, 67, 46), 2,465 km rgb(241, 110, 74), 4,040 km rgb(251, 149, 98), 6,313 km rgb(253, 190, 135), 10,890 km rgb(254, 228, 192); the answer is `green` | `fixtures/globle/*/colors.json` |
| 15 | Songless | Exact attempt colors | CONFIRMED | correct rgb(85, 183, 37), present rgb(218, 195, 22), incorrect rgb(198, 33, 33), skipped rgb(48, 52, 54), unused row rgb(22, 24, 25) | `fixtures/songless/*/dom-colors.json` |

## Other claims the fixtures contradict

| Game | Spec claim | Value from the fixtures | Source |
|---|---|---|---|
| Krillion | Share text may end with a `https://krillion.io` line | No URL in either the copied or the shared text | `fixtures/krillion/*/share.txt`, `fixtures/krillion/*/share-calls.json` |
| Krillion | `history[date] = {runId, results[7]}` | `{runId, dayNumber, score, tiers[7], results[7]}`; a blank timeout has `rawAnswer: null` | `fixtures/krillion/*/storage.json` |
| Krillion | `krillion:game:v1` has `phase: "done"` at the end | The key is gone after the dive ends; it exists only mid-dive | `fixtures/krillion/win-2026-11-22/storage-midgame.json`, `.../storage.json` |
| Krillion | Answer popularity can be fetched for the day | Confirmed, and a share is count divided by the prompt's total; full responses kept | `fixtures/krillion/*/network/answer-popularity.json` |
| Travle | Share text forms | Win `#travle #1439 +3`; loss `#travle #1439 (3 away) (1 hint)` | `fixtures/travle/*/share.txt` |
| enclose.horse | Share line 1 is `https://enclose.horse/ Day N` | No trailing slash: `https://enclose.horse Day 328`. With the bonus done, the main line gains a horse and a bonus line ends with a balance scale. | `fixtures/enclose-horse/*/share.txt`, `.../share-with-bonus.txt` |
| enclose.horse | A 100-bucket score distribution | The response histogram has one bucket per score present (46 here), including a `-1` bucket | `fixtures/enclose-horse/win-2026-11-22/network/submit.json` |
| Wordle | Distribution: personal | Signed out there is none; the stats modal is a sign-up wall | `fixtures/wordle/win-2026-11-22/dom.html` |
| Wordle | Puzzle number | Storage id 4823, public number `days_since_launch` 1982 | `fixtures/wordle/*/network/puzzle-2026-11-22.json` |
| Connections | Puzzle number | API and storage id 1370, but the page and share text say #1260 | `fixtures/connections/*/share.txt` |
| Mini | `games-state-{key}-collection/{regiId or ANON}` pattern | Signed out no game state key is written at all | `fixtures/mini/*/storage.json` |
| Globle | A win is `lastWin === today` | `lastWin` is a UTC date-time string; a win is `statistics.lastWinPuzzleDate === guesses.day` | `fixtures/globle/win-2026-11-22/storage.json` |
| Songless | Result lives in server sessions; no useful localStorage | The full result is in IndexedDB `game-store`, store `sessions`, key `[challengeDate, game, categoryId]`, with `state` (`won`, `lost`), `gameData.board` and `gameData.answer`. localStorage holds settings only. | `fixtures/songless/*/storage.json` |
| Songless | A `percentile` 1 to 99 per category | `/songless/stats` returns only relative weights (`daily.distribution`, points 1 to 6). The modal's "top 19.1% today" is the cumulative weight share. | `fixtures/songless/*/network/stats.json`, `fixtures/songless/win-2026-11-22/dom.html` |
| Songless | Clip steps 0.13, 0.53, 2, 8, 15 s | 0.1, 0.5, 2, 8, 15 s | `fixtures/songless/*/dom-colors.json` (`clipLabel`) |
| Songless | Share lists every category | Playing one tab shares one line: `I found the Top Hits song in 8 seconds` and a face, `[Songless #451]`, the squares, then the link | `fixtures/songless/*/share.txt` |
| Spamle | Share line 2 starts with a domino | It starts with a candy: `Spamle #13`, then candy `53 gumballs · 146 pts · TOP 5%` | `fixtures/spamle/win-2026-11-23/share.txt` |
| Spamle | Puzzle number is days since 2026-11-11 | Days since, plus one: 2026-11-23 is #13 | `fixtures/spamle/*/meta.json`, `win-2026-11-23/share.txt` |
| Spamle | A 7 s answer clock | Shown as 7 s; the page's clock is 8 s with the last 2 shown seconds slowed to 3 (page code, `ROUND_MS`) | `docs/games.md` |
| Spamle | Round ratings ok, good, great, top | Those are the targets; ratings are Warm-up, Not bad, Good, Great, Spamtastic | `fixtures/spamle/*/page.json`, `win-2026-11-23/dom.html` |
| Spamle | Rarity drops once 10+ real players name an answer | On spamle.com that table stays empty, so rarity is by list position; stored points are used | `docs/games.md` |
| Spamle | A finished-day percentile may come from the network | Confirmed: `POST /rest/v1/rpc/day_totals`; the parser reproduces TOP 5% | `fixtures/spamle/win-2026-11-23/network/day-totals.json` |
| Songle | Owner confirmation pending | lessgames has no Songle (`/songle` is 404); Songless is tracked | `docs/games.md` |
