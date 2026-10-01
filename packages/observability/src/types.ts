export type ErrorEvent = {
  readonly error: Error;
  /** High-cardinality. Callers must not put raw request payloads here. */
  readonly context?: Readonly<Record<string, unknown>>;
  /** Low-cardinality, indexable. */
  readonly tags?: Readonly<Record<string, string>>;
  readonly severity?: "warning" | "error" | "fatal";
  /** Stable grouping key when the message alone groups badly. */
  readonly fingerprint?: readonly string[];
};

export type ErrorReporter = {
  readonly id: string;
  /** Never throws, never awaits the network. */
  readonly capture: (event: ErrorEvent) => void;
  /** Best-effort drain. Resolves even on failure. */
  readonly flush: (timeoutMs: number) => Promise<void>;
};
