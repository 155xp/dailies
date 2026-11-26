import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";

interface Props {
  day: string;
  today: string;
  step: (by: number) => void;
  go: (day: string, how?: "push" | "replace") => void;
}

/** Left and right arrows page days, unless something focused already uses them (a chart, a field, the history scroller). */
function claimsArrows(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable], [role=slider], [data-scroll-x]");
}

/** Previous day, a date picker, next day; and Today once away from it. Today sits first so the three never move when it shows. */
export function DayNav({ day, today, step, go }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const isToday = day === today;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || claimsArrows(e.target)) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight" && !isToday) step(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, isToday]);

  const pick = () => {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <nav className="day-nav" aria-label="Day">
      {!isToday && (
        <button type="button" className="nav-today" onClick={() => go(today, "push")}>
          Today
        </button>
      )}
      <button type="button" className="nav-icon" aria-label="Previous day" title="Previous day" onClick={() => step(-1)}>
        <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="nav-pick">
        <button type="button" className="nav-icon" aria-label="Go to a date" title="Go to a date" onClick={pick}>
          <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {/* The native picker opens from the button and anchors here; the field itself stays out of sight and out of the tab order. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-label="Date"
          max={today}
          value={day}
          onChange={(e) => e.target.value && go(e.target.value, "push")}
        />
      </span>
      <button type="button" className="nav-icon" aria-label="Next day" title="Next day" disabled={isToday} onClick={() => step(1)}>
        <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </nav>
  );
}
