/**
 * The Globle globe: an orthographic view of the shared geo chunk, centered on the answer. Its own lazy chunk,
 * so if it fails to load the card keeps the flat map. It draws only when something changes: no frame loop.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Country } from "./geo";
import type { Geo } from "./geo-view";

export interface GlobeGuess {
  name: string;
  c: Country;
  heat: string;
  label: string | null;
}

type Rot = [number, number];
const TURN_MS = 360;
const STEP = 15;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const tilt = (p: number) => Math.max(-90, Math.min(90, p));
const media = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;

export function Globe({ geo, answer, guesses, label }: { geo: Geo; answer: Country; guesses: GlobeGuess[]; label: string }) {
  const home: Rot = [-answer.center[0], -answer.center[1]];
  const still = media("(prefers-reduced-motion: reduce)");
  const fine = media("(hover: hover) and (pointer: fine)");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [rot, setRot] = useState<Rot>(() => (still ? home : [home[0] + 45, home[1]]));
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const grab = useRef<{ x: number; y: number; rot: Rot } | null>(null);

  /** Turn from `from` to `to` on an ease-out, the short way round; at once under reduced motion. */
  const turn = (from: Rot, to: Rot) => {
    cancelAnimationFrame(frame.current);
    if (still) return setRot(to);
    const d = [wrap(to[0] - from[0]), to[1] - from[1]];
    let t0 = -1;
    const step = (t: number) => {
      if (t0 < 0) t0 = t;
      const k = Math.min(1, (t - t0) / TURN_MS);
      const e = 1 - (1 - k) ** 4;
      setRot([from[0] + d[0]! * e, from[1] + d[1]! * e]);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  useLayoutEffect(() => {
    const el = box.current!;
    setSize(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(() => setSize(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The one turn to the answer, the first time its card is in view.
  useEffect(() => {
    if (still) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      turn([home[0] + 45, home[1]], home);
    });
    io.observe(box.current!.closest(".card") ?? box.current!);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame.current);
    };
    // Once per mount: the answer does not change under a mounted globe.
  }, []);

  const view = useMemo(() => (size ? geo.globeView(size, rot) : null), [geo, size, rot]);
  const byName = useMemo(() => new Map(guesses.map((g) => [g.c.name, g])), [guesses]);
  const tipOf = (name: string) => {
    const g = byName.get(name);
    if (!g) return name;
    return g.c === answer ? `${g.name}, the answer` : g.label ? `${g.name}, ${g.label}` : g.name;
  };

  const keys: Record<string, Rot> = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
  const onKey = (e: KeyboardEvent) => {
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    cancelAnimationFrame(frame.current);
    setRot((r) => [r[0] + k[0], tilt(r[1] + k[1])]);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(frame.current);
    grab.current = { x: e.clientX, y: e.clientY, rot };
    e.currentTarget.setPointerCapture(e.pointerId);
    setTip(null);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (g) {
      // The surface under the pointer follows it: a radius of travel is a radian of turn.
      const k = 360 / Math.PI / size;
      setRot([g.rot[0] + (e.clientX - g.x) * k, tilt(g.rot[1] - (e.clientY - g.y) * k)]);
      return;
    }
    if (!fine || e.pointerType !== "mouse") return;
    const name = (e.target as Element).closest("[data-name]")?.getAttribute("data-name");
    const r = box.current!.getBoundingClientRect();
    setTip(name ? { text: tipOf(name), x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };
  const onUp = () => (grab.current = null);

  const answerD = view?.countries.find((c) => c.name === answer.name)?.d;
  return (
    <div ref={box} className="globe-in">
      <div
        className="globe"
        role="application"
        aria-roledescription="globe"
        aria-label={`${label}. Arrow keys turn the globe.`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setTip(null)}
      >
        {view && (
          <svg data-globe viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <g className="geo-in">
              <path data-ocean d={view.sphere} />
              <path data-graticule d={view.graticule} />
              {view.countries.map((c) => {
                const g = byName.get(c.name);
                return g ? (
                  <path key={c.key} data-name={c.name} data-country={g.name} data-heat={g.heat} data-mark="fill" style={{ fill: `var(--heat-${g.heat})` }} d={c.d} />
                ) : (
                  <path key={c.key} data-name={c.name} data-land d={c.d} />
                );
              })}
              {answerD && <path data-mark="outline" d={answerD} />}
            </g>
          </svg>
        )}
      </div>
      <button type="button" className="link meta globe-reset" onClick={() => turn(rot, home)}>
        Reset
      </button>
      {tip && (
        <div className="tip meta globe-tip" role="tooltip" style={{ left: tip.x, top: tip.y - 8, transform: `translate(${tip.x > size / 2 ? "-100%" : "0"}, -100%)` }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
