/**
 * Event Feed Staleness Worker
 *
 * Scheduled Lambda that detects SES event feeds that have gone silent while
 * the account is still sending mail, flags them on aws_account, and emails
 * the org owner once per staleness episode. Runs hourly in production.
 *
 * Ground truth: aws_account.last_event_received_at is bumped by the SES
 * webhook route every time an authenticated event arrives for an account.
 * See apps/api/src/routes/webhooks.ts.
 *
 * Detection (per connected account):
 *   1. Candidate: webhookSecret IS NOT NULL (account claims to be connected).
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
  user,
} from "@wraps/db";
import { sendEventFeedStaleEmail } from "@wraps/email";
import type { Handler } from "aws-lambda";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { flushLogger, log } from "../lib/logger";

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
  eventFeedStaleSince: Date;
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
      staleSince: account.eventFeedStaleSince,
    });

    try {
      await notifyOrg({
        organizationId: account.organizationId,
        roles: ["owner", "admin"],
        type: "events.feed_stale",
        title: `Event feed stale for ${account.name}`,
        body: `No SES events have arrived from AWS account ${account.accountId} (${account.region}) since ${account.eventFeedStaleSince.toISOString()} while mail is still being sent. Delivery, bounce, and complaint tracking are blind until this is fixed.`,
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
        staleSince: account.eventFeedStaleSince.toISOString(),
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
    .where(isNotNull(awsAccount.webhookSecret));

  let flaggedCount = 0;
  let alertedCount = 0;
  let recoveredCount = 0;
  let totalAcceptedSends = 0;
  let totalUnacknowledgedSends = 0;

  for (const account of connectedAccounts) {
    const {
      stale: feedStale,
      total,
      unacknowledged,
    } = await hasUnacknowledgedSend(account.organizationId, account.id, now);
    totalAcceptedSends += total;
    totalUnacknowledgedSends += unacknowledged;

    if (feedStale) {
      if (account.eventFeedStaleSince === null) {
        await markStaleSince(account.id, now);
        flaggedCount++;
        log.info("[event-feed-staleness] Flagged feed as stale", {
          accountId: account.id,
          organizationId: account.organizationId,
          total,
          unacknowledged,
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
          eventFeedStaleSince: account.eventFeedStaleSince,
        });
        alertedCount++;
      }
    } else if (
      account.eventFeedStaleSince !== null &&
      account.lastEventReceivedAt !== null &&
      account.lastEventReceivedAt > account.eventFeedStaleSince
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
    totalAcceptedSends,
    totalUnacknowledgedSends,
  });
  await flushLogger();
});
