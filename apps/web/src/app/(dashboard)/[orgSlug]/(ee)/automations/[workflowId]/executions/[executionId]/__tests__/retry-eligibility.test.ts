import { describe, expect, it } from "vitest";
import { canOfferRetry } from "../retry-eligibility";

const steps = [{ id: "step-a" }, { id: "step-b" }];

describe("canOfferRetry", () => {
  it("offers retry for a failed execution under the limit whose step exists", () => {
    expect(canOfferRetry("failed", 0, "step-a", steps, 3)).toBe(true);
  });

  it("hides retry when the error step is not in the snapshot", () => {
    expect(canOfferRetry("failed", 0, "unknown", steps, 3)).toBe(false);
  });

  it("hides retry when errorStepId is null and the snapshot has steps", () => {
    expect(canOfferRetry("failed", 0, null, steps, 3)).toBe(false);
  });

  it("offers retry for a pre-snapshot execution (empty snapshot)", () => {
    expect(canOfferRetry("failed", 0, "unknown", [], 3)).toBe(true);
  });

  it("hides retry for non-failed statuses", () => {
    expect(canOfferRetry("completed", 0, "step-a", steps, 3)).toBe(false);
    expect(canOfferRetry("active", 0, "step-a", steps, 3)).toBe(false);
  });

  it("hides retry once the retry ceiling is reached", () => {
    expect(canOfferRetry("failed", 3, "step-a", steps, 3)).toBe(false);
    expect(canOfferRetry("failed", 2, "step-a", steps, 3)).toBe(true);
  });

  it("treats a null retryCount as zero", () => {
    expect(canOfferRetry("failed", null, "step-a", steps, 3)).toBe(true);
  });
});
