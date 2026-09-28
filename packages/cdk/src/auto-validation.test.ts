import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { WrapsEmail } from "./email.js";

/**
 * SES Auto Validation (plan 373) is a CloudFormation property override on
 * the L1 `CfnConfigurationSet` escape hatch — CDK's L2 `ConfigurationSet`
 * construct has no `validationOptions` prop. `events` is omitted from every
 * stack here so no Lambda asset needs bundling for synth.
 */
describe("WrapsEmail — SES Auto Validation", () => {
  it("adds ValidationOptions to the configuration set's SuppressionOptions when autoValidation is set", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    new WrapsEmail(stack, "Email", {
      autoValidation: { enabled: true, threshold: "HIGH" },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties(
      "AWS::SES::ConfigurationSet",
      Match.objectLike({
        SuppressionOptions: Match.objectLike({
          ValidationOptions: {
            ConditionThreshold: {
              ConditionThresholdEnabled: "ENABLED",
              OverallConfidenceThreshold: {
                ConfidenceVerdictThreshold: "HIGH",
              },
            },
          },
        }),
      })
    );
  });

  it("has no ValidationOptions when autoValidation is not set", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    new WrapsEmail(stack, "Email", {});

    const template = Template.fromStack(stack);
    const resources = template.findResources("AWS::SES::ConfigurationSet");
    const configSet = Object.values(resources)[0] as {
      Properties?: { SuppressionOptions?: { ValidationOptions?: unknown } };
    };

    expect(
      configSet.Properties?.SuppressionOptions?.ValidationOptions
    ).toBeUndefined();
  });
});
