import { describe, expect, it } from "vitest";
import { classifyLookupError } from "../lookup";

describe("classifyLookupError", () => {
  it("classifies expired or unusable role credentials", () => {
    const expired = new Error(
      "The security token included in the request is expired"
    );
    expired.name = "ExpiredTokenException";

    expect(classifyLookupError(expired)).toBe("credentials");
    expect(
      classifyLookupError(
        new Error("CredentialsProviderError: Could not load credentials")
      )
    ).toBe("credentials");
  });

  it("classifies AWS authorization failures separately", () => {
    expect(
      classifyLookupError(
        new Error(
          "User: arn:aws:sts::1:assumed-role/x is not authorized to perform: dynamodb:Query"
        )
      )
    ).toBe("permission");
    expect(classifyLookupError(new Error("AccessDeniedException"))).toBe(
      "permission"
    );
  });

  it("classifies a missing history table or account", () => {
    expect(classifyLookupError(new Error("Requested resource not found"))).toBe(
      "history-unavailable"
    );
    expect(classifyLookupError(new Error("AWS account not found"))).toBe(
      "history-unavailable"
    );
  });

  it("falls back to unknown for anything else", () => {
    expect(classifyLookupError(new Error("socket hang up"))).toBe("unknown");
    expect(classifyLookupError("boom")).toBe("unknown");
  });
});
