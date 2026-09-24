"use client";

import * as Sentry from "@sentry/nextjs";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // React Query v5 removed the per-query `onError` callback, so the only
        // place a failed client fetch can be reported from is the cache. It
        // needs reporting: PostHog recorded 579 failed fetches of the emails
        // API across six weeks and Sentry - the tool the team actually watches
        // - saw none of them, because nothing ever forwarded them.
        queryCache: new QueryCache({
          onError: (error, query) => {
            Sentry.captureException(error, {
              tags: { source: "react-query" },
              extra: { queryHash: query.queryHash },
            });
          },
        }),
        // Mutations have their own cache; without this a failed useMutation is
        // only ever a toast.
        mutationCache: new MutationCache({
          onError: (error, _variables, _onMutateResult, mutation) => {
            Sentry.captureException(error, {
              tags: { source: "react-query-mutation" },
              extra: { mutationKey: mutation.options.mutationKey },
            });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute default
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
