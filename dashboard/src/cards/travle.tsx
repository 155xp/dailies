import { useMemo } from "react";
import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, inkOn, plural, type CardProps } from "./frame";
import { AnswerRow, geoState, MapBox, useGeo, type Geo } from "./geo-view";

/**
 * The four rating roles. Travle draws ratings as emoji only and has no rating hex (docs/CAPTURE.md #4),
 * so these are role colors in the emoji's hues: on route, near route, small detour, big detour.
 */
export const RATINGS = { perfect: "#3f9b4a", "near-perfect": "#a3d977", good: "#f5a142", poor: "#e5534b" } as const;
const T_LABELS = ["Lost", "Perfect", "+0", "+1", "+2", "+3", "+4"];

/** Every guess and route country resolved, or null to fall back to the chips. */
function travleGeo(geo: Geo, { guesses, optimalRoute }: RecordOf<"travle">["detail"]) {
  const route = optimalRoute.map(geo.resolve);
  const guessed = guesses.map((g) => ({ ...g, c: geo.resolve(g.country) }));
  if (!route.length || route.some((c) => !c) || guessed.some((g) => !g.c)) return null;
  const end = route.at(-1)!;
  // Pins land in the same place at every width, so the reference frame decides what is off the map.
  const ref = geo.mapView(300, 200, route as NonNullable<(typeof route)[0]>[]);
  return {
    route: route.map((c, i) => ({ code: optimalRoute[i]!, c: c! })),
    guessed: guessed.map((g) => ({ ...g, c: g.c! })),
    end,
    sil: geo.silhouette(end, 88),
    off: guessed.filter((g) => !ref.pin(g.c!)).map((g) => g.c!.name),
  };
}

export function Travle({ record }: CardProps) {
  const { score, status, detail } = record as RecordOf<"travle">;
  const extra = detail.par === null ? null : score - detail.par;
  const value = status === "lost" ? `${detail.away ?? "Some"} away` : detail.perfect ? "Perfect" : extra === null ? plural(score, "guess", "guesses") : `+${extra}`;
  // Buckets pair up as `t * 2 + (hints ? 1 : 0)`; show the player's hint group, best first, lost last.
  const t = status === "lost" ? 0 : detail.perfect && extra === 0 ? 1 : extra === null ? null : Math.min(6, 2 + extra);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dist = detail.distribution;
  const geo = useGeo();
  const view = useMemo(() => (geo ? travleGeo(geo, detail) : null), [geo, detail]);
  const state = geoState(geo, view);
  return (
    <Card game="travle" geo={state}>
      <Figure game="travle" value={value} label={<span className="meta">{[detail.par !== null && `Par ${detail.par}`, plural(score, "guess", "guesses"), detail.hints > 0 && plural(detail.hints, "hint")].filter(Boolean).join(", ")}</span>} />
      {state === "fallback" ? (
          <>
            <div className="chips" data-tiles role="img" aria-label="Guesses by rating">
              {detail.guesses.map((g, i) => (
                <i key={i} className="gtile chip" data-tile data-rating={g.rating} style={{ background: RATINGS[g.rating], color: inkOn(RATINGS[g.rating]) }}>
                  {g.country}
                </i>
              ))}
            </div>
            {detail.optimalRoute.length > 0 && <p className="meta">Shortest route {detail.optimalRoute.join(", ")}</p>}
          </>
      ) : (
        <>
          <AnswerRow d={view?.sil ?? null} name={view?.end.name ?? null}>
            <p className="meta">{`${plural(detail.optimalRoute.length, "country", "countries")} on the shortest route`}</p>
            {view && view.off.length > 0 && <p className="meta" data-offmap>{`Off the map: ${view.off.join(", ")}`}</p>}
          </AnswerRow>
          <MapBox ready={!!view} label={`Guesses and the shortest route, ${view?.route.map((r) => r.c.name).join(", ")}`}>
            {(w, h) => {
              const m = (geo as Geo).mapView(w, h, view!.route.map((r) => r.c));
              const pins = view!.guessed.map((g) => ({ ...g, at: m.pin(g.c) }));
              const codes = new Set(detail.guesses.map((g) => g.country));
              return (
                <>
                  <g className="geo-land">{m.land().map((l) => <path key={l.key} d={l.d} />)}</g>
                  {view!.route.filter((r) => !codes.has(r.code)).map((r) => <path key={r.code} className="geo-route-land" data-country={r.code} d={m.shape(r.c)} />)}
                  {pins.map((g) => g.at && <path key={g.country} data-country={g.country} data-rating={g.rating} data-mark="fill" style={{ fill: `var(--travle-${g.rating})` }} d={m.shape(g.c)} />)}
                  <path data-route data-mark="route" d={"M" + view!.route.map((r) => m.pin(r.c)!.map((n) => n.toFixed(1)).join(",")).join("L")} />
                  {pins.map((g) => g.at && <circle key={g.country} data-pin={g.country} data-mark="pin" cx={g.at[0]} cy={g.at[1]} r={4.5} />)}
                </>
              );
            }}
          </MapBox>
        </>
      )}
      {detail.topPercent !== null && <Caption>{`Top ${detail.topPercent}% today`}</Caption>}
      {dist && t !== null && (
        <Bars
          label="Today's results"
          bars={order.map((ti) => ({ label: T_LABELS[ti]!, value: dist[ti * 2 + (detail.hints ? 1 : 0)] ?? 0 }))}
          own={order.indexOf(t)}
          ownColor="#7daea3"
          readout={(b) => `${b.label}: ${fmt(b.value)} players`}
        />
      )}
    </Card>
  );
}
