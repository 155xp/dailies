import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { DailyRecord } from "../../../src/record";
import { gameById, type GameId } from "../games";
import "./cards.css";

export type CardProps = { record: DailyRecord; history: DailyRecord[] };

/** The shared frame: the title links to the game, then the card's own drawing, figure and chart. */
export function Card({ game, children }: { game: GameId; children: ReactNode }) {
  const g = gameById(game);
  return (
    <article className="card" data-panel data-game={game}>
      <h3 className="card-title">
        <a className="link" href={g.url} target="_blank" rel="noopener">
          {g.name}
          <HugeiconsIcon icon={LinkSquare02Icon} size={16} aria-hidden />
        </a>
      </h3>
      {children}
    </article>
  );
}

/** The card's one key figure, with an optional label set on its baseline. */
export function Figure({ game, value, label }: { game: GameId; value: string; label?: ReactNode }) {
  return (
    <div className="fig" data-figure data-value={`${game} figure ${value}`}>
      <p className="figure">
        {/* Tabular digits, but the face's tabular colon and separators are too wide: set them proportional. */}
        {value.split(/([:.,])/).map((part, i) => (i % 2 ? <span key={i} className="punct">{part}</span> : part))}
      </p>
      {label !== undefined && " "}
      {label !== undefined && <div className="figure-label">{label}</div>}
    </div>
  );
}

export const Caption = ({ children }: { children: string }) => (
  <p className="meta caption" data-caption>
    {children}
  </p>
);

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};

/** Black or white, whichever reads better on a game color (WCAG contrast). */
export const inkOn = (hex: string) => (lum(hex) > 0.179 ? "#000" : "#fff");

export const fmt = (n: number) => n.toLocaleString("en-US");
export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export interface Bar {
  label: string;
  value: number;
  /** Height when it differs from the value (a smoothed curve); the readout always uses the value. */
  height?: number | undefined;
  color?: string | undefined;
}

interface BarsProps {
  bars: Bar[];
  /** The player's bar: marked, and where the scrub starts; -1 for none. */
  own: number;
  /** Bar color unless a bar sets its own. */
  rest?: string;
  ownColor: string;
  readout: (bar: Bar) => string;
  label: string;
  /** A 2px rule at this fraction of the width, in place of a marked bar. */
  rule?: number;
}

/** A bar chart that paints whole on the first frame and scrubs by pointer and arrow keys. */
export function Bars({ bars, own, rest = "var(--bar)", ownColor, readout, label, rule }: BarsProps) {
  const [active, setActive] = useState(Math.max(0, own));
  const max = Math.max(...bars.map((b) => b.height ?? b.value), 1e-9);
  const last = bars.length - 1;
  const move = (i: number) => setActive(Math.min(last, Math.max(0, i)));
  const keys: Record<string, () => void> = {
    ArrowLeft: () => move(active - 1),
    ArrowDown: () => move(active - 1),
    ArrowRight: () => move(active + 1),
    ArrowUp: () => move(active + 1),
    Home: () => move(0),
    End: () => move(last),
  };
  const onKey = (e: KeyboardEvent) => {
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    k();
  };
  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    move(Math.floor(((e.clientX - r.left) / r.width) * bars.length));
  };
  const text = readout(bars[active]!);
  return (
    <div className="chart">
      <div
        className="plot"
        data-chart
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active}
        aria-valuetext={text}
        onKeyDown={onKey}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        <div className="bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: bars.length > 24 ? 1 : 4 }}>
          {bars.map((b, i) => (
            <div className="slot" key={i}>
              <div
                data-bar
                data-own={rule === undefined && i === own ? "" : undefined}
                data-active={i === active ? "" : undefined}
                style={{ height: `${((b.height ?? b.value) / max) * 100}%`, background: rule === undefined && i === own ? ownColor : (b.color ?? rest) }}
              />
            </div>
          ))}
          {rule !== undefined && <div className="rule" data-rule style={{ left: `calc(${Math.min(1, Math.max(0, rule)) * 100}% - 1px)` }} />}
        </div>
      </div>
      <p className="meta readout" data-readout aria-hidden>
        {text}
      </p>
    </div>
  );
}
