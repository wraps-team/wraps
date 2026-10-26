import type { AICapability } from "./types";

export type ProviderId = "gateway" | "openai" | "anthropic" | "bedrock";

export type CatalogEntry = {
  readonly capabilities: readonly AICapability[];
  /**
   * Provider-native ids. A provider missing from this map cannot serve the
   * model, and `validate()` reports that at boot rather than at request time.
   *
   * Bedrock ids are stored WITHOUT the cross-region inference-profile prefix —
   * the bedrock provider prepends `us.`/`eu.`/`apac.` from the deployment
   * region, because the bare id fails in most regions.
   */
  readonly ids: Partial<Record<ProviderId, string>>;
};

const CLAUDE_CAPABILITIES = [
  "vision",
  "reasoning",
  "prompt-caching",
] as const satisfies readonly AICapability[];

const ADAPTIVE_CLAUDE_CAPABILITIES = [
  ...CLAUDE_CAPABILITIES,
  "adaptive-reasoning",
] as const satisfies readonly AICapability[];

export const MODEL_CATALOG = {
  /**
   * No bedrock id: Bedrock deployments keep DEFAULT_BEDROCK_MODEL_KEY until
   * the Converse id is verified against an account with model access enabled.
   */
  "claude-sonnet-5.5": {
    capabilities: ADAPTIVE_CLAUDE_CAPABILITIES,
    ids: {
      gateway: "anthropic/claude-sonnet-5.5",
      anthropic: "claude-sonnet-5-5",
    },
  },
  "claude-haiku-5.5": {
    capabilities: ADAPTIVE_CLAUDE_CAPABILITIES,
    ids: {
      gateway: "anthropic/claude-haiku-5.5",
      anthropic: "claude-haiku-5-5",
    },
  },
  /** The AI Gateway stopped serving this slug; kept for AI_MODEL pins and Bedrock. */
  "claude-sonnet-4": {
    capabilities: CLAUDE_CAPABILITIES,
    ids: {
      gateway: "anthropic/claude-sonnet-4",
      anthropic: "claude-sonnet-4-20250514",
      bedrock: "anthropic.claude-sonnet-4-20250514-v1:0",
    },
  },
  /**
   * The template AI chat route's historical default. No reasoning, no vision —
   * which is exactly why sending it `anthropic.thinking` was a no-op.
   */
  "grok-code-fast": {
    capabilities: [],
    ids: { gateway: "xai/grok-code-fast-1" },
  },
  "gpt-5": {
    capabilities: CLAUDE_CAPABILITIES,
    ids: { gateway: "openai/gpt-5", openai: "gpt-5" },
  },
} as const satisfies Record<string, CatalogEntry>;

export type ModelKey = keyof typeof MODEL_CATALOG;

export const DEFAULT_MODEL_KEY: ModelKey = "claude-sonnet-5.5";

/**
 * Bedrock needs model access enabled per AWS account, so moving its default is
 * a release-noted change for self-hosters, not a catalog edit.
 */
export const DEFAULT_BEDROCK_MODEL_KEY: ModelKey = "claude-sonnet-4";

/**
 * Used when WRAPS_AI_PROVIDER=openai and nothing else is specified, because the
 * cross-provider default (claude-sonnet-5.5) has no OpenAI equivalent.
 *
 * The catalog is only a convenience — any OpenAI model id works via AI_MODEL
 * passthrough, and capabilities are inferred with the SDK's own rule. Confirm
 * this default matches the model you actually intend to serve.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-5";

export function lookupCatalog(key: string): CatalogEntry | undefined {
  return (MODEL_CATALOG as Record<string, CatalogEntry>)[key];
}

/**
 * Whether an OpenAI model id is a reasoning model.
 *
 * Mirrors `getOpenAILanguageModelCapabilities` in `@ai-sdk/openai`
 * (`isReasoningModel`) rather than inventing a rule, so `gpt-5-chat` correctly
 * stays a non-reasoning model. Sending `reasoningEffort` to a model that does
 * not support it is an API error, so this must not over-report.
 */
export function isOpenAIReasoningModel(modelId: string): boolean {
  const id = modelId.toLowerCase().replace(/^openai\//, "");
  return (
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4-mini") ||
    (id.startsWith("gpt-5") && !id.startsWith("gpt-5-chat"))
  );
}

/**
 * Best-effort capabilities for a raw provider-native id that is not in the
 * catalog. Deliberately conservative: a wrong `true` silently breaks a request
 * (an image sent to a text-only model, or reasoning on a model that rejects
 * it), while a wrong `false` only degrades.
 */
export function inferCapabilities(modelId: string): readonly AICapability[] {
  const id = modelId.toLowerCase();
  if (/claude|sonnet|opus|haiku/.test(id)) {
    return /(?:opus|sonnet|haiku|fable|mythos)-(?:4[.-][6-9]|[5-9])/.test(id)
      ? ADAPTIVE_CLAUDE_CAPABILITIES
      : CLAUDE_CAPABILITIES;
  }
  if (/^(openai\/)?(gpt-|o1|o3|o4-)/.test(id)) {
    // OpenAI caches implicitly for prompts over ~1024 tokens, so every model
    // gets prompt-caching; only reasoning is model-dependent.
    return isOpenAIReasoningModel(id)
      ? ["vision", "reasoning", "prompt-caching"]
      : ["vision", "prompt-caching"];
  }
  if (/gemini|pixtral|nova/.test(id)) {
    return ["vision"];
  }
  return [];
}
