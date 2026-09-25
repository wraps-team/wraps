import { describe, expect, it } from "vitest";
import { sesAccountDashboardUrl } from "../ses-console-url";

describe("sesAccountDashboardUrl", () => {
  it("builds the SES Account dashboard URL for us-east-1", () => {
    expect(sesAccountDashboardUrl("us-east-1")).toBe(
      "https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/account"
    );
  });

  it("builds the SES Account dashboard URL for eu-west-1", () => {
    expect(sesAccountDashboardUrl("eu-west-1")).toBe(
      "https://eu-west-1.console.aws.amazon.com/ses/home?region=eu-west-1#/account"
    );
  });
});
