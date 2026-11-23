import { GAMES } from "./games";

/** Shell: title, date and the fixed list of game links. Statuses arrive with the bridge. */
export function App() {
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <main className="page">
      <header className="head">
        <div>
          <h1 className="title">Today</h1>
          <p className="meta">{date}</p>
        </div>
      </header>
      <ul className="rows">
        {GAMES.map((g) => (
          <li className="row" key={g.id} data-game={g.id}>
            <a className="link" href={g.url} target="_blank" rel="noopener">
              {g.name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
