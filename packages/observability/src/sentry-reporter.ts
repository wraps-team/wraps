import type { ErrorReporter } from "./types";

export type SentryLike = {
  captureException: (
    e: unknown,
    hint?: {
      extra?: Record<string, unknown>;
      tags?: Record<string, string>;
      level?: string;
      fingerprint?: string[];
    }
  ) => void;
  flush: (timeout?: number) => Promise<boolean>;
};

export function createSentryReporter(sdk: SentryLike): ErrorReporter {
  return {
    id: "sentry",
    capture: ({ error, context, tags, severity, fingerprint }) => {
      try {
        sdk.captureException(error, {
          ...(context === undefined ? {} : { extra: { ...context } }),
          ...(tags === undefined ? {} : { tags: { ...tags } }),
          ...(severity === undefined ? {} : { level: severity }),
          ...(fingerprint === undefined
            ? {}
            : { fingerprint: [...fingerprint] }),
        });
      } catch {
        // reporting must never fail the caller
      }
    },
    flush: async (timeoutMs) => {
      try {
        await sdk.flush(timeoutMs);
      } catch {
        // best-effort drain
      }
    },
  };
}
