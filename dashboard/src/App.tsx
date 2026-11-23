import { LinkSquare02Icon, Plug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { DailyRecord } from "../../src/record";
import { useExtension, type ExtensionState, type Miss } from "./bridge";
import { CARDS } from "./cards";
import { GAMES, type Game } from "./games";
import { History } from "./HistoryGrid";
import { Install } from "./Install";
import { localDay, longDay } from "./history";
import { result, tiles } from "./summary";

/** Everything logged so far, grouped by game, oldest first. */
export interface Log {
  records: Map<Game["id"], DailyRecord[]>;
  misses: Map<Game["id"], Miss[]>;
}

function group(state: ExtensionState): Log {
  const records = new Map<Game["id"], DailyRecord[]>();
  const misses = new Map<Game["id"], Miss[]>();
  for (const r of [...state.records].sort((a, b) => a.date.localeCompare(b.date))) records.set(r.game, [...(records.get(r.game) ?? []), r]);
  for (const m of state.misses) misses.set(m.game as Game["id"], [...(misses.get(m.game as Game["id"]) ?? []), m]);
  return { records, misses };
}

export function App() {
  const ext = useExtension();
  const today = localDay(new Date());
  const log = useMemo(() => group(ext), [ext]);
  const connected = ext.status === "connected";

  return (
    <main className="page" data-status={ext.status} aria-busy={ext.status === "loading"}>
      <header className="head">
        <div>
          <h1 className="title">Today</h1>
          <p className="meta">{longDay(today)}</p>
        </div>
        <Pill status={ext.status} lastLogAt={ext.lastLogAt} today={today} onClick={ext.request} />
        <p className="meta local">Results stay in this browser only, with no sign-in and no upload.</p>
      </header>

      <ul className="rows">
        {GAMES.map((g) => (
          <Row key={g.id} game={g} status={ext.status} today={today} log={log} />
        ))}
      </ul>

      {ext.status === "loading" && <div className="history-skel skel" aria-hidden="true" />}
      {connected && <History log={log} today={today} />}
      {ext.status === "missing" && <Install check={ext.request} checking={ext.waiting} />}
      {ext.status === "error" && (
        <section className="notice" data-panel>
          <p>Couldn't read today's results</p>
          <p className="quiet">The extension answered, but this page could not read what it sent. Updating the extension usually fixes it.</p>
          <button type="button" className="secondary" onClick={ext.request} disabled={ext.waiting}>
            {ext.waiting ? "Trying…" : "Try again"}
          </button>
        </section>
      )}
    </main>
  );
}

function Pill({ status, lastLogAt, today, onClick }: { status: string; lastLogAt: string | null; today: string; onClick: () => void }) {
  if (status === "loading") return <span className="pill skel" aria-hidden="true" />;
  let text = "Extension not found";
  let last = "";
  if (status !== "missing") {
    text = "Extension connected";
    if (lastLogAt) {
      const at = new Date(lastLogAt);
      const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const day = localDay(at) === today ? "" : `${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, `;
      text += " ·";
      last = `last log ${day}${time}`;
    }
  }
  return (
    <button type="button" className="pill meta" onClick={onClick} title="Check the extension again">
      <HugeiconsIcon icon={Plug01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>
        <span className="nowrap">{text}</span>
        {last && (
          <>
            {" "}
            <span className="nowrap">{last}</span>
          </>
        )}
      </span>
    </button>
  );
}

function Row({ game, status, today, log }: { game: Game; status: string; today: string; log: Log }) {
  const [open, setOpen] = useState(false);
  const history = log.records.get(game.id) ?? [];
  const record = history.find((r) => r.date === today);
  const miss = (log.misses.get(game.id) ?? []).find((m) => m.date === today);
  const Card = CARDS[game.id];
  const slot = `card-${game.id}`;

  return (
    <li className="row" data-game={game.id}>
      <div className="line">
        <a className="link name" href={game.url} target="_blank" rel="noopener">
          {game.name}
          <HugeiconsIcon icon={LinkSquare02Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
        </a>
        {status === "loading" && <span className="skel status-skel" />}
        {status === "connected" && record && (
          <>
            <span className="status">Played</span>
            <span className="strip" data-tiles role="img" aria-label={`${game.name} tiles, ${result(record)}`}>
              {tiles(record).map((color, i) => (
                <span key={i} className="tile" style={{ background: color }} />
              ))}
            </span>
            <span className="result">{result(record)}</span>
            <button type="button" className="disclosure" aria-expanded={open} aria-controls={slot} onClick={() => setOpen(!open)}>
              Details
            </button>
          </>
        )}
        {status === "connected" && !record && miss && (
          <>
            <span className="status missed">Played, not logged</span>
            <span className="reason meta">{miss.reason}</span>
          </>
        )}
        {status === "connected" && !record && !miss && <span className="status idle">Not played yet</span>}
      </div>
      {open && record && (
        <div className="card-slot" id={slot}>
          <Card record={record} history={history} />
        </div>
      )}
    </li>
  );
}
