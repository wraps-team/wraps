/**
 * Event Feed Staleness Worker — detection against a real DB
 *
 * The mocked sibling (event-feed-staleness.test.ts) stubs the send probe, so
 * it can only prove the worker reacts correctly to an answer it is handed —
 * not that the query asks the right question. This file exists because the
 * predicate itself has now failed twice for that reason:
 *
 *   - Originally: pairing "sent in the last 24h" with "no event in the last
 *     6h" flagged healthy accounts that send in daily batches, because those
 *     two windows disagree for any sender slower than one message every 6
 *     hours.
 *   - Then (plan 196): comparing sentAt against lastEventReceivedAt flagged
 *     healthy *bursty* senders, because the webhook throttles that cursor to
 *     about one write per minute — it pins to the first event of a burst and
 *     every later message in the same minute looks unacknowledged by a few
 *     seconds, even though its own row already has an event on it.
 *
 * The fix removes the cursor from this comparison entirely: staleness is now
 * read off each send row's own status. Only real rows, with real statuses
 * and real timestamps, can prove the query asks the right question.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no DB mocks). Email is
 * mocked at the @wraps/email boundary.
 */

import type { MessageSendStatus } from "@wraps/db";
import { awsAccount, db, messageSend, notification } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupBaseOrg,
  messageSendRow,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

const mockSendEventFeedStaleEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@wraps/email", () => ({
  sendEventFeedStaleEmail: (...args: unknown[]) =>
    mockSendEventFeedStaleEmail(...args),
}));

const { handler } = await import("../workers/event-feed-staleness");

const PREFIX = `feed-stale-db-${crypto.randomUUID().slice(0, 8)}`;

const fixture = await seedBaseOrg(PREFIX);
const { ids } = fixture;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

/** Seed one email send for the primary org's AWS account at the given time
 * and status. Defaults to "sent" (accepted, never acknowledged) since that
 * is the status every unacknowledged-send test case needs. */
async function seedSend(
  sentAt: Date,
  label: string,
  status: MessageSendStatus = "sent"
): Promise<void> {
  await db.insert(messageSend).values(
    messageSendRow(ids, {
      id: `${PREFIX}-${label}`,
      messageId: `${PREFIX}-${label}-ses-id`,
      sentAt,
      createdAt: sentAt,
      status,
    })
  );
}

/** Seed `count` email sends spread evenly across [start, start+span), all at
 * the given status, for volume-shaped cases (FSI, TorBox). */
async function seedSends(
  count: number,
  start: Date,
  spanMs: number,
  labelPrefix: string,
  status: MessageSendStatus
): Promise<void> {
  const rows = Array.from({ length: count }, (_, i) => {
    const sentAt = new Date(
      start.getTime() + Math.floor((i * spanMs) / Math.max(count - 1, 1))
    );
    return messageSendRow(ids, {
      id: `${PREFIX}-${labelPrefix}-${i}`,
      messageId: `${PREFIX}-${labelPrefix}-${i}-ses-id`,
      sentAt,
      createdAt: sentAt,
      status,
    });
  });
  await db.insert(messageSend).values(rows);
}

/** Put the account's three feed columns into a known state. */
async function setFeedState(state: {
  lastEventReceivedAt: Date | null;
  eventFeedStaleSince?: Date | null;
  eventFeedAlertedAt?: Date | null;
}): Promise<void> {
  await db
    .update(awsAccount)
    .set({
      lastEventReceivedAt: state.lastEventReceivedAt,
      eventFeedStaleSince: state.eventFeedStaleSince ?? null,
      eventFeedAlertedAt: state.eventFeedAlertedAt ?? null,
    })
    .where(eq(awsAccount.id, ids.awsAccount));
}

async function readFeedState() {
  const [row] = await db
    .select({
      lastEventReceivedAt: awsAccount.lastEventReceivedAt,
      eventFeedStaleSince: awsAccount.eventFeedStaleSince,
      eventFeedAlertedAt: awsAccount.eventFeedAlertedAt,
    })
    .from(awsAccount)
    .where(eq(awsAccount.id, ids.awsAccount));
  return row;
}

async function runSweep(): Promise<void> {
  await handler({} as never, {} as never, {} as never);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(messageSend).where(eq(messageSend.organizationId, ids.org));
  await db.delete(notification).where(eq(notification.organizationId, ids.org));
  // The fixture's second account also carries a webhook secret, so the sweep
  // would pick it up too. Drop it so this file only exercises its own account.
  await db
    .update(awsAccount)
    .set({ webhookSecret: null })
    .where(eq(awsAccount.id, ids.otherAwsAccount));
});

afterAll(async () => {
  await db.delete(notification).where(eq(notification.organizationId, ids.org));
  await cleanupBaseOrg(PREFIX);
});

describe("event-feed-staleness detection (real DB)", () => {
  // ─── Plan 196: the new per-message-status predicate ───────────────────

  it("[Passel regression] does not flag a burst that lands inside one throttle window, even acknowledged seconds apart", async () => {
    // Reproduces the production false positive exactly: four sends 30
    // seconds apart, 90 minutes ago, every one of them acknowledged. The
    // webhook throttles lastEventReceivedAt to ~1 write/min, so in
    // production it pins to the FIRST send's arrival — set it here to match
    // what the throttle actually produces, to prove the new predicate no
    // longer reads that cursor at all.
    const burstStart = ago(90 * MINUTE);
    await seedSend(burstStart, "burst-0", "delivered");
    await seedSend(
      new Date(burstStart.getTime() + 10_000),
      "burst-1",
      "delivered"
    );
    await seedSend(
      new Date(burstStart.getTime() + 20_000),
      "burst-2",
      "delivered"
    );
    await seedSend(
      new Date(burstStart.getTime() + 30_000),
      "burst-3",
      "delivered"
    );
    await setFeedState({ lastEventReceivedAt: burstStart });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("[FSI case] never flags or alerts an account whose feed has never delivered a single event (plan 194)", async () => {
    // FSI is the production account this plan is named for: 7,220 sends,
    // every one stuck at 'sent', and lastEventReceivedAt has been NULL since
    // the account connected. Plan 196's predicate alone would call this
    // "stale" (it is 100% unacknowledged) — but a feed that has never once
    // worked has no regression to report. This is plan 194's gate, not a
    // staleness verdict, so it must short-circuit before the predicate runs.
    await seedSends(20, ago(6 * HOUR), 6 * HOUR - 20 * MINUTE, "fsi", "sent");
    await setFeedState({ lastEventReceivedAt: null });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("never flags or alerts a never-connected account even with a single recent send (plan 194)", async () => {
    await seedSend(ago(3 * HOUR), "never-connected-recent-send", "sent");
    await setFeedState({ lastEventReceivedAt: null });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("clears a previously-raised flag and any pending alert in one sweep once recognized as never-connected (plan 194)", async () => {
    // Simulates a row the pre-plan-194 sweep mis-flagged: lastEventReceivedAt
    // is (and, per the sole-writer invariant this gate rests on, always was)
    // null, but an earlier sweep still stamped both flag columns. The very
    // first sweep after the gate exists must correct both in one pass — this
    // is a one-time correction, not a "recovery".
    await setFeedState({
      lastEventReceivedAt: null,
      eventFeedStaleSince: ago(2 * HOUR),
      eventFeedAlertedAt: ago(30 * MINUTE),
    });

    await runSweep();

    const state = await readFeedState();
    expect(state?.eventFeedStaleSince).toBeNull();
    expect(state?.eventFeedAlertedAt).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("[TorBox residue] does not flag a permanent trickle of lost-event rows on an otherwise healthy account", async () => {
    // Non-null, stale cursor: this case is about the residue guard in
    // hasUnacknowledgedSend, not about plan 194's never-connected gate — a
    // null cursor here would make the gate the reason it passes, silently
    // dropping the coverage this test exists for.
    await seedSends(
      197,
      ago(6 * HOUR),
      6 * HOUR - 20 * MINUTE,
      "acked",
      "delivered"
    );
    await seedSends(3, ago(5 * HOUR), 4 * HOUR, "residue", "sent");
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  it("pre-acceptance statuses are owed no event and never flag the feed", async () => {
    // Non-null cursor so this exercises hasUnacknowledgedSend, not the
    // never-connected gate.
    await seedSend(ago(3 * HOUR), "never-accepted-queued", "queued");
    await seedSend(ago(2 * HOUR), "never-accepted-failed", "failed");
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
  });

  it("flags an account when the only sends inside the lookback window are unacknowledged, even if an older acked send sits outside it", async () => {
    // An acked send outside the 24h window must not give false comfort — the
    // predicate only judges what's actually inside the window it checks.
    // Non-null, stale cursor: this is a detection case, not a never-connected
    // one — a null cursor would make plan 194's gate the reason it flags,
    // which is not what this test is proving.
    await seedSend(ago(25 * HOUR), "acked-outside-window", "delivered");
    await seedSend(ago(2 * HOUR), "unacked-inside-window", "sent");
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeInstanceOf(Date);
  });

  it("holds off on an all-'sent' send still inside the grace period", async () => {
    // Non-null cursor so this exercises hasUnacknowledgedSend, not the
    // never-connected gate.
    await seedSend(ago(5 * MINUTE), "just-sent", "sent");
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
  });

  it("ignores all-'sent' sends older than the 24h lookback window", async () => {
    // Non-null cursor so this exercises hasUnacknowledgedSend, not the
    // never-connected gate.
    await seedSend(ago(30 * HOUR), "ancient", "sent");
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
  });

  it("ignores SMS sends, which never carry an SES status", async () => {
    // SMS delivery runs through End User Messaging, not SES, so an SMS row
    // stuck at "sent" is not evidence of anything about the email feed.
    await db.insert(messageSend).values(
      messageSendRow(ids, {
        id: `${PREFIX}-sms`,
        messageId: `${PREFIX}-sms-ses-id`,
        channel: "sms",
        recipient: "+15555550123",
        sentAt: ago(3 * HOUR),
        createdAt: ago(3 * HOUR),
        status: "sent",
      })
    );
    // Non-null cursor so this exercises hasUnacknowledgedSend, not the
    // never-connected gate.
    await setFeedState({ lastEventReceivedAt: ago(3 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
  });

  it("leaves an infrequent sender alone when every send was acknowledged", async () => {
    // One batch a day, acknowledged seconds later. The last event is 20h
    // old — long past the grace period — but no accepted send in the window
    // is still sitting at 'sent', so the feed is healthy.
    await seedSend(ago(20 * HOUR), "daily-batch", "delivered");
    await setFeedState({
      lastEventReceivedAt: new Date(Date.now() - 20 * HOUR + 2000),
    });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });

  // ─── Lifecycle coverage (unaffected by the predicate rewrite) ─────────

  it("never flags an idle account with no sends at all", async () => {
    await setFeedState({ lastEventReceivedAt: ago(20 * HOUR) });

    await runSweep();

    expect((await readFeedState())?.eventFeedStaleSince).toBeNull();
  });

  it("clears the flags once an event arrives after the episode began", async () => {
    // The recovered send must itself be acknowledged — that acknowledgment
    // is the positive evidence the feed came back.
    await seedSend(ago(3 * HOUR), "recovered-send", "delivered");
    await setFeedState({
      lastEventReceivedAt: ago(10 * MINUTE),
      eventFeedStaleSince: ago(2 * HOUR),
      eventFeedAlertedAt: ago(30 * MINUTE),
    });

    await runSweep();

    const state = await readFeedState();
    expect(state?.eventFeedStaleSince).toBeNull();
    expect(state?.eventFeedAlertedAt).toBeNull();
  });

  it("keeps the flags when sends stop without the feed coming back", async () => {
    // No sends in the window, so nothing is waiting on an event — but the
    // last event still predates the flag, so the feed never proved it
    // recovered.
    await setFeedState({
      lastEventReceivedAt: ago(6 * HOUR),
      eventFeedStaleSince: ago(2 * HOUR),
      eventFeedAlertedAt: ago(30 * MINUTE),
    });

    await runSweep();

    const state = await readFeedState();
    expect(state?.eventFeedStaleSince).toBeInstanceOf(Date);
    expect(state?.eventFeedAlertedAt).toBeInstanceOf(Date);
  });

  it("alerts the org owner once the flag has aged past the debounce", async () => {
    // Non-null, stale cursor: this account was connected and genuinely went
    // stale — a null cursor would route it through plan 194's gate instead
    // of the debounce/alert path this test exists to prove.
    await seedSend(ago(3 * HOUR), "alerting-send", "sent");
    await setFeedState({
      lastEventReceivedAt: ago(3 * HOUR),
      eventFeedStaleSince: ago(2 * HOUR),
    });

    await runSweep();

    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEventFeedStaleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${PREFIX}@example.com`,
        awsAccountNumber: fixture.accountNumber,
        orgSlug: `${PREFIX}-org`,
      })
    );
    expect((await readFeedState())?.eventFeedAlertedAt).toBeInstanceOf(Date);

    const inbox = await db
      .select({ type: notification.type })
      .from(notification)
      .where(eq(notification.organizationId, ids.org));
    expect(inbox.map((n) => n.type)).toContain("events.feed_stale");
  });

  it("does not re-alert an account already alerted in this episode", async () => {
    // Non-null, stale cursor — same reasoning as the debounce test above.
    await seedSend(ago(3 * HOUR), "already-alerted-send", "sent");
    await setFeedState({
      lastEventReceivedAt: ago(3 * HOUR),
      eventFeedStaleSince: ago(2 * HOUR),
      eventFeedAlertedAt: ago(30 * MINUTE),
    });

    await runSweep();

    expect(mockSendEventFeedStaleEmail).not.toHaveBeenCalled();
  });
});
