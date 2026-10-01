import { describe, expect, it, vi } from "vitest";
import { createSentryReporter, type SentryLike } from "../sentry-reporter";

const makeSdk = (overrides: Partial<SentryLike> = {}) =>
  ({
    captureException: vi.fn(),
    flush: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  }) satisfies SentryLike;

describe("createSentryReporter", () => {
  it("has id sentry", () => {
    expect(createSentryReporter(makeSdk()).id).toBe("sentry");
  });

  it("maps every ErrorEvent field to the right hint key", () => {
    const sdk = makeSdk();
    const error = new Error("x");

    createSentryReporter(sdk).capture({
      error,
      context: { orgId: "o1" },
      tags: { area: "api" },
      severity: "fatal",
      fingerprint: ["a", "b"],
    });

    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      extra: { orgId: "o1" },
      tags: { area: "api" },
      level: "fatal",
      fingerprint: ["a", "b"],
    });
  });

  it("omits hint keys whose source field is undefined", () => {
    const sdk = makeSdk();

    createSentryReporter(sdk).capture({ error: new Error("x") });

    expect(sdk.captureException).toHaveBeenCalledWith(expect.any(Error), {});
  });

  it("passes the same Error instance through", () => {
    const sdk = makeSdk();
    const error = new Error("x");

    createSentryReporter(sdk).capture({ error });

    expect(vi.mocked(sdk.captureException).mock.calls[0]?.[0]).toBe(error);
  });

  it("does not throw when the SDK throws", () => {
    const sdk = makeSdk({
      captureException: vi.fn(() => {
        throw new Error("sdk down");
      }),
    });

    expect(() =>
      createSentryReporter(sdk).capture({ error: new Error("x") })
    ).not.toThrow();
  });

  it("delegates flush with the timeout", async () => {
    const sdk = makeSdk();

    await createSentryReporter(sdk).flush(750);

    expect(sdk.flush).toHaveBeenCalledWith(750);
  });

  it("flush resolves when the SDK flush rejects", async () => {
    const sdk = makeSdk({
      flush: vi.fn(() => Promise.reject(new Error("sdk down"))),
    });

    await expect(createSentryReporter(sdk).flush(100)).resolves.toBeUndefined();
  });
});
