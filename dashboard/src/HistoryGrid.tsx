import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import type { Log } from "./App";
import { GAMES, type Game } from "./games";
import { dayHref } from "./day";
import { dayDate, lastDays, longDay, streaks } from "./history";
import { result } from "./summary";

const DAYS = 30;
const shortDay = (day: string) => dayDate(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

interface Cell {
  day: string;
  played: boolean;
  text: string;
  color?: string;
}

function cells(game: Game, log: Log, days: string[]): Cell[] {
  const records = log.records.get(game.id) ?? [];
  const misses = log.misses.get(game.id) ?? [];
  return days.map((day) => {
    const r = records.find((x) => x.date === day);
    if (r) return { day, played: true, text: result(r), color: game.color };
    if (misses.some((m) => m.date === day)) return { day, played: true, text: "Played, not logged" };
    return { day, played: false, text: "Not played" };
  });
}

/** Every day a game was played, logged or not. */
const playedDays = (game: Game, log: Log) => [...(log.records.get(game.id) ?? []).map((r) => r.date), ...(log.misses.get(game.id) ?? []).map((m) => m.date)];

/** A plain click opens the day here; a modified click keeps the browser's own (new tab, new window). */
const opener = (onOpen: (day: string) => void, day: string, then?: () => void) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  then?.();
  onOpen(day);
};

interface Props {
  log: Log;
  today: string;
  /** The day the Today section shows; its column is the one outlined. */
  day: string;
  onOpen: (day: string) => void;
}

export function History({ log, today, day, onOpen }: Props) {
  const days = lastDays(today, DAYS);
  const overall = streaks(GAMES.flatMap((g) => playedDays(g, log)), today);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [openGame, setOpenGame] = useState<Game["id"] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // On a phone the newest days come first into view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const show = (text: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120);
    setTip({ text, x, y: r.top - 8 });
  };
  const hide = () => setTip(null);
  const opened = GAMES.find((g) => g.id === openGame);

  return (
    <section className="history">
      <div className="section-head">
        <h2 className="section-title">History</h2>
        <div className="figures">
          <Figure label="Current streak, all games" value={overall.current} />
          <Figure label="Best streak, all games" value={overall.best} />
        </div>
      </div>
      <div className="hist-card" data-panel>
        <div className="hist-scroll" data-scroll-x ref={scroller} onScroll={hide}>
          <div className="hist-rows" data-chart>
            {GAMES.map((g) => {
              const row = cells(g, log, days);
              return (
                <div className="hist-row" key={g.id} data-history-row={g.id}>
                  <button
                    type="button"
                    className="hist-label"
                    aria-expanded={openGame === g.id}
                    aria-controls="history-days"
                    onClick={() => setOpenGame(openGame === g.id ? null : g.id)}
                  >
                    {g.name}
                  </button>
                  <div className="sqs">
                    {row.map((c) => (
                      <a
                        key={c.day}
                        className="sq"
                        href={dayHref(c.day, today)}
                        aria-label={`${g.name}, ${longDay(c.day)}, ${c.played ? c.text : "not played"}`}
                        aria-current={c.day === day ? "date" : undefined}
                        tabIndex={c.played ? 0 : -1}
                        data-played={c.played || undefined}
                        data-missed={(c.played && !c.color) || undefined}
                        data-today={c.day === today || undefined}
                        data-selected={c.day === day || undefined}
                        style={c.color ? ({ "--sq": c.color } as CSSProperties) : undefined}
                        onClick={opener(onOpen, c.day, hide)}
                        onMouseEnter={show(`${shortDay(c.day)} · ${c.text}`)}
                        onMouseLeave={hide}
                        onFocus={show(`${shortDay(c.day)} · ${c.text}`)}
                        onBlur={hide}
                      />
                    ))}
                  </div>
                  <span className="streak meta">Streak {streaks(playedDays(g, log), today).current}</span>
                </div>
              );
            })}
          </div>
        </div>
        {opened && <Days game={opened} cells={cells(opened, log, days)} today={today} day={day} onOpen={onOpen} />}
      </div>
      {tip && (
        <div className="tip meta" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="fig" data-value={`${label} ${value}`}>
      <span className="num">{value}</span>
      <span className="meta">{label}</span>
    </div>
  );
}

/** A game's last 30 days as plain text: what a tap opens, so nothing depends on hover. */
function Days({ game, cells, today, day, onOpen }: { game: Game; cells: Cell[]; today: string; day: string; onOpen: (day: string) => void }) {
  const played = cells.filter((c) => c.played).reverse();
  return (
    <div className="days" id="history-days">
      <h3>{game.name}, last 30 days</h3>
      <p className="meta">
        Played {played.length} of {cells.length} days
      </p>
      <ul>
        {played.map((c) => (
          <li key={c.day}>
            <a className="day-link" href={dayHref(c.day, today)} aria-current={c.day === day ? "date" : undefined} onClick={opener(onOpen, c.day)}>
              <span className="quiet">{longDay(c.day)}</span>
              <span>{c.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
