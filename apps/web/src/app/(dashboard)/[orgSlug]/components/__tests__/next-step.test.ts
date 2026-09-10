import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@/lib/setup-status";
import { type NextStepKind, selectNextStep } from "../next-step";

const baseStatus: SetupStatus = {
  hasAwsAccount: true,
  hasAnyAwsAccounts: true,
  hasPlatformConnection: true,
  hasVerifiedDomain: true,
  hasSentEmail: true,
  hasTemplate: true,
  hasBroadcast: true,
  hasContact: true,
  hasWorkflow: true,
  verifiedDomains: ["example.com"],
  awsRegion: "us-east-1",
  emailCount: 10,
  sandboxStatus: false,
  productionAccessRequest: null,
  awsAccountId: "aws-account-1",
  domainCount: 1,
};

describe("selectNextStep", () => {
  it("selects connect_aws when nothing is connected", () => {
    const step = selectNextStep({
      ...baseStatus,
      hasAwsAccount: false,
      hasAnyAwsAccounts: false,
      hasPlatformConnection: false,
      hasVerifiedDomain: false,
      hasSentEmail: false,
      sandboxStatus: null,
    });
    expect(step.kind).toBe("connect_aws");
  });

  it("selects connect_platform when AWS is connected but the platform is not", () => {
    const step = selectNextStep({
      ...baseStatus,
      hasPlatformConnection: false,
      hasVerifiedDomain: false,
      hasSentEmail: false,
      sandboxStatus: null,
    });
    expect(step.kind).toBe("connect_platform");
  });

  it("selects verify_domain when the platform is connected but no domain is verified", () => {
    const step = selectNextStep({
      ...baseStatus,
      hasVerifiedDomain: false,
      hasSentEmail: false,
      sandboxStatus: null,
    });
    expect(step.kind).toBe("verify_domain");
  });

  it("selects first_send — not leave_sandbox — when the domain is verified, nothing has been sent, and the account is sandboxed", () => {
    // Ordering regression guard: a sandboxed account can still send to
    // verified recipients and the AWS mailbox simulator, so proving the
    // pipeline comes before requesting production access.
    const step = selectNextStep({
      ...baseStatus,
      hasSentEmail: false,
      sandboxStatus: true,
    });
    expect(step.kind).toBe("first_send");
  });

  it("selects leave_sandbox when every step is done but the account is still sandboxed", () => {
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: true,
    });
    expect(step.kind).toBe("leave_sandbox");
  });

  it("selects done when every step is done and the account is out of the sandbox", () => {
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: false,
    });
    expect(step.kind).toBe("done");
  });

  it("selects done — never leave_sandbox — when sandbox status is unknown", () => {
    // sandboxStatus: null means "never scanned", not "in the sandbox". An
    // unknown state must never become an instruction to leave the sandbox.
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: null,
    });
    expect(step.kind).toBe("done");
  });

  it("tells the customer AWS never received their request when the review FAILED", () => {
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: true,
      productionAccessRequest: { status: "FAILED", caseId: null },
    });
    expect(step.kind).toBe("leave_sandbox");
    expect(step.title).toBe("AWS did not receive your request");
    expect(step.description).toContain("submit it again");
  });

  it("still renders a working link when the review was DENIED", () => {
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: true,
      productionAccessRequest: { status: "DENIED", caseId: "case-9876" },
    });
    expect(step.kind).toBe("leave_sandbox");
    expect(step.title).toBe("AWS denied your production access request");
    expect(step.description).toContain("case-9876");
    // Label/destination coherence guard: href is Wraps' own AWS Accounts
    // settings page, not the AWS Support case, so the copy must not
    // instruct the customer to act inside "the support case".
    expect(step.description).not.toContain("support case to appeal");
    // The escape route must survive the copy change: href still resolves.
    expect(step.href("acme")).toContain("acme");
  });

  it("does not promise an AWS-hosted case view when the review is PENDING", () => {
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: true,
      productionAccessRequest: { status: "PENDING", caseId: "case-4321" },
    });
    expect(step.kind).toBe("leave_sandbox");
    expect(step.description).toContain("case-4321");
    // href is Wraps' own settings page, not AWS Support — the CTA label
    // must not claim it goes "to AWS" or "to the case".
    expect(step.ctaLabel.toLowerCase()).not.toContain("case in aws");
    expect(step.href("acme")).toContain("acme");
  });

  it("copy is unchanged, character for character, when no review exists", () => {
    // Regression pin: null must never fall through to a fabricated status.
    const step = selectNextStep({
      ...baseStatus,
      sandboxStatus: true,
      productionAccessRequest: null,
    });
    expect(step.title).toBe("Request SES production access");
    expect(step.description).toBe(
      "Your AWS account can currently send only to verified recipients and the AWS mailbox simulator. Request production access to email anyone."
    );
    expect(step.ctaLabel).toBe("Request production access");
  });

  it("stays done regardless of review status once out of the sandbox", () => {
    // Coupling guard: sandboxStatus alone decides done-ness, never the review.
    for (const status of ["PENDING", "GRANTED", "DENIED", "FAILED"] as const) {
      const step = selectNextStep({
        ...baseStatus,
        sandboxStatus: false,
        productionAccessRequest: { status, caseId: null },
      });
      expect(step.kind).toBe("done");
    }
  });

  it("marks first_send with a send_test_email action and a usable fallback href", () => {
    const step = selectNextStep({
      ...baseStatus,
      hasSentEmail: false,
      sandboxStatus: true,
    });
    expect(step.kind).toBe("first_send");
    expect(step.action).toBe("send_test_email");
    expect(step.href("acme")).toContain("acme");
  });

  it("leaves action undefined for every step other than first_send", () => {
    // Guard against a future edit accidentally turning an unrelated CTA
    // into a send by carrying the action discriminator along with it.
    const statusByKind: Record<
      Exclude<NextStepKind, "first_send">,
      SetupStatus
    > = {
      connect_aws: {
        ...baseStatus,
        hasAwsAccount: false,
        hasAnyAwsAccounts: false,
        hasPlatformConnection: false,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      connect_platform: {
        ...baseStatus,
        hasPlatformConnection: false,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      verify_domain: {
        ...baseStatus,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      leave_sandbox: {
        ...baseStatus,
        sandboxStatus: true,
      },
      done: {
        ...baseStatus,
        sandboxStatus: false,
      },
    };

    for (const kind of Object.keys(statusByKind) as Exclude<
      NextStepKind,
      "first_send"
    >[]) {
      const step = selectNextStep(statusByKind[kind]);
      expect(step.kind).toBe(kind);
      expect(step.action).toBeUndefined();
    }
  });

  it("returns non-empty copy for every possible kind", () => {
    const statusByKind: Record<NextStepKind, SetupStatus> = {
      connect_aws: {
        ...baseStatus,
        hasAwsAccount: false,
        hasAnyAwsAccounts: false,
        hasPlatformConnection: false,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      connect_platform: {
        ...baseStatus,
        hasPlatformConnection: false,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      verify_domain: {
        ...baseStatus,
        hasVerifiedDomain: false,
        hasSentEmail: false,
        sandboxStatus: null,
      },
      first_send: {
        ...baseStatus,
        hasSentEmail: false,
        sandboxStatus: true,
      },
      leave_sandbox: {
        ...baseStatus,
        sandboxStatus: true,
      },
      done: {
        ...baseStatus,
        sandboxStatus: false,
      },
    };

    for (const kind of Object.keys(statusByKind) as NextStepKind[]) {
      const step = selectNextStep(statusByKind[kind]);
      expect(step.kind).toBe(kind);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.ctaLabel.length).toBeGreaterThan(0);
      expect(step.href("acme")).toContain("acme");
    }
  });
});
