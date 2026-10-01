import type { ErrorReporter } from "./types";

export type HandlerWrapper = <A extends unknown[], R>(
  fn: (...args: A) => Promise<R>
) => (...args: A) => Promise<R>;

const identity: HandlerWrapper = (fn) => fn;

export function createInstrumentHandler(opts: {
  readonly reporter: ErrorReporter;
  /** e.g. Sentry.wrapHandler, or wrapHandler∘withMonitor. Identity when absent. */
  readonly decorate?: HandlerWrapper;
  /** e.g. flushLogger — the Axiom buffer has the same freeze problem. */
  readonly flushOthers?: readonly (() => Promise<void>)[];
  readonly flushTimeoutMs?: number;
}): HandlerWrapper {
  const decorate = opts.decorate ?? identity;
  // decorate is outermost so the provider still observes the throw; our flush
  // runs in a finally inside it so it completes before the provider's own flush.
  return (fn) =>
    decorate(async (...args) => {
      try {
        return await fn(...args);
      } finally {
        // finally, not catch: a handler that returns normally can still hold
        // buffered captures from a per-item failure it swallowed.
        await Promise.allSettled([
          opts.reporter.flush(opts.flushTimeoutMs ?? 2000),
          ...(opts.flushOthers ?? []).map((flush) => flush()),
        ]);
      }
    });
}
