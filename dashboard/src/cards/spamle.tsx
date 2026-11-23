import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SPAMLE_RARITIES, SPAMLE_RATINGS, SPAMLE_ROUNDS } from "../../../src/parsers/spamle";
import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, plural, type CardProps } from "./frame";
import "./spamle.css";

type Detail = RecordOf<"spamle">["detail"];
type Answer = Detail["rounds"][number]["answers"][number];

/**
 * A gumball drawn as pixel art in 2px cells, one cell wider for each rarity step (10px Common to 18px Legendary),
 * so size tells rarity apart as well as color. Each layer is one path: outline, body, a shaded crescent, a shine.
 */
const CELL = 2;
function sprite(d: number) {
  const c = d / 2;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < d && y < d && (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= c * c + 0.3;
  const s = Math.max(1, Math.floor(d * 0.25));
  const layers = { ring: "", body: "", shade: "", shine: "" };
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      if (!inside(x, y)) continue;
      const ring = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      const shine = y === s && (x === s || (d >= 8 && x === s + 1));
      const layer = ring ? "ring" : shine ? "shine" : x + 0.5 - c + (y + 0.5 - c) >= d * 0.3 ? "shade" : "body";
      layers[layer] += `M${x * CELL} ${y * CELL}h${CELL}v${CELL}h-${CELL}z`;
    }
  }
  return { px: d * CELL, ...layers };
}
const SPRITES = [5, 6, 7, 8, 9].map(sprite);

function Ball({ points, active }: { points: number; active?: boolean }) {
  const s = SPRITES[points - 1]!;
  return (
    <svg
      className="spam-ball"
      data-ball
      data-rarity={SPAMLE_RARITIES[points - 1]!.id}
      data-active={active ? "" : undefined}
      width={s.px}
      height={s.px}
      viewBox={`0 0 ${s.px} ${s.px}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <path className="ring" d={s.ring} />
      <path className="body" d={s.body} />
      <path className="shade" d={s.shade} />
      <path className="shine" d={s.shine} />
    </svg>
  );
}

const rarityName = (points: number) => SPAMLE_RARITIES[points - 1]!.name;
const ratingOf = (id: string | null) => SPAMLE_RATINGS.find((r) => r.id === id) ?? null;

/** The day's gumballs by rarity: the key to the colors and sizes, and the rarity breakdown in one line. */
function Legend({ rarities }: { rarities: number[] }) {
  return (
    <ul className="spam-legend" aria-label="Gumballs by rarity">
      {rarities.map((n, i) => (
        <li key={i} data-legend={SPAMLE_RARITIES[i]!.id} data-zero={n ? undefined : ""}>
          <Ball points={i + 1} />
          <span className="spam-count">{fmt(n)}</span>
          <span className="meta">{SPAMLE_RARITIES[i]!.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every round as a row of the gumballs it dropped. Pointer and arrow keys step through the answers; the line under
 * the rows reads the one in hand. It starts on the day's rarest pull.
 */
function Tray({ detail, partial }: { detail: Detail; partial: boolean }) {
  const all = useMemo(() => detail.rounds.flatMap((r, ri) => r.answers.map((a, ai) => ({ a, ri, ai }))), [detail]);
  const best = all.reduce((b, x, i) => (x.a.points > (all[b]?.a.points ?? 0) ? i : b), 0);
  const [active, setActive] = useState(best);
  const readout = useId();
  const at = all[active];
  const last = all.length - 1;
  const move = (i: number) => setActive(Math.min(last, Math.max(0, i)));
  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in step) move(active + step[e.key]!);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else return;
    e.preventDefault();
  };
  const onPointer = (e: PointerEvent) => {
    const ball = (e.target as Element).closest?.("[data-index]");
    if (ball) move(Number(ball.getAttribute("data-index")));
  };
  const label = (round: number, a: Answer) => {
    const r = detail.rounds[round]!;
    return `${r.prompt ?? `Round ${round + 1}`}: ${a.answer}, ${rarityName(a.points)}, +${a.points}`;
  };
  let index = 0;
  return (
    <div className="spam-tray-wrap">
      <div
        className="spam-tray"
        data-tray
        role="group"
        tabIndex={all.length ? 0 : -1}
        aria-label="Answers, round by round. Arrow keys step through them."
        aria-describedby={readout}
        onKeyDown={onKey}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        <ol className="spam-rounds">
          {detail.rounds.map((r, ri) => {
            const rating = ratingOf(r.rating);
            return (
              <li key={ri} data-round={ri + 1}>
                <div className="spam-head">
                  <p className="meta spam-q">{r.prompt ?? `Round ${ri + 1}`}</p>
                  <p className="spam-score">
                    {rating && (
                      <span className="meta spam-rating" data-rating={rating.id}>
                        <i style={{ background: rating.color }} aria-hidden />
                        {rating.name}
                      </span>
                    )}
                    <span className="spam-pts">{plural(r.points, "pt", "pts")}</span>
                  </p>
                </div>
                <div className="spam-balls" data-tiles role="img" aria-label={r.answers.length ? r.answers.map((a) => `${a.answer}, ${rarityName(a.points)}`).join("; ") : "No answers"}>
                  {r.answers.map((a, ai) => {
                    const i = index++;
                    return (
                      <span key={ai} className="spam-slot" data-index={i}>
                        <Ball points={a.points} active={i === active} />
                      </span>
                    );
                  })}
                  {!r.answers.length && <span className="meta">No answers</span>}
                </div>
              </li>
            );
          })}
          {partial &&
            Array.from({ length: SPAMLE_ROUNDS - detail.rounds.length }, (_, k) => (
              <li key={`open-${k}`} data-round={detail.rounds.length + k + 1} data-open>
                <p className="meta">{`Round ${detail.rounds.length + k + 1}`}</p>
                <p className="meta spam-open">Not played yet</p>
              </li>
            ))}
        </ol>
      </div>
      <p className="meta readout spam-readout" id={readout} aria-live="polite" data-readout>
        {at ? label(at.ri, at.a) : "No answers yet"}
      </p>
    </div>
  );
}

const BUCKET = 50;
const bucketLabel = (i: number) => (i === 9 ? "450 points and up" : `${i * BUCKET} to ${i * BUCKET + BUCKET - 1} points`);

/** The game's own words for where a finished Daily landed (`pctInfo`). */
function standing({ players, betterThan }: Detail): { short: string; long: string } | null {
  if (players === null) return null;
  if (players === 0 || betterThan === null) return { short: "First to finish", long: "First to finish today's Daily" };
  if (betterThan === 100) return { short: "#1 today", long: `Beat all ${plural(players, "other player")} who finished today` };
  const top = Math.max(1, 100 - Math.round(betterThan));
  return { short: `Top ${top}% today`, long: `Better than ${Math.round(betterThan)}% of the ${plural(players, "other player")} who finished today` };
}

export function Spamle({ record }: CardProps) {
  const { score, status, detail } = record as RecordOf<"spamle">;
  const partial = status === "partial";
  const place = standing(detail);
  const dist = detail.distribution;
  const own = Math.min(9, Math.floor(score / BUCKET));
  const label = [plural(detail.gumballs, "gumball"), partial ? `${detail.rounds.length} of ${SPAMLE_ROUNDS} rounds` : place?.short].filter(Boolean).join(" · ");
  return (
    <Card game="spamle">
      <Figure game="spamle" value={fmt(score)} label={<span className="meta">{label}</span>} />
      <Legend rarities={detail.rarities} />
      <Tray detail={detail} partial={partial} />
      {dist && (
        <Bars
          label="Scores of everyone who finished today"
          bars={dist.map((n, i) => ({ label: bucketLabel(i), value: n, color: i < own ? "var(--spam-beat)" : undefined }))}
          own={own}
          ownColor="var(--spam-own)"
          readout={(b) => `${b.label}: ${plural(b.value, "player")}`}
        />
      )}
      {place && <Caption>{place.long}</Caption>}
    </Card>
  );
}
