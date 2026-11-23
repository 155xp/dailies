# Dailies extension

A Manifest V3 extension that logs a result when you finish one of the 10 daily games, with no clicks. Results
stay in `chrome.storage.local` in your browser.

## Build and install

```sh
pnpm install
DAILIES_DASHBOARD_ORIGINS=https://dailies.enci.dev pnpm build:ext  # extension/dist/ (unpacked) and extension/dailies-extension.zip
```

Open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and pick `extension/dist`.
Production builds require `DAILIES_DASHBOARD_ORIGINS` (comma-separated bare origins) and fail if it is
missing or contains loopback. CI builds the served zip for `https://dailies.enci.dev` with `DAILIES_DEV`
disabled. For another hosted dashboard, set its origin explicitly.

For local dashboard work on port **5173**, build a dev zip explicitly:

```sh
DAILIES_DEV=1 pnpm build:ext
pnpm dev:site --host localhost --port 5173 --strictPort
```

Load `extension/dist` as above. This dev build allows `http://localhost:5173` and `http://127.0.0.1:5173`;
the bridge checks the exact origin including its port. To use another local port, include its bare origin
in `DAILIES_DASHBOARD_ORIGINS` alongside `DAILIES_DEV=1`. Never use a dev zip for production.

## When code runs

Content scripts are matched only to the 10 game pages (`src/games.ts`) and the dashboard origins. On a game page:

- `hook.js` (page world, `document_start`) wraps `Storage.prototype.setItem`, `fetch`, `XMLHttpRequest` and, for Wordle and
  Connections, the clipboard and share sheet. It posts one message when the game writes one of its own result
  keys, receives an allowlisted response, or shares. Nothing else is touched. Spamle saves only ids, so on a Spamle
  page the hook also reads the day's prompt text, answer names and round targets from the page's own memory with each
  of those messages and once at `load` (`src/spamle-page.ts`).
- `content.js` reads once at page load, and again on each hook message. Spelling Bee also has one
  `MutationObserver` on its rank label, disconnected on `pagehide`.
- "Played, not logged": when a game's result screen is on the page and no record exists, one `setTimeout`
  of 2s starts. It is never repeated or re-armed, and it is cleared on capture and on `pagehide`. If it
  fires with still no record, the popup shows the game as played but not logged, with a Retry.
- The service worker wakes only on a message from a game page, writes storage, sets the badge, and stops.

There is no `setInterval`, no `chrome.alarms`, no `webRequest`, no polling and no keep-alive. The build is
checked for these in `test/extension/bundle.test.ts` and in CI.

## Tests

```sh
pnpm test               # unit tests, including test/extension
pnpm test:ext           # Playwright: fixture replays per game, idle CPU, popup visual guards
```
