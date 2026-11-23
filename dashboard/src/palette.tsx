import { useEffect, useState } from "react";

/**
 * The game palette: standard, or high contrast (Wordle's orange and blue, a label on Krillion and
 * Connections tiles). Stored in this browser only. With nothing stored it follows `prefers-contrast: more`.
 */
const KEY = "dailies-palette";
type Choice = "contrast" | "standard" | null;

const read = (): Choice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "contrast" || v === "standard" ? v : null;
  } catch {
    return null;
  }
};

const apply = (choice: Choice) => {
  if (choice) document.documentElement.dataset.palette = choice;
  else delete document.documentElement.dataset.palette;
};

// Before the first paint, on every page that imports this.
apply(read());

const MORE = "(prefers-contrast: more)";

export function PaletteSetting() {
  const [choice, setChoice] = useState(read);
  const [system, setSystem] = useState(() => matchMedia(MORE).matches);
  useEffect(() => {
    const mq = matchMedia(MORE);
    const sync = () => setSystem(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const on = choice ? choice === "contrast" : system;
  const set = (next: boolean) => {
    const c = next ? "contrast" : "standard";
    try {
      localStorage.setItem(KEY, c);
    } catch {
      // Private windows can refuse storage; the choice still holds for this visit.
    }
    apply(c);
    setChoice(c);
  };
  return (
    <div className="setting">
      <div>
        <label htmlFor="palette">High-contrast colors</label>
        <p className="meta" id="palette-note">
          Wordle tiles in orange and blue, and a label on every Krillion and Connections tile
        </p>
      </div>
      <input id="palette" className="switch" type="checkbox" role="switch" aria-describedby="palette-note" checked={on} onChange={(e) => set(e.target.checked)} />
    </div>
  );
}
