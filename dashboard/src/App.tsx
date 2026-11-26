import { LinkSquare02Icon, Plug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DailyRecord } from "../../src/record";
import { useExtension, type ExtensionState, type Miss } from "./bridge";
import { CARDS } from "./cards";
import { dayMeta, dayTitle, useDay } from "./day";
import { DayNav } from "./DayNav";
import { GAMES, type Game } from "./games";
import { History } from "./HistoryGrid";
import { Install } from "./Install";
import { localDay } from "./history";
import { PaletteSetting } from "./palette";
import { usePresence } from "./presence";
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
  const install = usePresence(ext.status === "missing");
  const hint = usePresence(connected && !ext.records.some((r) => r.date === today));
  const { day, go, step } = useDay(today);
  const heading = useRef<HTMLHeadingElement>(null);
  // A day picked in History opens above it: bring the day into view and put focus on its title.
  const openDay = useCallback(
    (picked: string) => {
      go(picked, "push");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      heading.current?.focus({ preventScroll: true });
      heading.current?.closest("section")?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    },
    [go],
  );

  return (
    <main className="page" data-status={ext.status} aria-busy={ext.status === "loading"}>
      <header className="head">
        <h1 className="title">Dailies</h1>
        <Pill status={ext.status} lastLogAt={ext.lastLogAt} today={today} onClick={ext.request} />
        <p className="what quiet">Logs your daily word and map games from their own sites, in this browser only, with no sign-in and no upload.</p>
      </header>

      {install.mounted && <Install check={ext.request} checking={ext.waiting} leaving={install.leaving} />}

      <section className="today" aria-labelledby="today-title">
        <div className="today-head">
          <div aria-live="polite">
            <h2 className="section-title" id="today-title" ref={heading} tabIndex={-1}>
              {dayTitle(day, today)}
            </h2>
            <p className="meta">{dayMeta(day, today)}</p>
          </div>
          {ext.status !== "missing" && <DayNav day={day} today={today} step={step} go={go} />}
        </div>
        {day === today && hint.mounted && (
          <p className="hint quiet enter" data-leaving={hint.leaving || undefined}>
            Play any game below. Your result shows up here when you finish.
          </p>
        )}
        <ul className="rows">
          {GAMES.map((g) => (
            <Row key={g.id} game={g} status={ext.status} day={day} today={today} log={log} />
          ))}
        </ul>
      </section>

      {ext.status === "loading" && <div className="history-skel skel" aria-hidden="true" />}
      {connected && <History log={log} today={today} day={day} onOpen={openDay} />}
      {ext.status === "error" && (
        <section className="notice" data-panel>
          <p>Couldn't read today's results</p>
          <p className="quiet">The extension answered, but this page could not read what it sent. Updating the extension usually fixes it.</p>
          <button type="button" className="secondary" onClick={ext.request} disabled={ext.waiting}>
            {ext.waiting ? "Trying…" : "Try again"}
          </button>
        </section>
      )}
      {connected && <PaletteSetting />}
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

function Row({ game, status, day, today, log }: { game: Game; status: string; day: string; today: string; log: Log }) {
  const [open, setOpen] = useState(false);
  // A past day's card reads its history as it stood that day.
  const history = (log.records.get(game.id) ?? []).filter((r) => r.date <= day);
  const record = history.find((r) => r.date === day);
  const miss = (log.misses.get(game.id) ?? []).find((m) => m.date === day);
  const Card = CARDS[game.id];
  const slot = `card-${game.id}`;
  // A played row opens from a click anywhere but its link and button; the Details button stays its one keyboard control.
  const onLine = (e: MouseEvent) => !(e.target as Element).closest("a, button") && setOpen(!open);

  return (
    <li className="row" data-game={game.id}>
      {/* The hit box takes the click and never transforms; only the line inside it scales on press, so a held press
          near an edge is still released on the row. */}
      <div className="hit" onClick={status === "connected" && record ? onLine : undefined}>
        <div className="line">
          <a className="link name" href={game.url} target="_blank" rel="noopener">
            {game.name}
            <HugeiconsIcon icon={LinkSquare02Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          </a>
          {status === "loading" && <span className="skel status-skel" />}
          {status === "connected" && record && (
            <>
              <span className="status">Played</span>
              {/* An unfinished Globle has no distances yet, so no tiles: leave the strip out rather than draw it empty. */}
              {tiles(record).length > 0 && (
                <span className="strip" data-tiles role="img" aria-label={`${game.name} tiles, ${result(record)}`}>
                  {tiles(record).map((color, i) => (
                    <span key={i} className="tile" style={{ background: color }} />
                  ))}
                </span>
              )}
              <span className="result">{result(record)}</span>
              <button type="button" className="disclosure" aria-expanded={open} aria-controls={open ? slot : undefined} onClick={() => setOpen(!open)}>
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
          {status === "connected" && !record && !miss && <span className="status idle">{day === today ? "Not played yet" : "Not played"}</span>}
        </div>
      </div>
      {open && record && (
        <div className="card-slot" id={slot}>
          {/* Keyed by day, so a chart's scrub starts over on each day's own result. */}
          <Card key={record.date} record={record} history={history} />
        </div>
      )}
    </li>
  );
}
