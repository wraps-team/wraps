import {
  PutConfigurationSetSuppressionOptionsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { applyConfigSetAutoValidation } from "../auto-validation.js";

const sesClientMock = mockClient(SESv2Client);

/** A stub pulumi.Output whose .apply() resolves synchronously. */
function stubOutput(value: string) {
  return { apply: (fn: (v: string) => void) => fn(value) } as never;
}

describe("applyConfigSetAutoValidation", () => {
  beforeEach(() => {
    sesClientMock.reset();
  });

  it("sends one Put carrying both SuppressedReasons and ValidationOptions", async () => {
    sesClientMock.on(PutConfigurationSetSuppressionOptionsCommand).resolves({});

    await applyConfigSetAutoValidation({
      configSetName: stubOutput("wraps-email-example-com"),
      region: "us-east-1",
      suppressedReasons: ["BOUNCE", "COMPLAINT"],
      autoValidation: { enabled: true, threshold: "HIGH" },
    });

    const calls = sesClientMock.commandCalls(
      PutConfigurationSetSuppressionOptionsCommand
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toEqual({
      ConfigurationSetName: "wraps-email-example-com",
      SuppressedReasons: ["BOUNCE", "COMPLAINT"],
      ValidationOptions: {
        ConditionThreshold: {
          ConditionThresholdEnabled: "ENABLED",
          OverallConfidenceThreshold: { ConfidenceVerdictThreshold: "HIGH" },
        },
      },
    });
  });

  it("defaults the threshold to MANAGED when none is given", async () => {
    sesClientMock.on(PutConfigurationSetSuppressionOptionsCommand).resolves({});

    await applyConfigSetAutoValidation({
      configSetName: stubOutput("wraps-email-example-com"),
      region: "us-east-1",
      suppressedReasons: ["BOUNCE"],
      autoValidation: { enabled: true },
    });

    const calls = sesClientMock.commandCalls(
      PutConfigurationSetSuppressionOptionsCommand
    );
    expect(calls[0].args[0].input).toMatchObject({
      ValidationOptions: {
        ConditionThreshold: {
          OverallConfidenceThreshold: { ConfidenceVerdictThreshold: "MANAGED" },
        },
      },
    });
  });

  it("throws a descriptive error when the Put fails", async () => {
    sesClientMock
      .on(PutConfigurationSetSuppressionOptionsCommand)
      .rejects(new Error("BadRequestException"));

    await expect(
      applyConfigSetAutoValidation({
        configSetName: stubOutput("wraps-email-example-com"),
        region: "us-east-1",
        suppressedReasons: ["BOUNCE"],
        autoValidation: { enabled: true },
      })
    ).rejects.toThrow("wraps-email-example-com");
  });
});
