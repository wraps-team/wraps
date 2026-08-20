"use client";

import { useEffect, useRef } from "react";
import { captureContactsSearched } from "./analytics";

type TelemetryInput = {
  contactCount: number;
  search: string | null;
  total: number;
};

/**
 * Contacts list search instrumentation (audit finding F16).
 *
 * Fires once per settled search - after the URL commits and the page's
 * server component has re-rendered with fresh `contacts`/`total` props - not
 * once per keystroke of the 400ms debounce in `contacts-table.tsx`. Dedup key
 * is `search|total`: an App Router `router.replace` delivers the new
 * `searchParams` value and the new `contacts`/`total` props in the same
 * commit, so the pair only changes once per settled query. The query itself
 * never leaves the browser, only its length.
 */
export function useContactsSearchTelemetry({
  contactCount,
  search,
  total,
}: TelemetryInput) {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!search) {
      lastKeyRef.current = null;
      return;
    }
    const key = `${search}|${total}`;
    if (lastKeyRef.current === key) {
      return;
    }
    lastKeyRef.current = key;
    captureContactsSearched({
      has_results: contactCount > 0,
      query_length: search.length,
      result_count: total,
    });
  }, [contactCount, search, total]);
}
