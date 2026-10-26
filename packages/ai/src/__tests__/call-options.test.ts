import { describe, expect, it } from "vitest";
import {
  cacheBreakpoint,
  mergeProviderOptions,
  reasoningOptions,
} from "../call-options";

describe("reasoningOptions", () => {
  it("uses the anthropic thinking shape with a token budget", () => {
    expect(reasoningOptions("anthropic", "medium")).toEqual({
      anthropic: { thinking: { type: "enabled", budgetTokens: 10_000 } },
    });
  });

  it("keeps medium at 10_000 so extraction is a no-op vs the old hardcoded value", () => {
    const options = reasoningOptions("anthropic", "medium") as {
      anthropic: { thinking: { budgetTokens: number } };
    };
    expect(options.anthropic.thinking.budgetTokens).toBe(10_000);
  });

  it("uses the bedrock namespace, not anthropic, for Bedrock", () => {
    const options = reasoningOptions("bedrock", "medium");
    // Bedrock silently ignores an `anthropic` block — no error, reasoning just
    // stops. This assertion is the only thing that catches that regression.
    expect(options).not.toHaveProperty("anthropic");
    expect(options).toEqual({
      bedrock: { reasoningConfig: { type: "enabled", budgetTokens: 10_000 } },
    });
  });

  it("sends adaptive thinking and never a budget to 4.6+ models", () => {
    // Claude 4.6+ answers a thinking budget with a 400.
    const anthropic = reasoningOptions("anthropic", "high", true);
    const bedrock = reasoningOptions("bedrock", "high", true);
    expect(anthropic).toEqual({
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "high",
      },
    });
    expect(bedrock).toEqual({
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          maxReasoningEffort: "high",
          display: "summarized",
        },
      },
    });
    expect(JSON.stringify([anthropic, bedrock])).not.toContain("budgetTokens");
  });

  it("sends effort and never a token budget to OpenAI", () => {
    const options = reasoningOptions("openai", "high");
    expect(options).toEqual({ openai: { reasoningEffort: "high" } });
    // OpenAI has no budget concept; passing one is silently dropped.
    expect(JSON.stringify(options)).not.toContain("budgetTokens");
  });

  it("maps each effort level to a distinct budget", () => {
    const budgetOf = (effort: "low" | "medium" | "high") =>
      (
        reasoningOptions("anthropic", effort) as {
          anthropic: { thinking: { budgetTokens: number } };
        }
      ).anthropic.thinking.budgetTokens;

    expect(budgetOf("low")).toBeLessThan(budgetOf("medium"));
    expect(budgetOf("medium")).toBeLessThan(budgetOf("high"));
  });

  it("returns undefined when the namespace has no reasoning support", () => {
    expect(reasoningOptions(undefined, "medium")).toBeUndefined();
  });

  it("returns undefined when no reasoning was requested", () => {
    expect(reasoningOptions("anthropic", undefined)).toBeUndefined();
  });
});

describe("cacheBreakpoint", () => {
  it("uses cacheControl for anthropic", () => {
    expect(cacheBreakpoint("anthropic")).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });

  it("uses cachePoint for bedrock", () => {
    expect(cacheBreakpoint("bedrock")).toEqual({
      bedrock: { cachePoint: { type: "default" } },
    });
  });

  it("returns undefined for openai, which caches implicitly", () => {
    // Not a gap: OpenAI caches prompts over ~1024 tokens with no marker.
    // Explicit breakpoints need @ai-sdk/openai@4.0.11+ (AI SDK v6).
    expect(cacheBreakpoint("openai")).toBeUndefined();
  });

  it("returns undefined for an unmapped namespace", () => {
    expect(cacheBreakpoint(undefined)).toBeUndefined();
  });
});

describe("mergeProviderOptions", () => {
  it("keeps both keys when two sources share a namespace", () => {
    // A top-level spread drops reasoningEffort here, and reasoning silently
    // stops appearing — no error, nothing in the logs.
    expect(
      mergeProviderOptions(
        { openai: { reasoningEffort: "medium" } },
        { openai: { promptCacheKey: "org-123" } }
      )
    ).toEqual({
      openai: { reasoningEffort: "medium", promptCacheKey: "org-123" },
    });
  });

  it("merges disjoint namespaces side by side", () => {
    expect(
      mergeProviderOptions(
        { anthropic: { thinking: { type: "enabled" } } },
        { openai: { promptCacheKey: "k" } }
      )
    ).toEqual({
      anthropic: { thinking: { type: "enabled" } },
      openai: { promptCacheKey: "k" },
    });
  });

  it("lets a later source win on a genuine key collision", () => {
    expect(
      mergeProviderOptions(
        { openai: { reasoningEffort: "low" } },
        { openai: { reasoningEffort: "high" } }
      )
    ).toEqual({ openai: { reasoningEffort: "high" } });
  });

  it("skips undefined sources", () => {
    expect(
      mergeProviderOptions(undefined, { openai: { reasoningEffort: "low" } })
    ).toEqual({ openai: { reasoningEffort: "low" } });
  });

  it("returns undefined rather than an empty block when there is nothing to send", () => {
    expect(mergeProviderOptions(undefined, undefined)).toBeUndefined();
  });
});
