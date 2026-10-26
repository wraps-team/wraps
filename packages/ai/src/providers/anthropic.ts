import { cacheBreakpoint, reasoningOptions } from "../call-options";
import { DEFAULT_MODEL_KEY } from "../catalog";
import { fail, ok, type ProviderSpec } from "../registry";
import { resolveModelId, unwrapModelResolution } from "../resolve-model";
import type { AIProvider } from "../types";

/**
 * Anthropic, called directly rather than through the gateway.
 *
 * This is the provider the self-hosted docs have promised for months: they
 * documented ANTHROPIC_API_KEY as a gateway alternative, and infra piped it to
 * the API Lambda, but nothing ever read it. Now it works.
 */
export const anthropicSpec: ProviderSpec<AIProvider> = {
  id: "anthropic",
  label: "Anthropic",
  selectorEnvVars: ["ANTHROPIC_BASE_URL"],
  prepare: (env) => {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return fail({
        code: "missing_api_key",
        message:
          "The Anthropic provider requires ANTHROPIC_API_KEY. Set it, or unset WRAPS_AI_PROVIDER to use the Vercel AI Gateway.",
        envVars: ["ANTHROPIC_API_KEY", "WRAPS_AI_PROVIDER"],
      });
    }

    const override = env.AI_MODEL?.trim() || undefined;
    if (override) {
      const check = resolveModelId({
        providerId: "anthropic",
        requested: override,
        fallback: DEFAULT_MODEL_KEY,
      });
      if (!check.ok) {
        return fail(check.issue);
      }
    }

    const baseURL = env.ANTHROPIC_BASE_URL?.trim() || undefined;

    return ok(async () => {
      // Dynamic so the Anthropic SDK stays out of the bundle unless selected.
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({ apiKey, baseURL });

      return {
        id: "anthropic",
        languageModel: (request) => {
          const { modelId, modelKey, capabilities, catalogued, degradedFrom } =
            unwrapModelResolution(
              resolveModelId({
                providerId: "anthropic",
                requested: override,
                preferred: request.model,
                fallback: DEFAULT_MODEL_KEY,
              })
            );

          return {
            model: anthropic(modelId),
            modelId,
            modelKey,
            providerId: "anthropic",
            capabilities,
            catalogued,
            degradedFrom,
            providerOptions: capabilities.has("reasoning")
              ? reasoningOptions(
                  "anthropic",
                  request.reasoning?.effort,
                  capabilities.has("adaptive-reasoning")
                )
              : undefined,
            cache: {
              breakpoint: capabilities.has("prompt-caching")
                ? cacheBreakpoint("anthropic")
                : undefined,
            },
          };
        },
      } satisfies AIProvider;
    });
  },
};
