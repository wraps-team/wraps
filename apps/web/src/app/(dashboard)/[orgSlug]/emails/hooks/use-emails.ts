"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { EMAIL_LIST_PAGE_SIZE, type EmailListSort } from "../lib/list-query";
import type { EmailListFeed, EmailListItem, EmailListResponse } from "../types";

/** Carries the HTTP status so a 4xx is not retried three times. */
export class EmailsRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmailsRequestError";
    this.status = status;
  }
}

export type EmailsQueryInput = {
  orgSlug: string;
  days: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: EmailListSort;
};

/**
 * One page of the list. Exported because the CSV export walks the cursor with
 * it directly rather than forcing every exported row into the query cache.
 */
export async function fetchEmailsPage(
  input: EmailsQueryInput,
  cursor?: string | null
): Promise<EmailListResponse> {
  const params = new URLSearchParams({
    days: String(input.days),
    limit: String(input.limit ?? EMAIL_LIST_PAGE_SIZE),
  });
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.search) {
    params.set("search", input.search);
  }
  if (input.sort) {
    params.set("sort", input.sort);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/${input.orgSlug}/emails?${params}`);
  if (!response.ok) {
    throw new EmailsRequestError(
      `Failed to fetch emails (HTTP ${response.status} ${response.statusText})`,
      response.status
    );
  }
  return response.json();
}

/**
 * The emails list, paged by cursor (audit F2).
 *
 * It used to be a single `useQuery` for a hardcoded 100 rows with client-side
 * slicing on top, so message 101 in a window was unreachable by any control on
 * the page - our largest organization has 1.95M sends. Pages now come from the
 * server's keyset cursor and accumulate.
 *
 * `retry: false` used to be paired with a UI that rendered failure as "No
 * emails found", so one network blip was both terminal and invisible - 579
 * failed fetches over six weeks, none of them shown to the user as a failure.
 * A bounded retry with backoff absorbs the blip; the error state the caller
 * now renders handles what survives it. A 4xx is the request's own fault and
 * is not retried at all. Reporting to Sentry happens once, in the shared
 * QueryCache handler (`contexts/query-client-context.tsx`).
 */
export function useEmailsData(input: EmailsQueryInput) {
  const { orgSlug, days, limit, search, sort, status } = input;

  const query = useInfiniteQuery<EmailListResponse>({
    queryKey: ["emails", orgSlug, days, limit, status, search, sort],
    queryFn: ({ pageParam }) =>
      fetchEmailsPage(input, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      if (error instanceof EmailsRequestError && error.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const pages = query.data?.pages;

  const emails = useMemo<EmailListItem[]>(
    () => (pages ? pages.flatMap((page) => page.items) : []),
    [pages]
  );

  const feed: EmailListFeed | null = pages?.[0]?.feed ?? null;

  return {
    ...query,
    emails,
    feed,
    /**
     * The total is only known once the server has said there is no next page.
     * Anything else would be a bounded number formatted as a total, which is
     * the footer defect this replaces.
     */
    totalKnown: Boolean(pages) && !query.hasNextPage,
  };
}
