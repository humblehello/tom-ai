"use client";
import { useEffect, useState } from "react";

/**
 * Returns true if the viewport matches the given media query.
 * SSR-safe: defaults to `false` on the server, updates on mount.
 *
 * Usage:
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 *   const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    // Set initial value from the actual media query (not just state default)
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Use addEventListener with fallback for older browsers
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } else {
      // Safari < 14
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  }, [query]);

  return matches;
}

/** Convenience: true when viewport is < 768px (phone + small tablet portrait) */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}