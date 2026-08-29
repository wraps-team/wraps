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
