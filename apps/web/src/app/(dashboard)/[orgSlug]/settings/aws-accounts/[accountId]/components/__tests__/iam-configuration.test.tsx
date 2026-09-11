/**
 * IAM Role Configuration card.
 *
 * Regression coverage for the card sending an infrastructure-stack customer to
 * a stack they do not have. `cloudformation/wraps-email-infrastructure.yaml`
 * creates `wraps-console-access-role` itself, so those accounts have one stack
 * — `wraps-email-infrastructure` — and no `wraps-console-access` stack at all.
 * The card named the latter regardless: its button opened a stack list
 * filtered to a name that matched nothing, and the template URL beside it, had
 * anyone pasted it into the stack they do have, would have deleted every SES,
 * EventBridge, DynamoDB and Lambda resource in it.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { IAMConfiguration } from "../iam-configuration";

const CONSOLE_ACCESS_TEMPLATE =
  "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-console-access-role.yaml";
const INFRASTRUCTURE_TEMPLATE =
  "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-email-infrastructure.yaml";

function makeAccount(externalId: string, region = "us-east-1") {
  return {
    id: "acct-1",
    name: "Production",
    accountId: "313932316635",
    region,
    externalId,
  } as unknown as InferSelectModel<typeof awsAccount>;
}

/** The stack ID the infrastructure template hands back as the External ID. */
const infraAccount = makeAccount(
  "arn:aws:cloudformation:us-east-2:313932316635:stack/wraps-email-infrastructure/8b93b1a0-ad2a-11f1-9299-0ae908d7081d"
);

const mintedAccount = makeAccount("wraps_0123456789abcdef");

function stacksLink() {
  return screen.getByRole("link", { name: /stack|cloudformation/i });
}

afterEach(cleanup);

describe("IAMConfiguration for an infrastructure-stack account", () => {
  it("names the stack the account actually has", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={false} />);

    expect(screen.getByText("wraps-email-infrastructure")).toBeInTheDocument();
    // The role name still appears — every account has a role called
    // wraps-console-access-role. The *stack* of that name is what these
    // accounts do not have.
    expect(screen.queryByText("wraps-console-access")).not.toBeInTheDocument();
  });

  it("filters the stack list by that stack, in the stack's own region", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={false} />);

    const href = stacksLink().getAttribute("href") ?? "";
    expect(href).toContain("filteringText=wraps-email-infrastructure");
    // The account sends from us-east-1; the stack lives in us-east-2.
    expect(href).toContain("region=us-east-2");
  });

  it("offers the infrastructure template, never the console-access one", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={false} />);

    expect(screen.getByText(INFRASTRUCTURE_TEMPLATE)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CONSOLE_ACCESS_TEMPLATE);
  });

  it("drops the CLI section, which claims there is no stack to update", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={false} />);

    expect(document.body.textContent).not.toContain(
      "There is no stack to update"
    );
  });
});

describe("IAMConfiguration for a server-minted External ID", () => {
  it("keeps the console-access stack and both routes", () => {
    render(<IAMConfiguration account={mintedAccount} selfHosted={false} />);

    expect(screen.getByText("wraps-console-access")).toBeInTheDocument();
    expect(screen.getByText(CONSOLE_ACCESS_TEMPLATE)).toBeInTheDocument();
    expect(document.body.textContent).toContain("There is no stack to update");
  });
});

describe("IAMConfiguration re-check control", () => {
  it("offers a re-check, because the banner reads a stored column", () => {
    // The stale-policy banner renders off aws_account.consolePolicyVersion,
    // which only the hourly sweep writes. Without this the only feedback on a
    // successful repair is the banner eventually vanishing.
    render(<IAMConfiguration account={infraAccount} selfHosted={false} />);

    expect(screen.getByRole("button", { name: /check again/i })).toBeEnabled();
  });

  it("withholds it when self-hosted, like every other platform route", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={true} />);

    expect(
      screen.queryByRole("button", { name: /check again/i })
    ).not.toBeInTheDocument();
  });
});

describe("IAMConfiguration when self-hosted", () => {
  it("shows the External ID and no CloudFormation route at all", () => {
    render(<IAMConfiguration account={infraAccount} selfHosted={true} />);

    expect(screen.getByText(infraAccount.externalId)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("console.aws.amazon.com");
    expect(document.body.innerHTML).not.toContain("wraps-assets");
  });
});
