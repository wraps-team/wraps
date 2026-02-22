import { describe, expect, it } from "vitest";
import {
  isCredentialError,
  isThrottlingError,
  WorldError,
  wrapAWSError,
} from "../src/errors.js";

describe("isThrottlingError", () => {
  it("detects ThrottlingException", () => {
    const err = Object.assign(new Error("throttled"), {
      name: "ThrottlingException",
    });
    expect(isThrottlingError(err)).toBe(true);
  });

  it("detects ProvisionedThroughputExceededException", () => {
    const err = Object.assign(new Error("capacity"), {
      name: "ProvisionedThroughputExceededException",
    });
    expect(isThrottlingError(err)).toBe(true);
  });

  it("detects RequestLimitExceeded", () => {
    const err = Object.assign(new Error("limit"), {
      name: "RequestLimitExceeded",
    });
    expect(isThrottlingError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isThrottlingError(new Error("oops"))).toBe(false);
    expect(isThrottlingError("string")).toBe(false);
    expect(isThrottlingError(null)).toBe(false);
  });
});

describe("isCredentialError", () => {
  it("detects CredentialsProviderError", () => {
    const err = Object.assign(new Error("no creds"), {
      name: "CredentialsProviderError",
    });
    expect(isCredentialError(err)).toBe(true);
  });

  it("detects AccessDeniedException", () => {
    const err = Object.assign(new Error("denied"), {
      name: "AccessDeniedException",
    });
    expect(isCredentialError(err)).toBe(true);
  });

  it("detects UnrecognizedClientException", () => {
    const err = Object.assign(new Error("unrecognized"), {
      name: "UnrecognizedClientException",
    });
    expect(isCredentialError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isCredentialError(new Error("oops"))).toBe(false);
  });
});

describe("wrapAWSError", () => {
  it("throws WorldError with THROTTLED code for throttling errors", () => {
    const cause = Object.assign(new Error("throttled"), {
      name: "ThrottlingException",
    });
    expect(() => wrapAWSError(cause, "runs.get")).toThrow(WorldError);
    try {
      wrapAWSError(cause, "runs.get");
    } catch (e) {
      expect(e).toBeInstanceOf(WorldError);
      expect((e as WorldError).code).toBe("THROTTLED");
      expect((e as WorldError).message).toContain("runs.get");
      expect((e as WorldError).cause).toBe(cause);
    }
  });

  it("throws WorldError with CREDENTIALS code for credential errors", () => {
    const cause = Object.assign(new Error("denied"), {
      name: "AccessDeniedException",
    });
    try {
      wrapAWSError(cause, "steps.list");
    } catch (e) {
      expect(e).toBeInstanceOf(WorldError);
      expect((e as WorldError).code).toBe("CREDENTIALS");
      expect((e as WorldError).message).toContain("steps.list");
    }
  });

  it("re-throws unknown errors as-is", () => {
    const cause = new Error("something else");
    expect(() => wrapAWSError(cause, "hooks.get")).toThrow(cause);
  });
});
