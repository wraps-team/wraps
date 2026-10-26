import { cacheBreakpoint, reasoningOptions } from "../call-options";
import { DEFAULT_BEDROCK_MODEL_KEY } from "../catalog";
import { fail, ok, type ProviderSpec } from "../registry";
import { resolveModelId, unwrapModelResolution } from "../resolve-model";
import type { AIProvider } from "../types";

/**
 * Rewrite Bedrock's AccessDenied into something actionable.
 *
 * Model access is a separate per-account, per-region opt-in in the Bedrock
 * console. With perfect IAM you still get AccessDeniedException, which reads
 * exactly like a credentials problem — and sends the operator to re-check keys
 * that were never wrong.
 */
export function describeBedrockError(error: unknown, region: string): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!/AccessDenied|not authorized|don't have access/i.test(message)) {
    return error;
  }
  return new Error(
    `Bedrock denied the request in ${region}. IAM permissions are granted by the deployment, so the usual cause is that the model is not enabled for this account and region. Enable it under Bedrock → Model access in the ${region} console. Original error: ${message}`,
    { cause: error }
  );
}

/**
 * Cross-region inference-profile prefixes.
 *
 * Most Anthropic models on Bedrock are only invocable through an inference
 * profile, so the bare `anthropic.claude-…` id fails in nearly every region.
 * AWS owns this mapping and extends it without notice — when a region is not
 * listed we send the bare id rather than guess, and `AI_MODEL` passthrough
 * remains the documented escape hatch.
 */
function inferenceProfilePrefix(region: string): string | undefined {
  if (region.startsWith("us-")) {
    return "us.";
  }
  if (region.startsWith("eu-")) {
    return "eu.";
  }
  if (region.startsWith("ap-")) {
    return "apac.";
  }
  return;
}

/**
 * Apply the region prefix to a catalog id, leaving raw ids alone.
 *
 * A passthrough id the operator typed themselves is taken literally — they may
 * have supplied a full profile ARN or a prefix we do not know about.
 */
export function applyInferenceProfile(
  modelId: string,
  region: string,
  catalogued: boolean
): string {
  if (!catalogued) {
    return modelId;
  }
  if (/^(us|eu|apac)\./.test(modelId) || modelId.startsWith("arn:")) {
    return modelId;
  }
  const prefix = inferenceProfilePrefix(region);
  return prefix ? `${prefix}${modelId}` : modelId;
}

/**
 * Rewrite errors thrown by the model's own call methods.
 *
 * Wrapping here rather than at the route keeps the region — which the route
 * does not know — in scope. Errors raised mid-stream still pass through
 * untouched; this catches the request-time denial, which is the one operators
 * actually hit.
 */
function withBedrockErrors<T extends object>(model: T, region: string): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof value === "function" &&
        (prop === "doStream" || prop === "doGenerate")
      ) {
        return async (...args: unknown[]) => {
          try {
            return await value.apply(target, args);
          } catch (error) {
            throw describeBedrockError(error, region);
          }
        };
      }
      return value;
    },
  });
}

/**
 * AWS Bedrock — self-hosted deployments only.
 *
 * Credentials come from the deployment's own chain (Lambda execution role,
 * static keys, or a local profile). This is deliberately NOT an assume-role
 * into a customer's connected AWS account: that account is provisioned for SES
 * sending, and borrowing it for inference would silently put model spend on a
 * bill the customer scoped for email.
 */
export const bedrockSpec: ProviderSpec<AIProvider> = {
  id: "bedrock",
  label: "AWS Bedrock",
  selectorEnvVars: ["WRAPS_AI_REGION", "AWS_REGION", "AWS_DEFAULT_REGION"],
  prepare: (env) => {
    const region =
      env.WRAPS_AI_REGION?.trim() ||
      env.AWS_REGION?.trim() ||
      env.AWS_DEFAULT_REGION?.trim();

    if (!region) {
      return fail({
        code: "missing_region",
        message:
          "The Bedrock provider requires a region. Set WRAPS_AI_REGION (or AWS_REGION).",
        envVars: ["WRAPS_AI_REGION", "AWS_REGION"],
      });
    }

    const override = env.AI_MODEL?.trim() || undefined;
    if (override) {
      const check = resolveModelId({
        providerId: "bedrock",
        requested: override,
        fallback: DEFAULT_BEDROCK_MODEL_KEY,
      });
      if (!check.ok) {
        return fail(check.issue);
      }
    }

    return ok(async () => {
      // Dynamic on purpose: this keeps the Bedrock SDK and the AWS credential
      // chain out of the bundle for every deployment that does not select it.
      const [{ createAmazonBedrock }, { fromNodeProviderChain }] =
        await Promise.all([
          import("@ai-sdk/amazon-bedrock"),
          import("@aws-sdk/credential-providers"),
        ]);

      // Built once per provider, not per request — the chain caches and
      // refreshes its own credentials.
      const bedrock = createAmazonBedrock({
        region,
        credentialProvider: fromNodeProviderChain(),
      });

      return {
        id: "bedrock",
        languageModel: (request) => {
          const { modelId, modelKey, capabilities, catalogued, degradedFrom } =
            unwrapModelResolution(
              resolveModelId({
                providerId: "bedrock",
                requested: override,
                preferred: request.model,
                fallback: DEFAULT_BEDROCK_MODEL_KEY,
              })
            );
          const nativeId = applyInferenceProfile(modelId, region, catalogued);

          return {
            model: withBedrockErrors(bedrock(nativeId), region),
            modelId: nativeId,
            modelKey,
            providerId: "bedrock",
            capabilities,
            catalogued,
            degradedFrom,
            // The `bedrock` namespace, NOT `anthropic` — Bedrock silently
            // ignores an anthropic block and reasoning just stops appearing.
            providerOptions: capabilities.has("reasoning")
              ? reasoningOptions(
                  "bedrock",
                  request.reasoning?.effort,
                  capabilities.has("adaptive-reasoning")
                )
              : undefined,
            cache: {
              breakpoint: capabilities.has("prompt-caching")
                ? cacheBreakpoint("bedrock")
                : undefined,
            },
          };
        },
      } satisfies AIProvider;
    });
  },
};
