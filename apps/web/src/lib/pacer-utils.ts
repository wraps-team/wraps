// apps/web/src/lib/pacer-utils.ts

import { Debouncer, Throttler } from "@tanstack/pacer";

/**
 * Auto-save debouncing - waits 1s after last edit
 */
export function createAutoSave<T>(
  saveFn: (content: T) => Promise<void>,
  delay = 1000
) {
  return new Debouncer(saveFn, { wait: delay });
}

/**
 * Search throttling - limits search requests
 */
export function createSearchThrottle(
  searchFn: (query: string) => Promise<void>,
  delay = 300
) {
  return new Throttler(searchFn, { wait: delay });
}

/**
 * Preview generation debouncing - batches multiple rapid changes
 */
export function createPreviewDebouncer<T>(
  generateFn: (content: T) => Promise<void>,
  delay = 500
) {
  return new Debouncer(generateFn, { wait: delay });
}
