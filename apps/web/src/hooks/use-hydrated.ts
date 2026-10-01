import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server render and the hydration render, true after.
 * Use it when a client component's first render depends on data the
 * server can't have (e.g. a client-fetched session), so the hydration
 * render matches the server HTML and the real content renders right after.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
