import { describe, expect, it } from "vitest";
import { buildSuppressionOptions } from "./ses-suppression.js";

describe("buildSuppressionOptions", () => {
  it("omits ValidationOptions and copies the reasons when autoValidation is undefined", () => {
    const result = buildSuppressionOptions(["BOUNCE", "COMPLAINT"], undefined);

    expect(result).toEqual({ SuppressedReasons: ["BOUNCE", "COMPLAINT"] });
    expect(result.ValidationOptions).toBeUndefined();
  });

  it("enables validation at MANAGED when { enabled: true } is given with no threshold", () => {
    const result = buildSuppressionOptions(["BOUNCE"], { enabled: true });

    expect(result).toEqual({
      SuppressedReasons: ["BOUNCE"],
      ValidationOptions: {
        ConditionThreshold: {
          ConditionThresholdEnabled: "ENABLED",
          OverallConfidenceThreshold: { ConfidenceVerdictThreshold: "MANAGED" },
        },
      },
    });
  });

  it("uses the given threshold when { enabled: true, threshold: 'HIGH' } is given", () => {
    const result = buildSuppressionOptions(["BOUNCE", "COMPLAINT"], {
      enabled: true,
      threshold: "HIGH",
    });

    expect(result.ValidationOptions).toEqual({
      ConditionThreshold: {
        ConditionThresholdEnabled: "ENABLED",
        OverallConfidenceThreshold: { ConfidenceVerdictThreshold: "HIGH" },
      },
    });
  });

  it("disables validation with no threshold object when { enabled: false } is given", () => {
    const result = buildSuppressionOptions(["BOUNCE"], { enabled: false });

    expect(result).toEqual({
      SuppressedReasons: ["BOUNCE"],
      ValidationOptions: {
        ConditionThreshold: { ConditionThresholdEnabled: "DISABLED" },
      },
    });
  });

  it("keeps an empty reasons array empty — never invents reasons", () => {
    const result = buildSuppressionOptions([], { enabled: true });

    expect(result.SuppressedReasons).toEqual([]);
  });

  it("returns a copy of the reasons array — mutating the result leaves the input unchanged", () => {
    const input: Array<"BOUNCE" | "COMPLAINT"> = ["BOUNCE"];
    const result = buildSuppressionOptions(input, undefined);

    result.SuppressedReasons.push("COMPLAINT");

    expect(input).toEqual(["BOUNCE"]);
  });
});
