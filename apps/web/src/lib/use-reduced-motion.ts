"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/**
 * Whether the reader has asked the OS to reduce motion.
 *
 * The CSS block in `globals.css` covers everything animated by a stylesheet.
 * This exists for the animation CSS cannot reach: recharts drives its line and
 * area entrances in JavaScript, so the only way to stop them is to pass
 * `isAnimationActive={false}`.
 *
 * `useSyncExternalStore` rather than an effect, so the value is correct on the
 * first client paint instead of flipping one frame later - a hook that returns
 * `false` on mount would have already played the animation it exists to
 * prevent. The server snapshot is `false` because the preference is unknowable
 * during SSR; it costs nothing, since the server renders no animation.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
