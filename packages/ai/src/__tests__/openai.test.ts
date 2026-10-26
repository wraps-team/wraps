import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOpenAIReasoningModel } from "../catalog";
import { getAIModel, resetAIProviderCache, validateAIConfig } from "../index";

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn((id: string) => ({ id })),
}));

const createOpenAI = vi.fn(() => {
  const factory = (id: string) => ({ id });
  return factory;
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: unknown[]) => createOpenAI(...(args as [])),
}));

const OPENAI_ENV = {
  WRAPS_AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-test",
};

beforeEach(() => {
  resetAIProviderCache();
  createOpenAI.mockClear();
});

describe("openai provider — configuration", () => {
  it("fails validation without an API key, naming the var to set", () => {
    const [issue] = validateAIConfig({ WRAPS_AI_PROVIDER: "openai" });
    expect(issue?.code).toBe("missing_api_key");
    expect(issue?.envVars).toContain("OPENAI_API_KEY");
  });

  it("never leaks the key value into the issue message", () => {
    const [issue] = validateAIConfig({
      WRAPS_AI_PROVIDER: "openai",
      OPENAI_API_KEY: "   ",
    });
    expect(issue?.message).not.toContain("sk-");
  });

  it("passes validation once the key is present", () => {
    expect(validateAIConfig(OPENAI_ENV)).toEqual([]);
  });

  it("forwards OPENAI_BASE_URL for OpenAI-compatible endpoints", async () => {
    await getAIModel(
      {},
      { ...OPENAI_ENV, OPENAI_BASE_URL: "https://proxy.internal/v1" }
    );
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://proxy.internal/v1",
    });
  });

  it("leaves baseURL undefined so the SDK uses its own default", async () => {
    await getAIModel({}, OPENAI_ENV);
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: undefined,
    });
  });
});

describe("openai provider — model resolution", () => {
  it("uses the OpenAI default rather than the cross-provider claude default", async () => {
    const resolved = await getAIModel({}, OPENAI_ENV);
    expect(resolved.providerId).toBe("openai");
    // claude-sonnet-4 has no OpenAI equivalent, so it must not be attempted.
    expect(resolved.modelId).not.toContain("claude");
  });

  it("maps a catalog key to the bare OpenAI id, not the gateway slug", async () => {
    const resolved = await getAIModel({ model: "gpt-5" }, OPENAI_ENV);
    expect(resolved.modelId).toBe("gpt-5");
  });

  it("rejects at boot a catalog model OpenAI cannot serve", () => {
    const [issue] = validateAIConfig({
      ...OPENAI_ENV,
      AI_MODEL: "grok-code-fast",
    });
    expect(issue?.code).toBe("unsupported_model_for_provider");
    expect(issue?.message).toContain("gateway");
  });

  it("passes an uncatalogued OpenAI id straight through", async () => {
    const resolved = await getAIModel(
      {},
      { ...OPENAI_ENV, AI_MODEL: "gpt-5.2" }
    );
    expect(resolved.modelId).toBe("gpt-5.2");
    expect(resolved.catalogued).toBe(false);
  });
});

describe("openai provider — call options", () => {
  it("sends reasoningEffort and never a token budget", async () => {
    const resolved = await getAIModel(
      { reasoning: { effort: "high" } },
      { ...OPENAI_ENV, AI_MODEL: "gpt-5.2" }
    );
    expect(resolved.providerOptions).toEqual({
      openai: { reasoningEffort: "high" },
    });
    // OpenAI has no budget concept; sending one is silently ignored.
    expect(JSON.stringify(resolved.providerOptions)).not.toContain("budget");
  });

  it("omits reasoning for a non-reasoning model even when asked", async () => {
    // gpt-4o rejects reasoningEffort outright, so over-reporting would break
    // every request rather than degrade.
    const resolved = await getAIModel(
      { reasoning: { effort: "high" } },
      { ...OPENAI_ENV, AI_MODEL: "gpt-4o" }
    );
    expect(resolved.providerOptions).toBeUndefined();
  });

  it("reports prompt-caching but offers no breakpoint, since OpenAI is implicit", async () => {
    const resolved = await getAIModel(
      {},
      { ...OPENAI_ENV, AI_MODEL: "gpt-5.2" }
    );
    expect(resolved.capabilities.has("prompt-caching")).toBe(true);
    expect(resolved.cache.breakpoint).toBeUndefined();
  });
});

describe("isOpenAIReasoningModel — mirrors the SDK's own rule", () => {
  it.each(["o1", "o1-mini", "o3", "o3-mini", "o4-mini", "gpt-5", "gpt-5.2"])(
    "treats %s as a reasoning model",
    (id) => {
      expect(isOpenAIReasoningModel(id)).toBe(true);
    }
  );

  it.each(["gpt-4o", "gpt-4.1", "gpt-5-chat", "gpt-5-chat-latest"])(
    "treats %s as a non-reasoning model",
    (id) => {
      expect(isOpenAIReasoningModel(id)).toBe(false);
    }
  );

  it("handles a gateway-namespaced slug", () => {
    expect(isOpenAIReasoningModel("openai/gpt-5")).toBe(true);
    expect(isOpenAIReasoningModel("openai/gpt-5-chat")).toBe(false);
  });
});

describe("gateway routing to openai picks up the same rule", () => {
  it("sends reasoningEffort for openai/gpt-5 through the gateway", async () => {
    const resolved = await getAIModel(
      { reasoning: { effort: "medium" } },
      { AI_MODEL: "openai/gpt-5" }
    );
    expect(resolved.providerId).toBe("gateway");
    expect(resolved.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
      openai: { reasoningEffort: "medium" },
    });
  });
});
