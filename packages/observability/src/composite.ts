import type { ErrorReporter } from "./types";

export const noopReporter: ErrorReporter = {
  id: "noop",
  capture: () => {},
  flush: () => Promise.resolve(),
};

export function createCompositeReporter(
  reporters: readonly ErrorReporter[]
): ErrorReporter {
  if (reporters.length === 0) {
    return noopReporter;
  }
  return {
    id: reporters.map((reporter) => reporter.id).join(","),
    capture: (event) => {
      for (const reporter of reporters) {
        try {
          reporter.capture(event);
        } catch {
          // one broken reporter must not stop the others or the caller
        }
      }
    },
    flush: async (timeoutMs) => {
      await Promise.allSettled(
        reporters.map((reporter) => reporter.flush(timeoutMs))
      );
    },
  };
}
