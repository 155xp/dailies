import { useEffect, useState } from "react";

/** Longest exit in styles.css (`.enter[data-leaving]`, and the reduced-motion fade). */
const EXIT_MS = 150;

/**
 * Keeps a block mounted for its exit after `show` turns false, so it can fade out before it goes.
 * `leaving` marks that exit; the block is removed once it has played.
 */
export function usePresence(show: boolean) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [show]);
  return { mounted: show || mounted, leaving: !show && mounted };
}
