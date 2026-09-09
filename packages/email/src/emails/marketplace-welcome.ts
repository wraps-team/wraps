import { resolveAppUrl } from "../lib/app-url";
import { getWrapsClient } from "../lib/client";
import { escapeHtml } from "../lib/escape-html";

export type MarketplaceWelcomeContent = {
  /** Buyer's AWS account id, shown so they can tell subscriptions apart. */
  customerAwsAccountId: string;
  /**
   * Signed, single-subscription link token. Possession of this email is what
   * proves the agreement is theirs — an address match is not, because whoever
   * subscribes types the address themselves.
   */
  linkToken: string;
};

export type SendMarketplaceWelcomeEmailParams = MarketplaceWelcomeContent & {
  to: string | string[];
};

/**
 * Build the subject/html/text for the AWS Marketplace subscription
 * confirmation. Pure content builder — no network calls — so it's testable
 * without SES.
 *
 * AWS requires this email: a buyer who subscribes must be sent confirmation
 * along with clear next steps. It is sent only after a lifecycle event
 * confirms the subscription, never on registration, because AWS forbids
 * treating a subscription as active before then.
 *
 * The link carries a signed token naming this one subscription. That is the
 * mechanism tying an agreement to an organization — deliberately not an
 * address match, which the subscriber controls and could point at a stranger.
 */
export function buildMarketplaceWelcomeEmail({
  customerAwsAccountId,
  linkToken,
}: MarketplaceWelcomeContent): {
  subject: string;
  html: string;
  text: string;
} {
  const linkUrl = `${resolveAppUrl()}/marketplace/aws/link?token=${encodeURIComponent(linkToken)}`;

  const subject = "Your Wraps subscription is active";

  const text = [
    "Your AWS Marketplace subscription to Wraps is confirmed.",
    "",
    `It is attached to AWS account ${customerAwsAccountId}.`,
    "",
    "Next step: set up your Wraps account using the link below. It attaches this subscription to whichever account you sign in with.",
    linkUrl,
    "",
    "Once you are in, the CLI deploys email infrastructure into your own AWS account. Sending runs on your Amazon SES and AWS bills you directly for it, separately from this subscription.",
    "",
    "Questions: support@wraps.dev",
  ].join("\n");

  const html = [
    "<p>Your AWS Marketplace subscription to Wraps is confirmed.</p>",
    `<p>It is attached to AWS account <strong>${escapeHtml(customerAwsAccountId)}</strong>.</p>`,
    `<p><strong>Next step:</strong> <a href="${escapeHtml(linkUrl)}">set up your Wraps account</a>. That link attaches this subscription to whichever account you sign in with.</p>`,
    "<p>Once you are in, the CLI deploys email infrastructure into your own AWS account. Sending runs on your Amazon SES and AWS bills you directly for it, separately from this subscription.</p>",
    '<p>Questions: <a href="mailto:support@wraps.dev">support@wraps.dev</a></p>',
  ].join("\n");

  return { subject, html, text };
}

export async function sendMarketplaceWelcomeEmail({
  to,
  ...content
}: SendMarketplaceWelcomeEmailParams) {
  const { subject, html, text } = buildMarketplaceWelcomeEmail(content);
  const wraps = await getWrapsClient();

  return wraps.send({
    from:
      process.env.EMAIL_FROM ||
      process.env.AUTH_EMAIL_FROM ||
      "Wraps <hello@wraps.dev>",
    to,
    subject,
    html,
    text,
  });
}
