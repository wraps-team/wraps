import type { SetupStatus } from "@/lib/setup-status";

export type NextStepKind =
  | "connect_aws"
  | "connect_platform"
  | "verify_domain"
  | "leave_sandbox"
  | "first_send"
  | "done";

export type NextStep = {
  kind: NextStepKind;
  /** Static, always-correct copy. Shown verbatim when generation is off or fails. */
  title: string;
  description: string;
  ctaLabel: string;
  href: (orgSlug: string) => string;
  /**
   * When set, the CTA performs this action instead of navigating. `href`
   * remains as the fallback destination for any surface that can only link.
   */
  action?: "send_test_email";
};

/**
 * Deterministic next-action selector for the setup dashboard. Pure function
 * over `SetupStatus` — no React, no AI, no I/O — so it can be exhaustively
 * unit tested. Only the wording shown alongside its output may be generated;
 * which step is selected never is.
 *
 * Selection order is deliberate: a sandboxed account can already send to
 * verified recipients and the AWS mailbox simulator, so proving the pipeline
 * with a first send (step 4) comes before requesting production access
 * (step 5). Getting this backwards tells users they are blocked when they
 * are not.
 */
export function selectNextStep(status: SetupStatus): NextStep {
  if (!status.hasAwsAccount) {
    return {
      kind: "connect_aws",
      title: "Connect and verify your AWS account",
      description:
        "Wraps deploys email infrastructure into your own AWS account. Connect one to get started.",
      ctaLabel: "Connect AWS account",
      href: (orgSlug) => `/${orgSlug}/settings/aws-accounts`,
    };
  }

  if (!status.hasPlatformConnection) {
    return {
      kind: "connect_platform",
      title: "Connect the Wraps platform",
      description:
        "Save your webhook secret to let Wraps deploy and manage infrastructure on this AWS account.",
      ctaLabel: "Connect platform",
      href: (orgSlug) => `/${orgSlug}/setup`,
    };
  }

  if (!status.hasVerifiedDomain) {
    return {
      kind: "verify_domain",
      title: "Verify a sending domain",
      description:
        "Add and verify a domain in SES so you can send email from your own address.",
      ctaLabel: "Verify domain",
      href: (orgSlug) => `/${orgSlug}/setup`,
    };
  }

  if (!status.hasSentEmail) {
    return {
      kind: "first_send",
      title: "Send your first email",
      description:
        "Send a test email to prove the pipeline works — this succeeds even while your account is in the SES sandbox.",
      ctaLabel: "Send a test email",
      href: (orgSlug) => `/${orgSlug}/setup`,
      action: "send_test_email",
    };
  }

  if (status.sandboxStatus === true) {
    const review = status.productionAccessRequest;

    // FAILED means AWS never received the appeal — the customer cannot
    // discover this any other way, so it gets the strongest copy.
    if (review?.status === "FAILED") {
      return {
        kind: "leave_sandbox",
        title: "AWS did not receive your request",
        description:
          "An internal AWS error meant your production access request never arrived. You can submit it again.",
        ctaLabel: "Request production access",
        href: (orgSlug) => `/${orgSlug}/settings/aws-accounts`,
      };
    }

    if (review?.status === "DENIED") {
      return {
        kind: "leave_sandbox",
        title: "AWS denied your production access request",
        // No case-specific link: SES's CaseId is not documented as the same
        // identifier the AWS Support console URL takes, so the description
        // must not promise a destination the CTA doesn't reach.
        description: review.caseId
          ? `AWS denied your production access request (case ${review.caseId}). You can request production access again once you've addressed the reason for the denial.`
          : "AWS denied your production access request. You can request production access again once you've addressed the reason for the denial.",
        ctaLabel: "Request production access",
        href: (orgSlug) => `/${orgSlug}/settings/aws-accounts`,
      };
    }

    if (review?.status === "PENDING") {
      return {
        kind: "leave_sandbox",
        title: "Production access requested — AWS is reviewing it",
        description: review.caseId
          ? `AWS is reviewing your production access request (case ${review.caseId}). Your account can currently send only to verified recipients and the AWS mailbox simulator.`
          : "AWS is reviewing your production access request. Your account can currently send only to verified recipients and the AWS mailbox simulator.",
        // Not "check the case in AWS" — this links to Wraps' own AWS
        // Accounts settings page, not the AWS Support case itself.
        ctaLabel: "View AWS accounts",
        href: (orgSlug) => `/${orgSlug}/settings/aws-accounts`,
      };
    }

    return {
      kind: "leave_sandbox",
      title: "Request SES production access",
      description:
        "Your AWS account can currently send only to verified recipients and the AWS mailbox simulator. Request production access to email anyone.",
      ctaLabel: "Request production access",
      href: (orgSlug) => `/${orgSlug}/settings/aws-accounts`,
    };
  }

  return {
    kind: "done",
    title: "You're all set up",
    description: "Email is connected, verified, and sending in production.",
    ctaLabel: "Go to dashboard",
    href: (orgSlug) => `/${orgSlug}`,
  };
}
