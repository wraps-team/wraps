import { describe, expect, it } from "vitest";
import {
  CONSOLE_ACCESS_STACK_NAME,
  CONSOLE_ACCESS_TEMPLATE_URL,
  EMAIL_INFRASTRUCTURE_TEMPLATE_URL,
  parseStackExternalId,
  resolveCloudFormationRepairRoute,
} from "../cloudformation-url";

// An account deployed from cloudformation/wraps-email-infrastructure.yaml has
// exactly one stack, and it is not named wraps-console-access. The repair card
// used to name that stack anyway, so its "Open CloudFormation stacks" button
// opened a stack list filtered to a name the customer's account has never had.
const INFRA_STACK_EXTERNAL_ID =
  "arn:aws:cloudformation:us-east-2:313932316635:stack/wraps-email-infrastructure/8b93b1a0-ad2a-11f1-9299-0ae908d7081d";

describe("parseStackExternalId", () => {
  it("reads the stack name and region off a stack-ID External ID", () => {
    expect(parseStackExternalId(INFRA_STACK_EXTERNAL_ID)).toEqual({
      stackName: "wraps-email-infrastructure",
      region: "us-east-2",
    });
  });

  it("reads a stack the customer renamed at create time", () => {
    expect(
      parseStackExternalId(
        "arn:aws:cloudformation:eu-west-1:111122223333:stack/acme-email/8b93b1a0-ad2a-11f1-9299-0ae908d7081d"
      )
    ).toEqual({ stackName: "acme-email", region: "eu-west-1" });
  });

  it("returns null for a server-minted External ID", () => {
    expect(parseStackExternalId("wraps_0123456789abcdef")).toBeNull();
  });

  it("returns null for an ARN that is not a CloudFormation stack", () => {
    expect(
      parseStackExternalId(
        "arn:aws:iam::111122223333:role/wraps-console-access-role"
      )
    ).toBeNull();
  });
});

describe("resolveCloudFormationRepairRoute", () => {
  it("sends an infrastructure-stack account to its own stack and template", () => {
    const route = resolveCloudFormationRepairRoute(
      INFRA_STACK_EXTERNAL_ID,
      "us-east-1"
    );

    expect(route.identified).toBe(true);
    expect(route.stackName).toBe("wraps-email-infrastructure");
    expect(route.templateUrl).toBe(EMAIL_INFRASTRUCTURE_TEMPLATE_URL);
    expect(route.stacksConsoleUrl).toContain(
      "filteringText=wraps-email-infrastructure"
    );
  });

  it("prefers the stack's own region over the account's", () => {
    // awsAccount.region is where Wraps sends from; the stack can live
    // elsewhere, and a stack list opened in the wrong region is empty.
    const route = resolveCloudFormationRepairRoute(
      INFRA_STACK_EXTERNAL_ID,
      "us-east-1"
    );

    expect(route.stacksConsoleUrl).toContain("region=us-east-2");
    expect(route.stacksConsoleUrl).not.toContain("region=us-east-1");
  });

  it("never offers the console-access template to an infrastructure stack", () => {
    // Update -> Replace existing template with a template that declares only
    // the role would delete every SES, EventBridge, DynamoDB and Lambda
    // resource the stack owns.
    const route = resolveCloudFormationRepairRoute(
      INFRA_STACK_EXTERNAL_ID,
      "us-east-1"
    );

    expect(route.templateUrl).not.toBe(CONSOLE_ACCESS_TEMPLATE_URL);
  });

  it("falls back to the console-access stack when the External ID says nothing", () => {
    const route = resolveCloudFormationRepairRoute(
      "wraps_0123456789abcdef",
      "us-east-1"
    );

    expect(route.identified).toBe(false);
    expect(route.stackName).toBe(CONSOLE_ACCESS_STACK_NAME);
    expect(route.templateUrl).toBe(CONSOLE_ACCESS_TEMPLATE_URL);
    expect(route.stacksConsoleUrl).toContain("region=us-east-1");
  });

  it("never builds a quick-create link", () => {
    // Quick-create can only create: the stack name must be unique per region
    // and the template declares a fixed RoleName, so a connected account gets
    // AlreadyExists.
    for (const externalId of [INFRA_STACK_EXTERNAL_ID, "wraps_abc"]) {
      expect(
        resolveCloudFormationRepairRoute(externalId, "us-east-1")
          .stacksConsoleUrl
      ).not.toContain("stacks/create/review");
    }
  });
});
