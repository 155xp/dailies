import "@fontsource/schibsted-grotesk/latin-400.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import fixtures from "virtual:card-fixtures";
import type { DailyRecord } from "../../src/record";
import { CARDS } from "./cards";
import { GAMES } from "./games";

/** Tests may hand the preview other records through `window.__CARDS__`; by default it draws the fixtures. */
interface Preview {
  records: DailyRecord[];
  history?: DailyRecord[];
}
const injected = (window as unknown as { __CARDS__?: Preview }).__CARDS__;
const { records, history = records } = injected ?? { records: fixtures };

/** Every game's card, drawn from the real fixture records through the real parsers. */
function CardsPreview() {
  return (
    <main className="page" data-status="ready">
      <header className="head">
        <div>
          <h1 className="title">Cards</h1>
          <p className="meta">Each game's result card, drawn from its captured fixture</p>
        </div>
      </header>
      <div className="cards">
        {GAMES.flatMap((g) =>
          records
            .filter((r) => r.game === g.id)
            .map((r) => {
              const Card = CARDS[r.game];
              return <Card key={`${r.game}:${r.date}`} record={r} history={history.filter((h) => h.game === r.game)} />;
            }),
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CardsPreview />
  </StrictMode>,
);
