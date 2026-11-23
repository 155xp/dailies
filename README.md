<img src="assets/icon.svg" width="64" height="64" alt="">

# dailies

A browser extension and local dashboard that tracks your daily web games.

Results are read on each game's own site, from what the game itself saves (its share text, its local storage,
or its own network responses), and kept only in your browser. There are no accounts and no server.

## Install

Dailies works in Chrome and the browsers built on it, such as Edge, Brave and Helium. Open the dashboard and
choose Download the extension (or take `dailies-extension.zip` from the latest CI run), then unzip it into a
folder you will keep. Open `chrome://extensions`, turn on Developer mode at the top right, choose Load unpacked
and pick the unzipped folder. Go back to the dashboard: it finds the extension on its own and shows today's games.
Results stay in that browser profile only, so each person, and each profile, keeps a separate history.

## Games

Krillion, Travle, enclose.horse, Wordle, Connections, Spelling Bee, Mini Crossword, Globle and Songless.
See [docs/games.md](docs/games.md) for what each game records and where.

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

`fixtures/<game>/<case>/` holds real results captured from each live game, with a `meta.json` naming the source
URL and capture date. Parsers in `src/parsers/` are tested against them.

## License

MIT
