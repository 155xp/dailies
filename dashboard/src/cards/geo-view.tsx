import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Geo = typeof import("./geo");

/** A hook for one lazy chunk: null while it loads, false if it failed. Requested by the first card that asks (`on`). */
export function chunk<T>(load: () => Promise<T>) {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;
  return function useChunk(on = true): T | null | false {
    const [mod, setMod] = useState<T | null | false>(loaded);
    useEffect(() => {
      if (mod !== null || !on) return;
      let live = true;
      (pending ??= load()).then(
        (m) => live && setMod((loaded = m)),
        () => live && setMod(false),
      );
      return () => {
        live = false;
      };
    }, [mod, on]);
    return mod;
  };
}

/** The geo chunk, requested by the first card that needs it. */
export const useGeo = chunk<Geo>(() => import("./geo"));

/** Where the geo view stands: the map, its placeholder, or today's text and tiles. */
export const geoState = <T,>(geo: Geo | null | false, view: T | null) => (geo === null ? "loading" : view ? "ready" : "fallback");

/** The silhouette box and its words. The words are a quiet bar until the chunk lands, when the name is known. */
export function AnswerRow({ d, name, children }: { d: string | null; name: string | null; children: ReactNode }) {
  return (
    <div className="geo-answer">
      <div className="geo-sil" data-geo-box="silhouette">
        {d === null ? (
          <i className="geo-hold" data-geo-placeholder />
        ) : (
          <svg data-silhouette viewBox="0 0 88 88" role="img" aria-label={`${name} outline`}>
            <path className="geo-in" data-mark="answer" d={d} />
          </svg>
        )}
      </div>
      <div className="geo-words">
        {name === null ? <i className="geo-hold geo-line" data-geo-placeholder /> : <p data-answer>{name}</p>}
        {children}
      </div>
    </div>
  );
}

/** A 3:2 box the width of the card. Draws `children(w, h)` in pixels once the chunk is in, so labels keep their size. */
export function MapBox({ ready, label, wide, children }: { ready: boolean; label: string; wide?: boolean; children: (w: number, h: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [[w, boxH], setSize] = useState([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current!;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize([r.width, r.height]);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A wide box takes its height from CSS: a strip from 1024 up, 3:2 below.
  const h = wide ? boxH : (w * 2) / 3;
  return (
    <div ref={ref} className={wide ? "geo-map wide" : "geo-map"} data-geo-box="map">
      {!ready ? (
        <i className="geo-hold" data-geo-placeholder />
      ) : (
        w > 0 && (
          <svg data-map viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
            <g className="geo-in">{children(w, h)}</g>
          </svg>
        )
      )}
    </div>
  );
}
