import { beforeEach, describe, expect, it, vi } from "vitest";

const { PostHogCtor } = vi.hoisted(() => ({ PostHogCtor: vi.fn() }));
vi.mock("posthog-node", () => ({ PostHog: PostHogCtor }));

import { getPostHogClient, resetPostHogClientForTests } from "../posthog";

function enabledEnv() {
  vi.stubEnv("VITEST", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CI", undefined);
  vi.stubEnv("JEST_WORKER_ID", undefined);
  vi.stubEnv("POSTHOG_DISABLED", undefined);
  vi.stubEnv("POSTHOG_KEY", "phc_server");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", undefined);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", undefined);
}

describe("getPostHogClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    PostHogCtor.mockClear();
    resetPostHogClientForTests();
  });

  it.each([
    ["VITEST", "true"],
    ["JEST_WORKER_ID", "1"],
    ["NODE_ENV", "development"],
    ["CI", "true"],
    ["POSTHOG_DISABLED", "true"],
  ])("does not construct a client when %s=%s", (name, value) => {
    enabledEnv();
    vi.stubEnv(name, value);
    const client = getPostHogClient();
    expect(client).toBeDefined();
    expect(PostHogCtor).not.toHaveBeenCalled();
  });

  describe("key chain", () => {
    it("prefers POSTHOG_KEY over NEXT_PUBLIC_POSTHOG_KEY", () => {
      enabledEnv();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_public");
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[0]).toBe("phc_server");
    });

    it("uses NEXT_PUBLIC_POSTHOG_KEY alone", () => {
      enabledEnv();
      vi.stubEnv("POSTHOG_KEY", undefined);
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_public");
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[0]).toBe("phc_public");
    });

    it("falls back to NEXT_PUBLIC_POSTHOG_KEY when POSTHOG_KEY is empty", () => {
      enabledEnv();
      vi.stubEnv("POSTHOG_KEY", "");
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_public");
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[0]).toBe("phc_public");
    });

    it("returns a noop when no key is set", () => {
      enabledEnv();
      vi.stubEnv("POSTHOG_KEY", undefined);
      expect(getPostHogClient()).toBeDefined();
      expect(PostHogCtor).not.toHaveBeenCalled();
    });
  });

  describe("host resolution", () => {
    it("replaces a relative proxy path with the full PostHog URL", () => {
      enabledEnv();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "/ingest");
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[1]?.host).toBe(
        "https://us.i.posthog.com"
      );
    });

    it("passes an absolute host through", () => {
      enabledEnv();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[1]?.host).toBe(
        "https://eu.i.posthog.com"
      );
    });

    it("defaults to the US host", () => {
      enabledEnv();
      getPostHogClient();
      expect(PostHogCtor.mock.calls[0]?.[1]?.host).toBe(
        "https://us.i.posthog.com"
      );
    });
  });

  it("noop client implements every method consumers call", async () => {
    enabledEnv();
    vi.stubEnv("POSTHOG_DISABLED", "true");
    const client = getPostHogClient();
    for (const method of [
      "capture",
      "captureException",
      "identify",
      "groupIdentify",
    ] as const) {
      expect(typeof client[method]).toBe("function");
    }
    expect(() => client.capture({ distinctId: "x", event: "e" })).not.toThrow();
    expect(() => client.captureException(new Error("x"))).not.toThrow();
    expect(() => client.identify({ distinctId: "x" })).not.toThrow();
    expect(() =>
      client.groupIdentify({ groupType: "org", groupKey: "o" })
    ).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
    await expect(client.shutdown()).resolves.toBeUndefined();
  });

  it("returns the same client on repeated calls", () => {
    enabledEnv();
    const first = getPostHogClient();
    const second = getPostHogClient();
    expect(second).toBe(first);
    expect(PostHogCtor).toHaveBeenCalledTimes(1);
  });

  it("constructs with flushAt 1 and flushInterval 0", () => {
    enabledEnv();
    getPostHogClient();
    expect(PostHogCtor.mock.calls[0]?.[1]).toMatchObject({
      flushAt: 1,
      flushInterval: 0,
    });
  });
});
