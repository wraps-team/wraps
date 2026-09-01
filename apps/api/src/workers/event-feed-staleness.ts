/**
 * Event Feed Staleness Worker
 *
 * Scheduled Lambda that detects SES event feeds that have gone silent while
 * the account is still sending mail, flags them on aws_account, and emails
 * the org owner once per staleness episode. Runs hourly in production.
 *
 * Ground truth: aws_account.last_event_received_at is bumped by the SES
 * webhook route every time an authenticated, well-formed SES event (one
 * carrying mail.messageId) arrives for an account. Malformed payloads never
 * stamp it — one that did once dressed a never-connected account up as a
 * stalled one (SHC, 2026-08-25). See apps/api/src/routes/webhooks.ts.
 *
 * Detection (per connected account):
 *   1. Candidate: webhookSecret IS NOT NULL (account claims to be connected)
 *      AND lastEventReceivedAt IS NOT NULL. A feed that has never delivered a
 *      single event was never connected, not stalled — there is no
 *      regression to report, the dashboard's "no events have ever arrived"
 *      banner already covers it accurately (event-feed-banners.tsx's
 *      `silent` filter), and these accounts never self-heal, so alerting
 *      them forever buries the accounts that genuinely broke (plan 194;
 *      mirrors the same gate on account-health.ts's aws.role_unreachable
 *      alert). See the early-return at the top of the sweep loop.
 *   2. feedStale: every send in the grace-aged window (24h ago .. 15m ago)
 *      that SES accepted is still sitting at status 'sent' — i.e. nothing has
 *      come back about it. This is a per-message check against the row SES
 *      itself wrote, not a comparison against lastEventReceivedAt. The cursor
 *      can't serve that comparison: the webhook throttles it to about one
 *      write per minute per account (apps/api/src/routes/webhooks.ts:239-253),
 *      so it pins to the first event of a 60s burst and every later message in
 *      the same burst looks "unacknowledged" by a few seconds even though its
 *      event already landed on its own row. That pinning produced 13 of the 14
 *      alerts this feature ever sent — all against accounts whose feeds had
 *      never missed an event (plan 196). Requiring *every* accepted send in
 *      the window to be unacknowledged (not just some) is what keeps a
 *      high-volume account's permanent trickle of lost-event rows from
 *      tripping the alert forever; see UNACKNOWLEDGED_RATIO_THRESHOLD below.
 *      An idle org is never flagged — with no sends to judge, silence proves
 *      nothing. An infrequent-but-acknowledged sender is never flagged either
 *      — every one of its accepted sends already carries a post-'sent'
 *      status, however long the gaps between sends are.
 *   3. sesStale (fallback, plan 195): consulted only when #2 had *no
 *      evidence at all* — zero accepted sends in the window. An account
 *      whose sends all carry a post-'sent' status has positively proved its
 *      feed works, and this account-and-region-wide metric is far too coarse
 *      to overturn that; consulting it there is what sent two false alerts
 *      on 2026-08-25 (plan 197).
 *      The SDK sends straight from the customer's own AWS account to their
 *      own SES — it never calls the Wraps API, so no message_send row exists
 *      until an event materializes one (apps/api/src/routes/webhooks.ts's
 *      "message not found" branch). That makes signal #2 circular for
 *      exactly the senders it exists to protect: if their feed breaks, no
 *      new rows appear, so #2 reports "nothing waiting" instead of "broken".
 *      getSesSendCountSince asks SES itself via the account-and-region-wide
 *      `Send` metric — coarser than #2 (it counts sends outside any Wraps
 *      configuration set too), so it only ever adds a stale verdict, never
 *      overrides a healthy one. `null` from the probe (no role, no
 *      permission) means no evidence and must never be read as zero sends.
 *      Its window starts at ceilToMinute(...) — see that helper for why an
 *      un-rounded start counts the very send that proves the feed alive.
 *
 * Transitions:
 *   - stale && eventFeedStaleSince IS NULL -> set eventFeedStaleSince = now.
 *   - stale && staleSince set >1h ago (debounce one cycle) && not yet
 *     alerted -> email the org owner, then set eventFeedAlertedAt. The
 *     timestamp is only set after a successful send so one org's email
 *     failure doesn't suppress next hour's retry.
 *   - !stale && an event has arrived since the flag was raised -> clear both
 *     columns (recovered). Recovery demands positive evidence that the feed
 *     came back: an account that merely stopped sending also stops looking
 *     stale, and clearing on that would silently resolve a still-broken feed.
 *
 * Email credentials: infra/cron.ts sets WRAPS_EMAIL_ROLE_ARN to the dogfood
 * account's wraps-email-role (where wraps.dev is SES-verified) and grants
 * this function sts:AssumeRole on it; getWrapsClient() assumes that role
 * from the execution-role credentials. If the assume ever fails (e.g. trust
 * policy drift), the send throws, eventFeedAlertedAt stays unset, and the
 * sweep degrades to detection + flag + dashboard banner — retrying hourly.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  captureException,
  captureMessage,
  wrapHandler,
} from "@sentry/aws-serverless";
import {
  awsAccount,
  db,
  MESSAGE_SEND_UNACCEPTED_STATUSES,
  member,
  messageSend,
  notifyOrg,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { sendEventFeedStaleEmail } from "@wraps/email";
import type { Handler } from "aws-lambda";
import { and, eq, exists, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { flushLogger, log } from "../lib/logger";
import { getCredentials } from "../services/credentials";

const RECENT_SEND_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const EVENT_GRACE_MS = 15 * 60 * 1000; // 15m
const ALERT_DEBOUNCE_MS = 60 * 60 * 1000; // 1h
// The bar for "stale" is total silence, not a percentage. Even TorBox and
// JAST — the two busiest accounts, with feeds that have never actually
// broken — carry a permanent trickle of rows stuck at 'sent' (lost events,
// or messages SES is still retrying: ~17/day for TorBox). A partial residue
// means *some* events are arriving, which is exactly the case this alert
// must not fire for. Only when every accepted send in the window is
// unacknowledged does it mean the feed itself has gone dark.
const UNACKNOWLEDGED_RATIO_THRESHOLD = 1;
// The fallback probe's lookback (plan 195). Must comfortably exceed both the
// metric's publication lag (minutes, not seconds) and the hourly cron
// interval, so a real stall is observed with a full window of both sends
// and silence rather than a sliver that could read either way.
const SES_METRIC_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h

/**
 * STS/CloudWatch codes that all mean the same thing operationally: the
 * customer's console-access role is gone, its trust policy no longer admits
 * this Lambda, or it lacks the cloudwatch:GetMetricData permission the probe
 * needs. Copied from account-health.ts's isRoleAccessError rather than
 * imported — three similar lines beat a premature shared module across two
 * independently-scheduled workers, and account-health.ts is out of scope.
 */
const ROLE_ACCESS_ERROR_CODES = [
  "AccessDenied",
  "AccessDeniedException",
  "NoSuchEntity",
  "NoSuchEntityException",
  "InvalidClientTokenId",
  "ExpiredToken",
  "ExpiredTokenException",
  "UnrecognizedClientException",
] as const;

/**
 * AWS SDK v3 error names are unreliable — some errors arrive as `name: "Error"`
 * with the real code only in the message — so both are checked.
 */
function isRoleAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return ROLE_ACCESS_ERROR_CODES.some(
    (code) => error.name === code || error.message.includes(code)
  );
}

/** Look up the org owner's email. Returns null if not found. */
async function getOrgOwnerEmail(
  organizationId: string
): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner"))
    )
    .limit(1);
  return row?.email ?? null;
}

type StalenessCheck = {
  stale: boolean;
  /** Accepted sends (status not in MESSAGE_SEND_UNACCEPTED_STATUSES) in the window. */
  total: number;
  /** Of those, the ones still sitting at exactly 'sent' — nothing came back. */
  unacknowledged: number;
};

/**
 * True when every accepted send in the grace-aged window is still sitting at
 * exactly 'sent' — nothing has ever come back about any of them. This reads
 * the evidence already written on the row: every post-'sent' status
 * ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'suppressed')
 * is written by the webhook and is therefore proof an event arrived for that
 * specific message. Pre-acceptance statuses (MESSAGE_SEND_UNACCEPTED_STATUSES)
 * are owed no event at all and are excluded from both counts.
 *
 * Scoped to channel="email" because only SES produces the statuses this
 * predicate reads — SMS delivery runs through End User Messaging and never
 * writes them, so judging an SMS send here would report a feed that was
 * never supposed to acknowledge it. The channel predicate also lets
 * message_send_org_channel_sent_at_idx serve this query on all three columns
 * instead of walking the org's whole index range.
 */
async function hasUnacknowledgedSend(
  organizationId: string,
  awsAccountId: string,
  now: Date
): Promise<StalenessCheck> {
  const windowStart = new Date(now.getTime() - RECENT_SEND_WINDOW_MS);
  const graceCutoff = new Date(now.getTime() - EVENT_GRACE_MS);

  const unaccepted = sql.raw(
    MESSAGE_SEND_UNACCEPTED_STATUSES.map((s) => `'${s}'`).join(", ")
  );
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${messageSend.status} not in (${unaccepted}))::int`,
      unacknowledged: sql<number>`count(*) filter (where ${messageSend.status} = 'sent')::int`,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, organizationId),
        eq(messageSend.awsAccountId, awsAccountId),
        eq(messageSend.channel, "email"),
        gt(messageSend.sentAt, windowStart),
        lt(messageSend.sentAt, graceCutoff)
      )
    );

  const total = row?.total ?? 0;
  const unacknowledged = row?.unacknowledged ?? 0;
  const stale =
    total > 0 && unacknowledged / total >= UNACKNOWLEDGED_RATIO_THRESHOLD;
  return { stale, total, unacknowledged };
}

/**
 * Round a probe window's start up to the next whole minute.
 *
 * CloudWatch truncates GetMetricData's StartTime to the minute and anchors
 * every period bucket to that truncated instant, so asking for 07:16:32
 * opens a bucket at 07:16:00 and counts sends from up to 59 seconds *before*
 * the window. That is not a rounding nuisance here: the window starts at
 * lastEventReceivedAt, and the send whose event wrote that timestamp always
 * precedes it by a second or two, so the un-rounded window counts exactly
 * the message that proves the feed is working and reports it as unobserved.
 * That is what fired both false alerts on 2026-08-25 — each said "SES
 * reports 1 send" about a message already sitting at 'opened'.
 *
 * Rounding up rather than down: the window must never reach back before the
 * last known event, and losing up to a minute of a 3-hour window costs
 * nothing — a real stall still shows hours of sends.
 */
function ceilToMinute(date: Date): Date {
  const remainder = date.getTime() % 60_000;
  return remainder === 0
    ? date
    : new Date(date.getTime() + (60_000 - remainder));
}

/**
 * Fallback evidence of sending for SDK/direct-SES senders (plan 195): their
 * message_send rows are created by the webhook itself (see the module
 * header), so hasUnacknowledgedSend finds nothing to judge while their feed
 * is broken — the DB signal is circular for exactly the population it is
 * meant to protect. This asks SES directly by summing the account-and-region-
 * wide `Send` metric over the window. That scope makes it coarser than the
 * per-message DB signal (it counts sends outside any Wraps configuration
 * set too), which is why it is consulted only as a fallback, never a
 * replacement — see the module header's "Detection" section.
 *
 * Returns `null` — meaning no evidence, never `0` — when the customer's
 * console-access role cannot be assumed or CloudWatch refuses the call. A
 * role that was never granted cloudwatch:GetMetricData never self-heals, so
 * this is reported once via log.info and left alone; it is not exceptional
 * the way an unexpected CloudWatch error is.
 */
async function getSesSendCountSince(
  account: { id: string; organizationId: string },
  since: Date,
  until: Date
): Promise<number | null> {
  try {
    const credentials = await getCredentials(
      account.id,
      account.organizationId
    );
    const cloudwatch = new CloudWatchClient({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
    const response = await cloudwatch.send(
      new GetMetricDataCommand({
        StartTime: since,
        EndTime: until,
        MetricDataQueries: [
          {
            Id: "sesSend",
            MetricStat: {
              Metric: { Namespace: "AWS/SES", MetricName: "Send" },
              Period: 3600,
              Stat: "Sum",
            },
          },
        ],
      })
    );
    const values = response.MetricDataResults?.[0]?.Values ?? [];
    return values.reduce((sum, value) => sum + value, 0);
  } catch (error) {
    if (isRoleAccessError(error)) {
      log.info(
        "[event-feed-staleness] Role unusable for SES send-metric probe, skipping",
        { accountId: account.id, organizationId: account.organizationId }
      );
      return null;
    }
    captureException(error, {
      tags: { worker: "event-feed-staleness", stage: "ses-send-metric" },
      extra: {
        accountId: account.id,
        organizationId: account.organizationId,
      },
    });
    return null;
  }
}

async function clearStaleFlags(accountId: string): Promise<void> {
  await db
    .update(awsAccount)
    .set({ eventFeedStaleSince: null, eventFeedAlertedAt: null })
    .where(eq(awsAccount.id, accountId));
}

async function markStaleSince(accountId: string, now: Date): Promise<void> {
  await db
    .update(awsAccount)
    .set({ eventFeedStaleSince: now })
    .where(eq(awsAccount.id, accountId));
}

async function markAlerted(accountId: string, now: Date): Promise<void> {
  await db
    .update(awsAccount)
    .set({ eventFeedAlertedAt: now })
    .where(eq(awsAccount.id, accountId));
}

/** Look up the org's slug for building the settings-page link. */
async function getOrgSlug(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.slug ?? null;
}

async function alertOwner(account: {
  id: string;
  organizationId: string;
  name: string;
  accountId: string;
  region: string;
  lastEventAt: Date;
  /** From getSesSendCountSince (plan 195): set only when the CloudWatch
   * fallback, not the precise message_send signal, is what flagged this
   * account. Undefined otherwise -- the alert copy must not guess. */
  observedSendCount?: number;
}): Promise<void> {
  const now = new Date();

  try {
    const [ownerEmail, orgSlug] = await Promise.all([
      getOrgOwnerEmail(account.organizationId),
      getOrgSlug(account.organizationId),
    ]);

    if (!(ownerEmail && orgSlug)) {
      // Returns without setting eventFeedAlertedAt, so this repeats hourly
      // and never self-resolves. Report it rather than only logging.
      captureMessage(
        "[event-feed-staleness] Missing owner email or org slug, skipping alert",
        {
          level: "warning",
          tags: { worker: "event-feed-staleness", stage: "resolve-owner" },
          extra: {
            accountId: account.id,
            organizationId: account.organizationId,
            hasOwnerEmail: !!ownerEmail,
            hasOrgSlug: !!orgSlug,
          },
        }
      );
      log.warn(
        "[event-feed-staleness] Missing owner email or org slug, skipping alert",
        {
          accountId: account.id,
          organizationId: account.organizationId,
          hasOwnerEmail: !!ownerEmail,
          hasOrgSlug: !!orgSlug,
        }
      );
      return;
    }

    await sendEventFeedStaleEmail({
      to: ownerEmail,
      accountName: account.name,
      awsAccountNumber: account.accountId,
      region: account.region,
      orgSlug,
      awsAccountId: account.id,
      lastEventAt: account.lastEventAt,
      observedSendCount: account.observedSendCount,
    });

    // Same observation, same wording, in the inbox notification -- it must
    // state what was actually seen (a metric sum), never a diagnosis of why.
    const observedSentence =
      account.observedSendCount === undefined
        ? ""
        : ` SES reports ${account.observedSendCount} send${account.observedSendCount === 1 ? "" : "s"} from this account in the last 3 hours, and no events reached Wraps for any of them.`;

    try {
      await notifyOrg({
        organizationId: account.organizationId,
        roles: ["owner", "admin"],
        type: "events.feed_stale",
        title: `Event feed stale for ${account.name}`,
        body: `The last delivery event we received from AWS account ${account.accountId} (${account.region}) was ${account.lastEventAt.toISOString()}, but mail is still being sent.${observedSentence} Delivery, bounce, and complaint tracking are blind until this is fixed.`,
        href: `/${orgSlug}/settings/aws-accounts/${account.id}`,
        data: { awsAccountId: account.id, region: account.region },
      });
    } catch (notifyError) {
      captureException(notifyError, {
        tags: { worker: "event-feed-staleness", stage: "notify-inbox" },
        extra: {
          accountId: account.id,
          organizationId: account.organizationId,
        },
      });
      log.error(
        "[event-feed-staleness] Failed to write inbox notification",
        notifyError,
        { accountId: account.id, organizationId: account.organizationId }
      );
    }

    // Set the timestamp only after a successful send.
    await markAlerted(account.id, now);

    log.info("[event-feed-staleness] Alerted org owner", {
      accountId: account.id,
      organizationId: account.organizationId,
    });
  } catch (error) {
    // One org's email failure must not abort the sweep. eventFeedAlertedAt
    // stays unset so the next hourly run retries the send. That retry is
    // silent by design, so report it — a permanently failing alert is
    // otherwise indistinguishable from a working one.
    captureException(error, {
      tags: { worker: "event-feed-staleness", stage: "alert-owner" },
      extra: {
        accountId: account.id,
        organizationId: account.organizationId,
        lastEventAt: account.lastEventAt.toISOString(),
      },
    });
    log.error("[event-feed-staleness] Failed to alert org owner", error, {
      accountId: account.id,
      organizationId: account.organizationId,
    });
  }
}

export const handler: Handler = wrapHandler(async () => {
  log.info("[event-feed-staleness] Starting sweep");

  const now = new Date();
  const debounceCutoff = new Date(now.getTime() - ALERT_DEBOUNCE_MS);
  const graceCutoff = new Date(now.getTime() - EVENT_GRACE_MS);

  const connectedAccounts = await db
    .select({
      id: awsAccount.id,
      organizationId: awsAccount.organizationId,
      name: awsAccount.name,
      accountId: awsAccount.accountId,
      region: awsAccount.region,
      lastEventReceivedAt: awsAccount.lastEventReceivedAt,
      eventFeedStaleSince: awsAccount.eventFeedStaleSince,
      eventFeedAlertedAt: awsAccount.eventFeedAlertedAt,
    })
    .from(awsAccount)
    .where(
      and(
        isNotNull(awsAccount.webhookSecret),
        // Skip orgs whose events the SES webhook is deliberately dropping
        // (routes/webhooks.ts step 3 — no active subscription). Their
        // lastEventReceivedAt freezes by design while SES keeps reporting
        // sends, which is exactly the shape this worker treats as a stalled
        // feed. Without this, disconnecting an org is immediately followed by
        // telling them their integration is broken.
        exists(
          db
            .select({ live: sql`1` })
            .from(subscription)
            .where(
              and(
                eq(subscription.referenceId, awsAccount.organizationId),
                inArray(subscription.status, ["active", "trialing"])
              )
            )
        )
      )
    );

  let flaggedCount = 0;
  let alertedCount = 0;
  let recoveredCount = 0;
  let unflaggedNeverConnectedCount = 0;
  let totalAcceptedSends = 0;
  let totalUnacknowledgedSends = 0;
  let sesProbeCount = 0;
  let sesFlaggedCount = 0;

  for (const account of connectedAccounts) {
    // "Stalled" is only a meaningful word for a feed that once worked. An
    // account whose lastEventReceivedAt has never been set has no regression
    // to report — there is nothing to compare a stall against, the
    // dashboard's "no events have ever arrived" banner already tells this
    // customer the truth, and this state never self-heals on its own (no
    // event is coming to prove recovery). Alerting it forever would bury the
    // accounts that genuinely broke. Silence here is deliberate, in the
    // spirit of account-health.ts's aws.role_unreachable gate.
    if (account.lastEventReceivedAt === null) {
      if (account.eventFeedStaleSince !== null) {
        // A row the pre-plan-194 sweep mis-flagged before this gate existed.
        // This is a one-time correction, not a "recovery" — it must not be
        // counted as one — and it restores the accurate never-received
        // banner (event-feed-banners.tsx's `silent` filter is suppressed by
        // a non-null eventFeedStaleSince).
        await clearStaleFlags(account.id);
        unflaggedNeverConnectedCount++;
      }
      log.info("[event-feed-staleness] Never-connected account, skipping", {
        accountId: account.id,
        organizationId: account.organizationId,
      });
      continue;
    }
    const lastEventAt = account.lastEventReceivedAt;

    const {
      stale: feedStale,
      total,
      unacknowledged,
    } = await hasUnacknowledgedSend(account.organizationId, account.id, now);
    totalAcceptedSends += total;
    totalUnacknowledgedSends += unacknowledged;

    // Fallback for SDK/direct-SES senders (plan 195): message_send has no
    // evidence either way for them until an event materializes its row, so
    // an account whose feed just broke looks identical here to one with
    // nothing to send. The gate is `total === 0` — *no evidence* — not
    // "not stale": an account with accepted sends that all carry a
    // post-'sent' status has already proved its feed works, and the
    // account-and-region-wide metric is far too coarse to overturn that. It
    // used to read `!feedStale`, which let the fallback override a clean
    // per-message verdict and produced two false alerts on 2026-08-25.
    // Accounts whose last event is still inside the grace period are
    // trivially alive and skipped too, so most accounts on most sweeps never
    // make this call.
    let sesSendCount: number | null = null;
    // Logged on the flag below. The 2026-08-25 false alerts were invisible
    // for want of exactly this: a count with no window beside it cannot be
    // checked against the send it claims to have missed.
    let sesWindowStart: Date | null = null;
    let stale = feedStale;
    if (total === 0 && lastEventAt < graceCutoff) {
      const windowStart = ceilToMinute(
        new Date(
          Math.max(lastEventAt.getTime(), now.getTime() - SES_METRIC_WINDOW_MS)
        )
      );
      // Rounding up can push the window start past its end when the last
      // event landed within a minute of the grace cutoff. There is nothing
      // to observe in a window that has closed, and CloudWatch rejects
      // StartTime >= EndTime outright.
      if (windowStart < graceCutoff) {
        sesWindowStart = windowStart;
        sesProbeCount++;
        sesSendCount = await getSesSendCountSince(
          account,
          windowStart,
          graceCutoff
        );
        // null means "couldn't check" (no role, no permission) — never treat
        // it as "sent nothing". Only a positive count is evidence of a stall.
        if (sesSendCount !== null && sesSendCount > 0) {
          stale = true;
          sesFlaggedCount++;
        }
      }
    }

    if (stale) {
      if (account.eventFeedStaleSince === null) {
        await markStaleSince(account.id, now);
        flaggedCount++;
        log.info("[event-feed-staleness] Flagged feed as stale", {
          accountId: account.id,
          organizationId: account.organizationId,
          total,
          unacknowledged,
          sesSendCount,
          sesWindowStart: sesWindowStart?.toISOString() ?? null,
          sesWindowEnd: graceCutoff.toISOString(),
          lastEventAt: lastEventAt.toISOString(),
        });
        continue;
      }

      const debounced = account.eventFeedStaleSince < debounceCutoff;
      if (debounced && account.eventFeedAlertedAt === null) {
        await alertOwner({
          id: account.id,
          organizationId: account.organizationId,
          name: account.name,
          accountId: account.accountId,
          region: account.region,
          lastEventAt,
          observedSendCount: sesSendCount ?? undefined,
        });
        alertedCount++;
      }
    } else if (
      account.eventFeedStaleSince !== null &&
      lastEventAt > account.eventFeedStaleSince
    ) {
      // An event landed after the flag was raised — the feed is genuinely
      // back. Without this check an account that simply stopped sending
      // would also stop looking stale and clear its own alert.
      await clearStaleFlags(account.id);
      recoveredCount++;
      log.info("[event-feed-staleness] Event feed recovered", {
        accountId: account.id,
        organizationId: account.organizationId,
      });
    }
  }

  log.info("[event-feed-staleness] Sweep complete", {
    accountsChecked: connectedAccounts.length,
    flaggedCount,
    alertedCount,
    recoveredCount,
    unflaggedNeverConnectedCount,
    totalAcceptedSends,
    totalUnacknowledgedSends,
    sesProbeCount,
    sesFlaggedCount,
  });
  await flushLogger();
});
