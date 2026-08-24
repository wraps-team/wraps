import { resolveAppUrl } from "../lib/app-url";
import { getWrapsClient } from "../lib/client";
import { escapeHtml } from "../lib/escape-html";

export type EventFeedStaleContent = {
  accountName: string;
  awsAccountNumber: string;
  region: string;
  orgSlug: string;
  awsAccountId: string;
  /** The account's real last-received-event timestamp (aws_account.last_event_received_at). */
  lastEventAt: Date;
};

export type SendEventFeedStaleEmailParams = EventFeedStaleContent & {
  to: string;
};

function formatTimestamp(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/**
 * Build the subject/html/text for the event-feed-stale alert.
 * Pure content builder — no network calls — so it's testable without SES.
 */
export function buildEventFeedStaleEmail({
  accountName,
  awsAccountNumber,
  region,
  orgSlug,
  awsAccountId,
  lastEventAt,
}: EventFeedStaleContent): { subject: string; html: string; text: string } {
  const settingsUrl = `${resolveAppUrl()}/${orgSlug}/settings/aws-accounts/${awsAccountId}`;
  const since = formatTimestamp(lastEventAt);

  const subject = `SES event feed stalled for ${accountName} (${awsAccountNumber})`;

  const text = [
    `Your AWS account "${accountName}" (${awsAccountNumber}, ${region}) is still sending email, but the last delivery event we received from it was ${since}.`,
    "",
    "Impact: the email timeline and analytics for this account are frozen, and bounce/complaint handling is blind until the feed recovers.",
    "",
    "To fix this, run `wraps email doctor` or visit your account settings:",
    settingsUrl,
  ].join("\n");

  const html = [
    `<p>Your AWS account <strong>${escapeHtml(accountName)}</strong> (${escapeHtml(awsAccountNumber)}, ${escapeHtml(region)}) is still sending email, but the last delivery event we received from it was <strong>${escapeHtml(since)}</strong>.</p>`,
    "<p>Impact: the email timeline and analytics for this account are frozen, and bounce/complaint handling is blind until the feed recovers.</p>",
    `<p>To fix this, run <code>wraps email doctor</code> or visit your <a href="${escapeHtml(settingsUrl)}">account settings</a>.</p>`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendEventFeedStaleEmail({
  to,
  ...content
}: SendEventFeedStaleEmailParams) {
  const { subject, html, text } = buildEventFeedStaleEmail(content);
  const wraps = await getWrapsClient();

  return wraps.send({
    from: process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>",
    to,
    subject,
    html,
    text,
  });
}
