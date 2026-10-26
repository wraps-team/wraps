import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAIModel,
  isProviderConfigError,
  resetAIProviderCache,
  validateAIConfig,
} from "../index";

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn((id: string) => ({ id })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (id: string) => ({ id }),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (id: string) => ({ id }),
}));

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: () => (id: string) => ({ id }),
}));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: () => () => Promise.resolve({}),
}));

beforeEach(() => {
  resetAIProviderCache();
});

/**
 * The template AI chat route asks for `grok-code-fast`, a gateway-only model
 * chosen back when the gateway was the only backend. Every provider this
 * package added must still serve that route.
 */
const CHAT_ROUTE_REQUEST = {
  model: "grok-code-fast",
  reasoning: { effort: "medium" },
} as const;

const DIRECT_PROVIDERS = [
  {
    name: "anthropic",
    env: { WRAPS_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" },
    expectedModelId: "claude-sonnet-5-5",
  },
  {
    name: "openai",
    env: { WRAPS_AI_PROVIDER: "openai", OPENAI_API_KEY: "k" },
    expectedModelId: "gpt-5",
  },
  {
    name: "bedrock",
    env: {
      WRAPS_AI_PROVIDER: "bedrock",
      AWS_REGION: "us-east-1",
      WRAPS_DEPLOYMENT_MODE: "self-hosted",
    },
    expectedModelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
  },
] as const;

describe("a route's preferred model degrades instead of failing the request", () => {
  it.each(DIRECT_PROVIDERS)(
    "$name serves the chat route with its own default",
    async ({ env, expectedModelId }) => {
      const resolved = await getAIModel(CHAT_ROUTE_REQUEST, env);
      expect(resolved.modelId).toBe(expectedModelId);
    }
  );

  it.each(DIRECT_PROVIDERS)(
    "$name reports what it dropped, so the swap is not silent",
    async ({ env }) => {
      const resolved = await getAIModel(CHAT_ROUTE_REQUEST, env);
      expect(resolved.degradedFrom).toBe("grok-code-fast");
    }
  );

  it("the gateway serves the preferred model outright, with no degradation", async () => {
    const resolved = await getAIModel(CHAT_ROUTE_REQUEST, {});
    expect(resolved.modelId).toBe("xai/grok-code-fast-1");
    expect(resolved.degradedFrom).toBeUndefined();
  });

  it("substitutes the capabilities of the model actually used, not the one asked for", async () => {
    // Grok has none; claude-sonnet-5.5 has them all. Reporting Grok's empty set
    // here would suppress reasoning and caching on a model that supports both.
    const resolved = await getAIModel(
      CHAT_ROUTE_REQUEST,
      DIRECT_PROVIDERS[0].env
    );
    expect(resolved.capabilities.has("reasoning")).toBe(true);
    expect(resolved.providerOptions).toEqual({
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "medium",
      },
    });
  });

  it("still honours a preferred model the provider CAN serve", async () => {
    const resolved = await getAIModel(
      { model: "gpt-5" },
      { WRAPS_AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }
    );
    expect(resolved.modelId).toBe("gpt-5");
    expect(resolved.degradedFrom).toBeUndefined();
  });
});

describe("AI_MODEL keeps failing loudly — an operator override is not a preference", () => {
  it.each(DIRECT_PROVIDERS)(
    "$name rejects an unserveable AI_MODEL at boot",
    ({ env }) => {
      const [issue] = validateAIConfig({ ...env, AI_MODEL: "grok-code-fast" });
      expect(issue?.code).toBe("unsupported_model_for_provider");
    }
  );

  it("does not let a route preference paper over a bad AI_MODEL", async () => {
    // AI_MODEL outranks the preference, so this must throw rather than quietly
    // fall back to the route's model or to the provider default.
    const error = await getAIModel(CHAT_ROUTE_REQUEST, {
      WRAPS_AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "k",
      AI_MODEL: "gpt-5",
    }).catch((e: unknown) => e);

    expect(isProviderConfigError(error)).toBe(true);
  });
});

describe("request-time model failures are tagged for the routes' 503 branch", () => {
  it("throws a ProviderConfigError carrying the operator-facing issue", async () => {
    const error = await getAIModel(
      {},
      {
        WRAPS_AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "k",
        AI_MODEL: "gpt-5",
      }
    ).catch((e: unknown) => e);

    // A bare Error here lands in the routes' generic 500 path and the message
    // naming the env var to fix never reaches the operator.
    expect(isProviderConfigError(error)).toBe(true);
    if (isProviderConfigError(error)) {
      expect(error.issues[0]?.code).toBe("unsupported_model_for_provider");
      expect(error.issues[0]?.envVars).toContain("AI_MODEL");
    }
  });
});
