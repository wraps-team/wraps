import { describe, expect, it } from "vitest";
import { classifyCloudWatchError } from "../cloudwatch";

describe("classifyCloudWatchError", () => {
  it("classifies by error name when the SDK sets a real one", () => {
    const err = new Error("boom");
    err.name = "AccessDeniedException";
    expect(classifyCloudWatchError(err)).toBe("access_denied");
  });

  it("classifies by message when the SDK reports name 'Error'", () => {
    // AWS SDK v3 frequently returns name: "Error" with the real exception only
    // in the message. Name-only matching silently degrades to "unknown" here.
    const err = new Error(
      "User is not authorized to perform: cloudwatch:GetMetricData"
    );
    expect(err.name).toBe("Error");
    expect(classifyCloudWatchError(err)).toBe("access_denied");
  });

  it("separates expired credentials from permission failures", () => {
    const expired = new Error("ExpiredToken: The security token has expired");
    expect(classifyCloudWatchError(expired)).toBe("credentials");

    const denied = new Error("AccessDenied");
    expect(classifyCloudWatchError(denied)).toBe("access_denied");
    expect(classifyCloudWatchError(expired)).not.toBe(
      classifyCloudWatchError(denied)
    );
  });

  it("identifies throttling so callers can back off rather than show zero", () => {
    const err = new Error("Rate exceeded");
    expect(classifyCloudWatchError(err)).toBe("throttled");
  });

  it("identifies malformed requests", () => {
    const err = new Error("InvalidParameterCombination: bad period");
    expect(classifyCloudWatchError(err)).toBe("invalid_request");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(classifyCloudWatchError(new Error("socket hang up"))).toBe(
      "unknown"
    );
    expect(classifyCloudWatchError("not an error")).toBe("unknown");
    expect(classifyCloudWatchError(undefined)).toBe("unknown");
  });

  it("reads the kind back off an already-classified error", () => {
    const tagged = Object.assign(new Error("wrapped"), {
      cloudWatchErrorKind: "throttled" as const,
    });
    // No pattern in the message — only the tag can supply this.
    expect(classifyCloudWatchError(tagged)).toBe("throttled");
  });
});
