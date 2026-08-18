"use client";

import { useEffect, useRef } from "react";
import {
  captureEmailsListViewed,
  captureEmailsSearched,
  type EmailsListStateKind,
} from "../lib/analytics";

type TelemetryInput = {
  days: number;
  isFetching: boolean;
  isLoading: boolean;
  listState: EmailsListStateKind;
  rowCount: number;
  search?: string;
  status?: string;
};

/**
 * The emails list's product instrumentation (audit finding F10).
 *
 * Lives in its own hook rather than inline in the table so that adding a
 * measurement never means editing the component that renders the rows.
 *
 * Both events are deduped by hand: `emails_list_viewed` fires once per
 * resolved state rather than once per render, so the state distribution in
 * PostHog is comparable with the one measured in the database, and
 * `emails_searched` fires once per settled query rather than once per
 * keystroke of the 400ms debounce.
 */
export function useEmailsTelemetry({
  days,
  isFetching,
  isLoading,
  listState,
  rowCount,
  search,
  status,
}: TelemetryInput) {
  const viewedKey = `${listState}|${days}|${status ?? ""}|${search ?? ""}`;
  const lastViewedKey = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || lastViewedKey.current === viewedKey) {
      return;
    }
    lastViewedKey.current = viewedKey;
    captureEmailsListViewed({
      days,
      has_search: Boolean(search),
      row_count: rowCount,
      state: listState,
      status: status ?? null,
    });
  }, [days, isLoading, listState, rowCount, search, status, viewedKey]);

  // Search is reported by length only. The term itself can carry a recipient
  // address or a subject line, neither of which belongs in analytics.
  const lastSearchKey = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || isFetching || !search) {
      return;
    }
    const key = `${search}|${days}|${status ?? ""}`;
    if (lastSearchKey.current === key) {
      return;
    }
    lastSearchKey.current = key;
    captureEmailsSearched({
      has_results: rowCount > 0,
      query_length: search.length,
      result_count: rowCount,
    });
  }, [days, isFetching, isLoading, rowCount, search, status]);
}
