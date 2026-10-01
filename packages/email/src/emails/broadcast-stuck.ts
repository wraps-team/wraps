import { resolveAppUrl } from "../lib/app-url";
import { getWrapsClient } from "../lib/client";
import { escapeHtml } from "../lib/escape-html";

export type BroadcastStuckContent = {
  broadcastName: string;
  batchId: string;
  orgSlug: string;
  awsAccountId: string | null;
  /** The SES region of the account. Defaults to the account's home region when omitted. */
  region?: string;
  stuckSince: Date;
  processedRecipients: number;
  totalRecipients: number;
  max24HourSend: number;
  sentLast24Hours: number;
  reserve: number;
  /** Defaults to `new Date()`; pass explicitly in tests for a stable elapsed-hours calculation. */
  now?: Date;
};

export type SendBroadcastStuckEmailParams = BroadcastStuckContent & {
  to: string | string[];
};

function elapsedHours(stuckSince: Date, now: Date): number {
  return Math.floor((now.getTime() - stuckSince.getTime()) / (60 * 60 * 1000));
}

/**
 * Build the subject/html/text for the quota-stuck broadcast escalation.
 * Pure content builder — no network calls — so it's testable without SES.
 *
 * Distinct from the routine broadcast.quota_paused notification: this fires
 * only after 24h of zero progress, and it must NOT claim sending resumes
 * automatically — that claim is what makes the routine pause's copy wrong for
 * a broadcast that is actually stuck.
 */
export function buildBroadcastStuckEmail({
  broadcastName,
  batchId,
  orgSlug,
  awsAccountId,
  region,
  stuckSince,
  processedRecipients,
  totalRecipients,
  max24HourSend,
  sentLast24Hours,
  reserve,
  now = new Date(),
}: BroadcastStuckContent): { subject: string; html: string; text: string } {
  const hours = elapsedHours(stuckSince, now);
  const broadcastUrl = `${resolveAppUrl()}/${orgSlug}/emails/broadcasts/${batchId}`;
  const reserveSettingsUrl = awsAccountId
    ? `${resolveAppUrl()}/${orgSlug}/settings/aws-accounts/${awsAccountId}/settings${region ? `?region=${encodeURIComponent(region)}` : ""}#quota-reserve`
    : null;

  const subject = `Broadcast "${broadcastName}" has been paused for ${hours} hours`;

  const progressLine = `Progress: ${processedRecipients.toLocaleString()} of ${totalRecipients.toLocaleString()} recipients sent.`;
  const quotaLine = `Daily quota ${max24HourSend.toLocaleString()}, ${sentLast24Hours.toLocaleString()} sent in the last 24h, ${reserve.toLocaleString()} reserved for transactional email.`;

  const textRemedies = [
    "1. Raise this AWS account's SES daily sending quota with AWS.",
    reserveSettingsUrl
      ? `2. Lower the daily quota reserve: ${reserveSettingsUrl}`
      : null,
    `${reserveSettingsUrl ? "3" : "2"}. Cancel the broadcast: ${broadcastUrl}`,
  ].filter((line): line is string => line !== null);

  const text = [
    `Broadcast "${broadcastName}" has made no progress for ${hours} hours.`,
    "",
    "It is paused to protect transactional email, and it is NOT resuming on its own.",
    "",
    progressLine,
    quotaLine,
    "",
    "To fix this:",
    ...textRemedies,
  ].join("\n");

  const htmlRemedies = [
    "<li>Raise this AWS account's SES daily sending quota with AWS.</li>",
    reserveSettingsUrl
      ? `<li>Lower the daily quota reserve: <a href="${escapeHtml(reserveSettingsUrl)}">account settings</a>.</li>`
      : null,
    `<li>Cancel the broadcast: <a href="${escapeHtml(broadcastUrl)}">broadcast page</a>.</li>`,
  ].filter((line): line is string => line !== null);

  const html = [
    `<p>Broadcast <strong>${escapeHtml(broadcastName)}</strong> has made no progress for <strong>${hours} hours</strong>.</p>`,
    "<p>It is paused to protect transactional email, and it is <strong>not resuming on its own</strong>.</p>",
    `<p>${escapeHtml(progressLine)}</p>`,
    `<p>${escapeHtml(quotaLine)}</p>`,
    "<p>To fix this:</p>",
    `<ul>${htmlRemedies.join("")}</ul>`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendBroadcastStuckEmail({
  to,
  ...content
}: SendBroadcastStuckEmailParams) {
  const { subject, html, text } = buildBroadcastStuckEmail(content);
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
