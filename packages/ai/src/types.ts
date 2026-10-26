// ProviderOptions lives in provider-utils; `ai` consumes it but does not
// re-export it. Sourcing it here keeps our options structurally identical to
// what streamText() accepts.
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";

export type { ProviderOptions } from "@ai-sdk/provider-utils";

/**
 * `adaptive-reasoning` marks Claude 4.6+ models, which take adaptive thinking
 * plus an effort level and reject a thinking token budget with a 400.
 */
export type AICapability =
  | "vision"
  | "reasoning"
  | "adaptive-reasoning"
  | "prompt-caching";

export type ReasoningEffort = "low" | "medium" | "high";

/**
 * What the caller wants, expressed portably. Never provider-specific.
 *
 * Reasoning is expressed as EFFORT, not a token budget: OpenAI exposes only
 * `reasoningEffort: low|medium|high` and has no budget concept at all, so a
 * budget cannot round-trip. Providers that need one map effort to tokens.
 */
export type ModelRequest = {
  /** Catalog key or a raw provider-native id. */
  readonly model?: string;
  readonly reasoning?: { readonly effort: ReasoningEffort };
};

export type ModelCache = {
  /**
   * Attach to the last stable message part to mark a cache breakpoint.
   *
   * `undefined` does NOT mean "no caching" — OpenAI caches implicitly with no
   * marker at all. Check the `prompt-caching` capability for that.
   */
  readonly breakpoint?: ProviderOptions;
  /** Top-level options that improve cache routing, e.g. openai.promptCacheKey. */
  readonly requestOptions?: ProviderOptions;
};

export type ResolvedModel = {
  readonly model: LanguageModel;
  /** Provider-native id — what goes on the wire, and what we meter. */
  readonly modelId: string;
  /** Stable cross-provider key. Safe to group analytics by. */
  readonly modelKey: string;
  readonly providerId: string;
  readonly capabilities: ReadonlySet<AICapability>;
  /** Whether modelKey came from the catalog or was inferred from a raw id. */
  readonly catalogued: boolean;
  /**
   * The model the caller asked for, when this provider could not serve it and
   * its own default was substituted. Undefined on the normal path. Log it —
   * an unannounced model swap is worse than a loud one.
   */
  readonly degradedFrom?: string;
  /** Already namespaced for this provider. Spread into streamText(). */
  readonly providerOptions: ProviderOptions | undefined;
  readonly cache: ModelCache;
};

export type AIProvider = {
  readonly id: string;
  readonly languageModel: (request: ModelRequest) => ResolvedModel;
};
