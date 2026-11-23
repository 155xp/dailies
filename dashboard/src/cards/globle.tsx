import { useMemo } from "react";
import type { RecordOf } from "../../../src/record";
import { Card, Figure, type CardProps } from "./frame";
import { AnswerRow, geoState, MapBox, useGeo, type Geo } from "./geo-view";

/**
 * Distance buckets as the game shares them (share of 15,000 km), each in the game's own map color sampled
 * inside that bucket (`fixtures/globle/*\/colors.json`); the answer is drawn `green`.
 */
const HEAT: Record<string, string> = {
  correct: "#008000",
  hot: "rgb(223, 67, 46)",
  warm: "rgb(241, 110, 74)",
  mild: "rgb(253, 190, 135)",
  cold: "rgb(254, 228, 192)",
};

/** The map's own heat, from the rounded distance its label shows, so a closer label is never a colder pin. */
const heatOf = (km: number) => (km <= 2000 ? "hot" : km <= 5000 ? "warm" : km <= 9000 ? "mild" : "cold");

let ctx: CanvasRenderingContext2D | null = null;
const textWidth = (s: string) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return s.length * 8;
  ctx.font = `13px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(ctx.measureText(s).width);
};

/** Every guess resolved, with its distance to the answer on a win; null to fall back to the tiles. */
function globleGeo(geo: Geo, countries: string[], won: boolean) {
  const all = countries.map(geo.resolve);
  if (!all.length || all.some((c) => !c)) return null;
  const answer = won ? all.at(-1)! : null;
  const guesses = countries.map((name, i) => {
    const c = all[i]!;
    const km = answer && i < countries.length - 1 ? geo.distanceKm(c, answer) : null;
    return { name, c, label: km === null ? null : geo.aboutKm(km), heat: km === null ? (answer ? "correct" : "none") : heatOf(geo.roundKm(km)), km: km ?? 0 };
  });
  return { answer, guesses, sil: answer && geo.silhouette(answer, 88) };
}

export function Globle({ record, history }: CardProps) {
  const { score, status, detail } = record as RecordOf<"globle">;
  const wins = history.filter((h) => h.status === "won");
  const average = wins.length ? wins.reduce((n, h) => n + h.score, 0) / wins.length : null;
  const won = status === "won";
  const geo = useGeo();
  const view = useMemo(() => (geo ? globleGeo(geo, detail.countries, won) : null), [geo, detail.countries, won]);
  const state = geoState(geo, view);
  const streak = (
    <p className="meta">
      Streak {detail.currentStreak} · Best {detail.maxStreak}
      {average !== null && ` · Average ${average.toFixed(1)}`}
    </p>
  );
  if (state === "fallback")
    return (
      <Card game="globle" geo={state}>
        <Figure game="globle" value={String(score)} label={<span className="meta">{score === 1 ? "Guess" : "Guesses"}</span>} />
        <div className="globle" data-tiles role="img" aria-label={`Guesses by distance: ${detail.countries.join(", ")}`}>
          {detail.countries.map((c, i) => {
            const heat = detail.heat?.[i] ?? "unknown";
            return <i key={i} className="gtile" data-tile data-heat={heat} style={{ background: HEAT[heat] }} />;
          })}
        </div>
        <p>{won ? `Found ${detail.countries.at(-1)}` : `Last guess ${detail.countries.at(-1) ?? "none"}`}</p>
        {streak}
      </Card>
    );
  const label = view && `Guesses and their distance to the answer: ${view.guesses.map((g) => (g.label ? `${g.name} ${g.label}` : g.name)).join(", ")}`;
  return (
    <Card game="globle" geo={state}>
      <Figure game="globle" value={String(score)} label={<span className="meta">{score === 1 ? "Guess" : "Guesses"}</span>} />
      {won && (
        <AnswerRow d={view?.sil ?? null} name={detail.countries.at(-1)!}>
          {streak}
        </AnswerRow>
      )}
      <MapBox ready={!!view} label={label ?? ""}>
        {(w, h) => {
          const m = (geo as Geo).mapView(w, h, view!.guesses.map((g) => g.c), view!.answer?.center[0]);
          const pins = view!.guesses.map((g) => ({ ...g, at: m.pin(g.c) ?? [-99, -99] }));
          const end = view!.answer && pins.at(-1)!.at;
          const rows = pins.filter((p) => p.label).sort((a, b) => a.km - b.km);
          const spots = (geo as Geo).placeLabels(
            rows.map((p) => ({ key: p.name, at: p.at, w: textWidth(p.label!) + 2, h: 16 })),
            pins.map((p) => ({ x: p.at[0] - 6, y: p.at[1] - 6, w: 12, h: 12 })),
            w,
            h,
          );
          return (
            <>
              <g className="geo-land">{m.land().map((l) => <path key={l.key} d={l.d} />)}</g>
              {pins.map((p) => <path key={p.name} data-mark="fill" style={{ fill: `var(--heat-${p.heat})` }} d={m.shape(p.c)} />)}
              {end && rows.map((p) => <line key={p.name} data-line={p.name} data-mark="line" x1={p.at[0]} y1={p.at[1]} x2={end[0]} y2={end[1]} />)}
              {rows.map((p) => {
                const b = spots.get(p.name);
                if (!b) return null;
                const near = [Math.min(Math.max(p.at[0], b.x), b.x + b.w), Math.min(Math.max(p.at[1], b.y), b.y + b.h)] as const;
                return (
                  <g key={p.name}>
                    {Math.hypot(near[0] - p.at[0], near[1] - p.at[1]) > 8 && <line className="geo-leader" data-mark="leader" x1={p.at[0]} y1={p.at[1]} x2={near[0]} y2={near[1]} />}
                    <text data-label={p.name} x={b.x + 1} y={b.y + 12.5}>
                      {p.label}
                    </text>
                  </g>
                );
              })}
              {pins.map((p) => <circle key={p.name} data-pin={p.name} data-heat={p.heat === "none" ? undefined : p.heat} data-mark="pin" style={{ fill: `var(--heat-${p.heat})` }} cx={p.at[0]} cy={p.at[1]} r={p.heat === "correct" ? 6 : 4.5} />)}
            </>
          );
        }}
      </MapBox>
      {!won && streak}
    </Card>
  );
}
