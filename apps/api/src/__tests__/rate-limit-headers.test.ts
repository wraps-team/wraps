import { describe, expect, it } from "vitest";

import {
  formatRateLimitPolicy,
  type RateLimitWindow,
  setRateLimitExceededHeaders,
  setRateLimitHeaders,
} from "../lib/rate-limit-headers";

const sink = () => ({
  headers: {} as Record<string, string | number | undefined>,
});

const window = (over: Partial<RateLimitWindow> = {}): RateLimitWindow => ({
  name: "minute",
  limit: 10,
  remaining: 7,
  windowSeconds: 60,
  ...over,
});

describe("rate-limit headers use the names clients look for", () => {
  it("emits the unprefixed RateLimit fields, not just the legacy X- ones", () => {
    const set = sink();
    setRateLimitHeaders(set, [window({ resetSeconds: 12 })]);

    expect(set.headers["RateLimit-Limit"]).toBe("10");
    expect(set.headers["RateLimit-Remaining"]).toBe("7");
    expect(set.headers["RateLimit-Reset"]).toBe("12");
  });

  it("keeps the X- names so existing integrations do not break", () => {
    const set = sink();
    setRateLimitHeaders(set, [window({ resetSeconds: 12 })]);

    expect(set.headers["X-RateLimit-Limit"]).toBe("10");
    expect(set.headers["X-RateLimit-Remaining"]).toBe("7");
    expect(set.headers["X-RateLimit-Reset"]).toBe("12");
  });

  it("reports the window closest to exhaustion, since that is what paces a caller", () => {
    const set = sink();
    setRateLimitHeaders(set, [
      window({ name: "minute", limit: 10, remaining: 9 }),
      window({ name: "hour", limit: 100, remaining: 2, windowSeconds: 3600 }),
    ]);

    expect(set.headers["RateLimit-Limit"]).toBe("100");
    expect(set.headers["RateLimit-Remaining"]).toBe("2");
  });

  it("still lists every policy, so a caller sees limits it has not hit yet", () => {
    const set = sink();
    setRateLimitHeaders(set, [
      window({ limit: 10, windowSeconds: 60 }),
      window({ name: "hour", limit: 100, remaining: 90, windowSeconds: 3600 }),
    ]);

    expect(set.headers["RateLimit-Policy"]).toBe("10;w=60, 100;w=3600");
  });

  it("never reports negative remaining", () => {
    const set = sink();
    setRateLimitHeaders(set, [window({ remaining: -4 })]);

    expect(set.headers["RateLimit-Remaining"]).toBe("0");
  });

  it("defaults reset to the full window when the caller does not compute one", () => {
    const set = sink();
    setRateLimitHeaders(set, [window({ windowSeconds: 3600 })]);

    expect(set.headers["RateLimit-Reset"]).toBe("3600");
  });

  it("writes nothing at all when there are no windows", () => {
    const set = sink();
    setRateLimitHeaders(set, []);

    expect(Object.keys(set.headers)).toEqual([]);
  });
});

describe("a 429 tells the caller when to come back", () => {
  it("sets Retry-After to the seconds left in the exhausted window", () => {
    const set = sink();
    setRateLimitExceededHeaders(
      set,
      window({ remaining: 0, resetSeconds: 25 })
    );

    expect(set.headers["Retry-After"]).toBe("25");
    expect(set.headers["RateLimit-Reset"]).toBe("25");
    expect(set.headers["RateLimit-Remaining"]).toBe("0");
    expect(set.headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("names the limit that was hit, not another policy", () => {
    const set = sink();
    const minute = window({ limit: 10, remaining: 0, resetSeconds: 30 });
    const hour = window({
      name: "hour",
      limit: 100,
      remaining: 0,
      windowSeconds: 3600,
    });
    setRateLimitExceededHeaders(set, hour, [minute, hour]);

    expect(set.headers["RateLimit-Limit"]).toBe("100");
    expect(set.headers["RateLimit-Policy"]).toBe("10;w=60, 100;w=3600");
  });
});

describe("policy formatting", () => {
  it("renders one policy as limit;w=window", () => {
    expect(formatRateLimitPolicy([window()])).toBe("10;w=60");
  });
});
