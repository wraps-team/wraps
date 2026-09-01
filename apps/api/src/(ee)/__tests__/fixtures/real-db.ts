/**
 * Real-DB test fixtures (shared)
 *
 * Helpers for seeding and tearing down a self-contained, prefix-namespaced
 * org graph on the shared Neon test branch. Every id/email/slug/externalId is
 * namespaced by the caller's `prefix` so files stay isolated even when their
 * runs overlap (the suite is `fileParallelism: false`, but unique prefixes are
 * the real isolation guarantee).
 *
 * Pattern (see apps/api/src/__tests__/events-single.test.ts):
 *   - beforeAll  → seedBaseOrg(prefix)
 *   - beforeEach → clearWorkflowState(ids.org) (+ otherOrg if used)
 *   - afterAll   → cleanupBaseOrg(prefix)
 *
 * Boundary mocks (SQS/Scheduler/SES) are the caller's responsibility — this
 * file never mocks anything. It only touches the real DB.
 */

import {
  awsAccount,
  contact,
  db,
  eq,
  member,
  messageSend,
  organization,
  subscription,
  user,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { inArray } from "drizzle-orm";

export type BaseOrgIds = {
  user: string;
  org: string;
  otherOrg: string;
  member: string;
  awsAccount: string;
  otherAwsAccount: string;
  contact: string;
  otherContact: string;
  subscription: string;
  otherSubscription: string;
};

export type BaseOrgFixture = {
  ids: BaseOrgIds;
  /** Webhook secret seeded on both AWS accounts (header `x-wraps-api-key`). */
  secret: string;
  /** AWS account number for the primary org's awsAccount (route param). */
  accountNumber: string;
  /** AWS account number for the otherOrg's awsAccount. */
  otherAccountNumber: string;
};

/**
 * Derive a stable 12-digit AWS-account-number-shaped string from a prefix.
 *
 * `accountId` is the one fixture field that isn't a literal `${prefix}-…`
 * string (it must be numeric), and it is NOT unique-constrained — the webhook
 * handler looks it up with `.limit(1)`. We reduce modulo 1e12 inside the loop
 * (each intermediate stays < ~31e12 < 2^53, so no float precision loss) so the
 * result spreads across the FULL 10^12 space rather than the 32-bit space a
 * `>>> 0` would cap it to — making cross-prefix collisions negligible. Under
 * serial execution (`fileParallelism: false`) + per-file cleanup, two files'
 * accounts never coexist, so this is belt-and-suspenders.
 */
function accountNumberFor(prefix: string, salt: number): string {
  let hash = salt;
  for (let i = 0; i < prefix.length; i++) {
    hash = (hash * 31 + prefix.charCodeAt(i)) % 1_000_000_000_000;
  }
  return hash.toString().padStart(12, "0");
}

export function baseOrgIds(prefix: string): BaseOrgIds {
  return {
    user: `${prefix}-user`,
    org: `${prefix}-org`,
    otherOrg: `${prefix}-org-2`,
    member: `${prefix}-member`,
    awsAccount: `${prefix}-aws`,
    otherAwsAccount: `${prefix}-aws-2`,
    contact: `${prefix}-contact`,
    otherContact: `${prefix}-contact-2`,
    subscription: `${prefix}-sub`,
    otherSubscription: `${prefix}-sub-2`,
  };
}

/**
 * Seed a complete org graph: user, two organizations (primary + other), a
 * membership in the primary org, an AWS account per org (with webhook secret),
 * an active `free` subscription per org, and one contact per org. Idempotent — safe to call in beforeAll across reruns.
 */
export async function seedBaseOrg(prefix: string): Promise<BaseOrgFixture> {
  const ids = baseOrgIds(prefix);
  const secret = `${prefix}-webhook-secret`;
  const accountNumber = accountNumberFor(prefix, 1);
  const otherAccountNumber = accountNumberFor(prefix, 2);
  const now = new Date();

  await db
    .insert(user)
    .values({
      id: ids.user,
      email: `${prefix}@example.com`,
      name: "Real DB Test User",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: now } });

  await db
    .insert(organization)
    .values({
      id: ids.org,
      name: "Real DB Test Org",
      slug: `${prefix}-org`,
      createdAt: now,
    } as typeof organization.$inferInsert)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: "Real DB Test Org" },
    });

  await db
    .insert(organization)
    .values({
      id: ids.otherOrg,
      name: "Real DB Other Org",
      slug: `${prefix}-org-2`,
      createdAt: now,
    } as typeof organization.$inferInsert)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: "Real DB Other Org" },
    });

  await db
    .insert(member)
    .values({
      id: ids.member,
      organizationId: ids.org,
      userId: ids.user,
      role: "owner",
      createdAt: now,
    } as typeof member.$inferInsert)
    .onConflictDoUpdate({ target: member.id, set: { role: "owner" } });

  // Both orgs get a live `free` subscription. The SES webhook drops events for
  // orgs with no active subscription (routes/webhooks.ts step 3), so a fixture
  // without one would make every webhook test assert on a dropped event.
  for (const [id, orgId] of [
    [ids.subscription, ids.org],
    [ids.otherSubscription, ids.otherOrg],
  ] as const) {
    await db
      .insert(subscription)
      .values({
        id,
        plan: "free",
        referenceId: orgId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      } as typeof subscription.$inferInsert)
      .onConflictDoUpdate({
        target: subscription.id,
        set: { status: "active" },
      });
  }

  await db
    .insert(awsAccount)
    .values({
      id: ids.awsAccount,
      organizationId: ids.org,
      name: "Primary AWS",
      accountId: accountNumber,
      region: "us-east-1",
      roleArn: `arn:aws:iam::${accountNumber}:role/wraps`,
      externalId: `${prefix}-ext-1`,
      webhookSecret: secret,
      isVerified: true,
      createdAt: now,
      updatedAt: now,
    } as typeof awsAccount.$inferInsert)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { webhookSecret: secret },
    });

  await db
    .insert(awsAccount)
    .values({
      id: ids.otherAwsAccount,
      organizationId: ids.otherOrg,
      name: "Other AWS",
      accountId: otherAccountNumber,
      region: "us-east-1",
      roleArn: `arn:aws:iam::${otherAccountNumber}:role/wraps`,
      externalId: `${prefix}-ext-2`,
      webhookSecret: secret,
      isVerified: true,
      createdAt: now,
      updatedAt: now,
    } as typeof awsAccount.$inferInsert)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { webhookSecret: secret },
    });

  await db
    .insert(contact)
    .values({
      id: ids.contact,
      organizationId: ids.org,
      email: `${prefix}-c1@example.com`,
      emailHash: `${prefix}-hash-1`,
      firstName: "Alice",
      lastName: "Test",
      emailStatus: "active",
      status: "active",
      createdAt: now,
      updatedAt: now,
    } as typeof contact.$inferInsert)
    .onConflictDoUpdate({ target: contact.id, set: { updatedAt: now } });

  await db
    .insert(contact)
    .values({
      id: ids.otherContact,
      organizationId: ids.otherOrg,
      email: `${prefix}-c2@example.com`,
      emailHash: `${prefix}-hash-2`,
      firstName: "Bob",
      lastName: "Other",
      emailStatus: "active",
      status: "active",
      createdAt: now,
      updatedAt: now,
    } as typeof contact.$inferInsert)
    .onConflictDoUpdate({ target: contact.id, set: { updatedAt: now } });

  return { ids, secret, accountNumber, otherAccountNumber };
}

/**
 * Remove all per-test state (executions, message sends, workflows) for the
 * given org ids. Call in beforeEach so each test starts clean. Step executions
 * and step rows cascade from workflowExecution / workflow deletes.
 */
export async function clearWorkflowState(...orgIds: string[]): Promise<void> {
  if (orgIds.length === 0) return;
  await db
    .delete(messageSend)
    .where(inArray(messageSend.organizationId, orgIds));
  await db
    .delete(workflowExecution)
    .where(inArray(workflowExecution.organizationId, orgIds));
  await db.delete(workflow).where(inArray(workflow.organizationId, orgIds));
}

/** Tear down the full org graph in reverse-FK order. Call in afterAll. */
export async function cleanupBaseOrg(prefix: string): Promise<void> {
  const ids = baseOrgIds(prefix);
  const orgIds = [ids.org, ids.otherOrg];

  await clearWorkflowState(...orgIds);
  await db.delete(contact).where(inArray(contact.organizationId, orgIds));
  await db.delete(awsAccount).where(inArray(awsAccount.organizationId, orgIds));
  await db
    .delete(subscription)
    .where(inArray(subscription.referenceId, orgIds));
  await db.delete(member).where(eq(member.id, ids.member));
  await db.delete(organization).where(inArray(organization.id, orgIds));
  await db.delete(user).where(eq(user.id, ids.user));
}

// ─────────────────────────────────────────────────────────────────────────────
// Row builders ($inferInsert-shaped, prefix-namespaced, override-friendly).
// Tests compose only what they need, then db.insert(...) directly.
// ─────────────────────────────────────────────────────────────────────────────

export function workflowRow(
  ids: BaseOrgIds,
  overrides: Partial<typeof workflow.$inferInsert> = {}
): typeof workflow.$inferInsert {
  const now = new Date();
  return {
    id: `${ids.org}-wf`,
    organizationId: ids.org,
    name: "Test Workflow",
    status: "enabled",
    triggerType: "event",
    triggerConfig: {},
    steps: [],
    transitions: [],
    allowReentry: true,
    createdBy: ids.user,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof workflow.$inferInsert;
}

export function executionRow(
  ids: BaseOrgIds,
  overrides: Partial<typeof workflowExecution.$inferInsert> = {}
): typeof workflowExecution.$inferInsert {
  const now = new Date();
  return {
    id: `${ids.org}-exec`,
    workflowId: `${ids.org}-wf`,
    contactId: ids.contact,
    organizationId: ids.org,
    status: "active",
    allowReentry: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof workflowExecution.$inferInsert;
}

export function messageSendRow(
  ids: BaseOrgIds,
  overrides: Partial<typeof messageSend.$inferInsert> = {}
): typeof messageSend.$inferInsert {
  const now = new Date();
  return {
    id: `${ids.org}-msg`,
    organizationId: ids.org,
    awsAccountId: ids.awsAccount,
    contactId: ids.contact,
    channel: "email",
    sourceType: "workflow",
    recipient: `${ids.org}-c1@example.com`,
    messageId: `${ids.org}-ses-message-id`,
    status: "sent",
    sentAt: now,
    createdAt: now,
    ...overrides,
  } as typeof messageSend.$inferInsert;
}
