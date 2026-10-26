import type { ProviderOptions, ReasoningEffort } from "./types";

/**
 * The provider-options namespace a request must be written under.
 *
 * This is NOT the same as the Wraps provider id. The AI Gateway forwards
 * `providerOptions` verbatim to whatever upstream it routes to, so a request
 * through the gateway must use the UPSTREAM's namespace — `openai/gpt-5` needs
 * `openai`, not `gateway` and not `anthropic`.
 */
export type OptionNamespace = "anthropic" | "openai" | "bedrock";

/**
 * Effort maps to a token budget only where a budget exists. OpenAI has no such
 * concept, which is why effort (not tokens) is the portable unit.
 *
 * `medium` is 10_000 because that is the value every route hardcoded before
 * this package existed — keeping it identical makes the extraction a no-op.
 */
const EFFORT_BUDGET_TOKENS: Record<ReasoningEffort, number> = {
  low: 4000,
  medium: 10_000,
  high: 24_000,
};

/**
 * Nothing here generalizes: three namespaces, three unrelated shapes. That is
 * precisely why the mapping lives in one table instead of being re-derived at
 * each call site — where it was previously wrong (every route sent
 * `anthropic.thinking` even when the model was `xai/grok-code-fast-1`).
 *
 * Both mismatches fail SILENTLY. Bedrock ignores an `anthropic` namespace and
 * OpenAI ignores `budgetTokens`; reasoning simply stops appearing, with no
 * error and nothing in the logs.
 */
export function reasoningOptions(
  namespace: OptionNamespace | undefined,
  effort: ReasoningEffort | undefined
): ProviderOptions | undefined {
  if (!(namespace && effort)) {
    return;
  }
  const budgetTokens = EFFORT_BUDGET_TOKENS[effort];
  switch (namespace) {
    case "anthropic":
      return { anthropic: { thinking: { type: "enabled", budgetTokens } } };
    case "bedrock":
      return {
        bedrock: { reasoningConfig: { type: "enabled", budgetTokens } },
      };
    case "openai":
      return { openai: { reasoningEffort: effort } };
    default:
      return;
  }
}

/**
 * A message-part marker denoting a prompt-cache breakpoint.
 *
 * OpenAI returns undefined on purpose: it caches implicitly for prompts over
 * ~1024 tokens with no marker at all. Explicit OpenAI breakpoints exist only in
 * `@ai-sdk/openai@4.0.11`+; this repo is on that line now but has not wired them up.
 */
export function cacheBreakpoint(
  namespace: OptionNamespace | undefined
): ProviderOptions | undefined {
  switch (namespace) {
    case "anthropic":
      return { anthropic: { cacheControl: { type: "ephemeral" } } };
    case "bedrock":
      return { bedrock: { cachePoint: { type: "default" } } };
    default:
      return;
  }
}

/**
 * Combine provider options, merging WITHIN each namespace.
 *
 * A plain spread merges only the top level, so `{openai: {reasoningEffort}}`
 * spread with `{openai: {promptCacheKey}}` drops the effort — and reasoning
 * disappearing is exactly the silent failure this module exists to prevent.
 *
 * Returns undefined rather than `{}` when there is nothing to send, so callers
 * can hand the result straight to streamText without inventing an empty block.
 */
export function mergeProviderOptions(
  ...parts: readonly (ProviderOptions | undefined)[]
): ProviderOptions | undefined {
  const merged: Record<string, ProviderOptions[string]> = {};
  let hasAny = false;

  for (const part of parts) {
    if (!part) {
      continue;
    }
    for (const [namespace, options] of Object.entries(part)) {
      merged[namespace] = { ...merged[namespace], ...options };
      hasAny = true;
    }
  }

  return hasAny ? merged : undefined;
}
