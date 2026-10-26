import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAIModel, resetAIProviderCache, validateAIConfig } from "../index";
import { _internalUpstreamNamespace as upstreamNamespace } from "../providers/gateway";

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn((id: string) => ({ id })),
}));

beforeEach(() => {
  resetAIProviderCache();
});

describe("gateway provider — model resolution", () => {
  it("defaults to the catalog's claude-sonnet-5.5 gateway slug", async () => {
    const resolved = await getAIModel({}, {});
    expect(resolved.providerId).toBe("gateway");
    expect(resolved.modelId).toBe("anthropic/claude-sonnet-5.5");
    expect(resolved.modelKey).toBe("claude-sonnet-5.5");
    expect(resolved.catalogued).toBe(true);
  });

  it("lets the call site pick a different catalog default", async () => {
    const resolved = await getAIModel({ model: "grok-code-fast" }, {});
    expect(resolved.modelId).toBe("xai/grok-code-fast-1");
  });

  it("lets AI_MODEL override the call site, matching the old precedence", async () => {
    const resolved = await getAIModel(
      { model: "grok-code-fast" },
      { AI_MODEL: "claude-sonnet-4" }
    );
    expect(resolved.modelId).toBe("anthropic/claude-sonnet-4");
  });

  it("resolves a catalog key that previously 400'd as a bare gateway slug", async () => {
    // The self-hosted docs told operators to set AI_MODEL=claude-sonnet-4,
    // which the gateway rejects because it needs a namespaced slug.
    const resolved = await getAIModel({}, { AI_MODEL: "claude-sonnet-4" });
    expect(resolved.modelId).toBe("anthropic/claude-sonnet-4");
  });

  it("passes an uncatalogued native slug straight through", async () => {
    const resolved = await getAIModel({}, { AI_MODEL: "google/gemini-3-pro" });
    expect(resolved.modelId).toBe("google/gemini-3-pro");
    expect(resolved.catalogued).toBe(false);
  });

  it("infers vision for an uncatalogued gpt slug", async () => {
    const resolved = await getAIModel({}, { AI_MODEL: "openai/gpt-4.1" });
    expect(resolved.capabilities.has("vision")).toBe(true);
  });
});

describe("gateway provider — provider options", () => {
  it("sends adaptive anthropic thinking when routed to a 4.6+ claude model", async () => {
    const resolved = await getAIModel({ reasoning: { effort: "medium" } }, {});
    expect(resolved.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "medium",
      },
    });
  });

  it("requires zero data retention even when nothing else is sent", async () => {
    const resolved = await getAIModel({ model: "grok-code-fast" }, {});
    expect(resolved.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
  });

  it("sends NO anthropic options when routed to xai — the bug this fixes", async () => {
    // Before this package, every route sent providerOptions.anthropic.thinking
    // unconditionally, including on this route whose default model is Grok.
    const resolved = await getAIModel(
      { model: "grok-code-fast", reasoning: { effort: "medium" } },
      {}
    );
    expect(resolved.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
  });

  it("derives the option namespace from the routed upstream, not the provider", () => {
    // The gateway forwards providerOptions verbatim to the upstream, so the
    // namespace has to follow the slug. Asserted directly because whether a
    // given slug *gets* options also depends on its capabilities.
    expect(upstreamNamespace("openai/gpt-5")).toBe("openai");
    expect(upstreamNamespace("anthropic/claude-sonnet-4")).toBe("anthropic");
    expect(upstreamNamespace("xai/grok-code-fast-1")).toBeUndefined();
    expect(upstreamNamespace("google/gemini-3-pro")).toBeUndefined();
  });

  it("withholds reasoning options from an uncatalogued model", async () => {
    // Capability inference is deliberately conservative: gpt-4o is not a
    // reasoning model, and OpenAI errors on reasoningEffort for models that
    // do not support it. Catalogued OpenAI models land in A3.
    const resolved = await getAIModel(
      { reasoning: { effort: "high" } },
      { AI_MODEL: "openai/gpt-4o" }
    );
    expect(resolved.catalogued).toBe(false);
    expect(resolved.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
  });

  it("still grants reasoning to an uncatalogued claude slug", async () => {
    const resolved = await getAIModel(
      { reasoning: { effort: "low" } },
      { AI_MODEL: "anthropic/claude-opus-4-1" }
    );
    expect(resolved.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
      anthropic: { thinking: { type: "enabled", budgetTokens: 4000 } },
    });
  });

  it("sends adaptive thinking, never a budget, to an uncatalogued 4.6+ claude slug", async () => {
    const resolved = await getAIModel(
      { reasoning: { effort: "low" } },
      { AI_MODEL: "anthropic/claude-opus-5.5" }
    );
    expect(resolved.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "low",
      },
    });
  });

  it("omits reasoning options when the caller did not ask for reasoning", async () => {
    const resolved = await getAIModel({}, {});
    expect(resolved.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
  });

  it("offers an anthropic cache breakpoint but none for xai", async () => {
    const claude = await getAIModel({}, {});
    expect(claude.cache.breakpoint).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });

    const grok = await getAIModel({ model: "grok-code-fast" }, {});
    expect(grok.cache.breakpoint).toBeUndefined();
  });
});

describe("provider caching", () => {
  it("does not serve a provider pinned to a stale AI_MODEL", async () => {
    // The provider closes over AI_MODEL at prepare() time, so caching on the
    // selector alone would return the first model forever.
    const first = await getAIModel(
      {},
      { AI_MODEL: "anthropic/claude-sonnet-4" }
    );
    const second = await getAIModel({}, { AI_MODEL: "xai/grok-code-fast-1" });

    expect(first.modelId).toBe("anthropic/claude-sonnet-4");
    expect(second.modelId).toBe("xai/grok-code-fast-1");
  });

  it("reports capabilities for the model actually selected", async () => {
    const claude = await getAIModel(
      {},
      { AI_MODEL: "anthropic/claude-sonnet-4" }
    );
    const grok = await getAIModel({}, { AI_MODEL: "xai/grok-code-fast-1" });

    expect(claude.capabilities.has("vision")).toBe(true);
    expect(grok.capabilities.has("vision")).toBe(false);
  });
});

describe("validateAIConfig", () => {
  it("passes when nothing is configured, since gateway self-resolves auth", () => {
    expect(validateAIConfig({})).toEqual([]);
  });

  it("passes for a valid explicit selection", () => {
    expect(validateAIConfig({ WRAPS_AI_PROVIDER: "gateway" })).toEqual([]);
  });

  it("reports an unknown provider id and lists the real ones", () => {
    const [issue] = validateAIConfig({ WRAPS_AI_PROVIDER: "definitely-fake" });
    expect(issue?.code).toBe("unknown_provider");
    expect(issue?.envVars).toContain("WRAPS_AI_PROVIDER");
    expect(issue?.message).toContain("gateway");
    expect(issue?.message).toContain("openai");
  });

  it("rejects a catalog model the gateway cannot serve, at boot", () => {
    // Guards the promise that an unsupported combination fails at boot rather
    // than at request time. No catalog entry is gateway-less today, so this
    // asserts the passthrough branch stays permissive instead.
    expect(validateAIConfig({ AI_MODEL: "anthropic/claude-sonnet-4" })).toEqual(
      []
    );
  });

  it("never throws on a broken config", () => {
    expect(() =>
      validateAIConfig({ WRAPS_AI_PROVIDER: "definitely-not-real" })
    ).not.toThrow();
  });
});

describe("noop provider", () => {
  it("resolves without credentials", async () => {
    const resolved = await getAIModel({}, { WRAPS_AI_PROVIDER: "noop" });
    expect(resolved.providerId).toBe("noop");
  });

  it("throws loudly if a test actually tries to generate with it", async () => {
    const resolved = await getAIModel({}, { WRAPS_AI_PROVIDER: "noop" });
    expect(() => JSON.stringify(resolved.model)).toThrow(
      /noop AI provider cannot generate/
    );
  });
});
