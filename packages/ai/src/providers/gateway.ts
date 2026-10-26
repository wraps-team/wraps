import { gateway } from "@ai-sdk/gateway";
import {
  cacheBreakpoint,
  mergeProviderOptions,
  type OptionNamespace,
  reasoningOptions,
} from "../call-options";
import { DEFAULT_MODEL_KEY } from "../catalog";
import { fail, ok, type ProviderSpec } from "../registry";
import { resolveModelId, unwrapModelResolution } from "../resolve-model";
import type { AIProvider } from "../types";

/**
 * Imported statically, unlike every other provider.
 *
 * Two reasons: it is the default, so lazy-loading it saves nothing; and
 * `apps/web`'s route tests already `vi.mock("@ai-sdk/gateway")`, which a
 * dynamic import would defeat.
 */

/**
 * The gateway forwards `providerOptions` verbatim to whatever it routes to, so
 * the namespace is the UPSTREAM's, derived from the slug prefix.
 */
function upstreamNamespace(modelId: string): OptionNamespace | undefined {
  const upstream = modelId.split("/")[0];
  if (
    upstream === "anthropic" ||
    upstream === "openai" ||
    upstream === "bedrock"
  ) {
    return upstream;
  }
  // xai, google, meta, … — no mapped options. Sending an `anthropic` block here
  // is what the pre-package code did, and it did nothing.
  return;
}

export const gatewaySpec: ProviderSpec<AIProvider> = {
  id: "gateway",
  label: "Vercel AI Gateway",
  prepare: (env) => {
    // Deliberately no credential check. The gateway provider resolves its own
    // auth from AI_GATEWAY_API_KEY or, on Vercel, VERCEL_OIDC_TOKEN — and OIDC
    // presence cannot be reliably detected at boot. Failing here would break
    // working deployments to report a problem we cannot actually see.
    const override = env.AI_MODEL?.trim() || undefined;

    // Validate the deployment-wide override at boot. A per-route fallback can
    // only be checked when that route runs.
    if (override) {
      const check = resolveModelId({
        providerId: "gateway",
        requested: override,
        fallback: DEFAULT_MODEL_KEY,
      });
      if (!check.ok) {
        return fail(check.issue);
      }
    }

    return ok(() =>
      Promise.resolve({
        id: "gateway",
        languageModel: (request) => {
          const { modelId, modelKey, capabilities, catalogued, degradedFrom } =
            unwrapModelResolution(
              resolveModelId({
                providerId: "gateway",
                requested: override,
                preferred: request.model,
                fallback: DEFAULT_MODEL_KEY,
              })
            );
          const namespace = upstreamNamespace(modelId);

          return {
            model: gateway(modelId),
            modelId,
            modelKey,
            providerId: "gateway",
            capabilities,
            catalogued,
            degradedFrom,
            // Customer content goes through these prompts, so the gateway may
            // only route to upstreams with a verified zero-retention agreement.
            // With none available the request fails; it never falls back.
            providerOptions: mergeProviderOptions(
              { gateway: { zeroDataRetention: true } },
              capabilities.has("reasoning")
                ? reasoningOptions(
                    namespace,
                    request.reasoning?.effort,
                    capabilities.has("adaptive-reasoning")
                  )
                : undefined
            ),
            cache: {
              breakpoint: capabilities.has("prompt-caching")
                ? cacheBreakpoint(namespace)
                : undefined,
            },
          };
        },
      } satisfies AIProvider)
    );
  },
};

export const _internalUpstreamNamespace = upstreamNamespace;
