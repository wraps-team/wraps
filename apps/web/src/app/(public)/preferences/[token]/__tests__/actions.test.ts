import {
  auditLog,
  awsAccount,
  contact,
  contactTopic,
  db,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { logger } from "@/lib/logger";
import { generateUnsubscribeToken } from "@/lib/unsubscribe-token";
import {
  resendConfirmation,
  unsubscribeGlobally,
  updatePreferences,
} from "../actions";

// Mock next/headers — updatePreferences' SMS consent branch calls
// getAuditContext(), which awaits headers(). Outside a Next request scope
// that throws and the action's own try/catch swallows it into an opaque
// "Failed to update preferences" error.
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock fetch globally to prevent real HTTP calls to the preference-events API
const originalFetchGlobal = globalThis.fetch;
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    (url: string | URL | Request, options?: RequestInit) => {
      const urlStr =
        typeof url === "string"
          ? url
          : url instanceof URL
            ? url.toString()
            : url.url;
      if (urlStr.includes("/v1/preference-events")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, subscribed: 0, unsubscribed: 0 }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }
      return originalFetchGlobal(url as RequestInfo, options);
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Mock the subscriptions module to avoid actual AWS calls
vi.mock("@wraps/email", () => ({
  determineSubscriptionStatus: vi.fn(async (params) => {
    // If topic requires double opt-in and no previous confirmation
    if (params.topicDoubleOptIn && !params.existingSubscription?.confirmedAt) {
      return {
        status: "pending",
        confirmationEmailSent: true,
      };
    }
    return { status: "subscribed" };
  }),
}));

// Test data
const testUser = {
  id: "test-pref-user-1",
  email: "pref-test@example.com",
  name: "Preferences Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-pref-org-1",
  name: "Preferences Test Org",
  slug: "pref-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testRegularTopic = {
  id: "test-pref-topic-regular",
  organizationId: testOrganization.id,
  name: "Regular Topic",
  slug: "regular-topic",
  description: "No double opt-in",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testDoubleOptInTopic = {
  id: "test-pref-topic-doi",
  organizationId: testOrganization.id,
  name: "Double Opt-In Topic",
  slug: "double-opt-in-topic",
  description: "Requires confirmation",
  public: true,
  doubleOptIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testContact = {
  id: "test-pref-contact-1",
  organizationId: testOrganization.id,
  email: "subscriber@example.com",
  emailHash: "pref-contact-hash",
  status: "active",
  properties: {},
  emailsSent: 0,
  emailsOpened: 0,
  emailsClicked: 0,
  smsSent: 0,
  smsClicked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testAwsAccount = {
  id: "test-pref-aws-1",
  organizationId: testOrganization.id,
  name: "Test Account",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/wraps-console-access-role",
  externalId: "test-pref-external-id-1",
  smsEnabled: true,
};

// Set up test database
beforeAll(async () => {
  // Insert test user
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  // Insert test organization
  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  // Insert test member
  await db
    .insert(member)
    .values({
      id: "test-pref-member-1",
      organizationId: testOrganization.id,
      userId: testUser.id,
      role: "owner",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: member.id,
      set: { role: "owner" },
    });

  // Insert test topics
  await db
    .insert(topic)
    .values(testRegularTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(topic)
    .values(testDoubleOptInTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { updatedAt: new Date() },
    });

  // Insert test contact
  await db
    .insert(contact)
    .values(testContact)
    .onConflictDoUpdate({
      target: contact.id,
      set: { updatedAt: new Date() },
    });

  // Insert test AWS account (SMS-enabled) for the SMS consent tests
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { smsEnabled: true },
    });
});

// Clean up contact topics before each test
beforeEach(async () => {
  await db
    .delete(contactTopic)
    .where(eq(contactTopic.contactId, testContact.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(contactTopic)
    .where(eq(contactTopic.contactId, testContact.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db.delete(contact).where(eq(contact.id, testContact.id));
  await db.delete(topic).where(eq(topic.id, testRegularTopic.id));
  await db.delete(topic).where(eq(topic.id, testDoubleOptInTopic.id));
  await db.delete(member).where(eq(member.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("updatePreferences with double opt-in", () => {
  it("should subscribe to regular topic immediately", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [testRegularTopic.id]: true }
    );

    expect(result.success).toBe(true);
    expect(result.pendingTopics).toBeUndefined();

    // Verify subscription is active
    const [subscription] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testRegularTopic.id)
        )
      )
      .limit(1);

    expect(subscription.status).toBe("subscribed");
  });

  it("should set pending status for double opt-in topic", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [testDoubleOptInTopic.id]: true }
    );

    expect(result.success).toBe(true);
    expect(result.pendingTopics).toContain(testDoubleOptInTopic.id);

    // Verify subscription is pending
    const [subscription] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testDoubleOptInTopic.id)
        )
      )
      .limit(1);

    expect(subscription.status).toBe("pending");
  });

  it("should auto-confirm re-subscription if previously confirmed", async () => {
    const confirmedAt = new Date(Date.now() - 86_400_000); // 1 day ago

    // Create previously confirmed but now unsubscribed subscription
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testDoubleOptInTopic.id,
      status: "unsubscribed",
      subscribedAt: confirmedAt,
      confirmedAt,
      unsubscribedAt: new Date(),
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    // Re-import to get the unmocked version for this specific test
    const { determineSubscriptionStatus } = await import("@wraps/email");
    vi.mocked(determineSubscriptionStatus).mockResolvedValueOnce({
      status: "subscribed", // Auto-confirmed because previously confirmed
    });

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [testDoubleOptInTopic.id]: true }
    );

    expect(result.success).toBe(true);
    // Should NOT be in pending since previously confirmed
    expect(result.pendingTopics).toBeUndefined();
  });

  it("should unsubscribe from pending topic", async () => {
    // Create pending subscription
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testDoubleOptInTopic.id,
      status: "pending",
      subscribedAt: null,
      confirmedAt: null,
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [testDoubleOptInTopic.id]: false }
    );

    expect(result.success).toBe(true);

    // Verify subscription is unsubscribed
    const [subscription] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testDoubleOptInTopic.id)
        )
      )
      .limit(1);

    expect(subscription.status).toBe("unsubscribed");
    expect(subscription.unsubscribedAt).not.toBeNull();
  });

  it("should handle mixed regular and double opt-in topics", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {
        [testRegularTopic.id]: true,
        [testDoubleOptInTopic.id]: true,
      }
    );

    expect(result.success).toBe(true);
    expect(result.pendingTopics).toHaveLength(1);
    expect(result.pendingTopics).toContain(testDoubleOptInTopic.id);

    // Verify regular topic is subscribed
    const [regularSub] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testRegularTopic.id)
        )
      )
      .limit(1);

    expect(regularSub.status).toBe("subscribed");

    // Verify double opt-in topic is pending
    const [doiSub] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testDoubleOptInTopic.id)
        )
      )
      .limit(1);

    expect(doiSub.status).toBe("pending");
  });

  it("should fail with invalid token", async () => {
    const result = await updatePreferences(
      "invalid-token",
      testContact.id,
      testOrganization.id,
      { [testRegularTopic.id]: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid token");
  });

  it("should fail with mismatched contact ID", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      "wrong-contact-id",
      testOrganization.id,
      { [testRegularTopic.id]: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid token");
  });
});

describe("resendConfirmation", () => {
  it("should resend confirmation for pending subscription", async () => {
    // Create pending subscription
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testDoubleOptInTopic.id,
      status: "pending",
      subscribedAt: null,
      confirmedAt: null,
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await resendConfirmation(
      token,
      testContact.id,
      testOrganization.id,
      testDoubleOptInTopic.id
    );

    expect(result.success).toBe(true);
  });

  it("should fail for non-pending subscription", async () => {
    // Create active subscription
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testDoubleOptInTopic.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await resendConfirmation(
      token,
      testContact.id,
      testOrganization.id,
      testDoubleOptInTopic.id
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No pending subscription");
  });

  it("should fail for topic without double opt-in", async () => {
    // Create pending subscription on regular topic (shouldn't happen normally)
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testRegularTopic.id,
      status: "pending",
      subscribedAt: null,
      confirmedAt: null,
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await resendConfirmation(
      token,
      testContact.id,
      testOrganization.id,
      testRegularTopic.id
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not require confirmation");
  });

  it("should fail with invalid token", async () => {
    const result = await resendConfirmation(
      "invalid-token",
      testContact.id,
      testOrganization.id,
      testDoubleOptInTopic.id
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid token");
  });

  it("should fail for non-existent topic", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await resendConfirmation(
      token,
      testContact.id,
      testOrganization.id,
      "non-existent-topic"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Topic not found");
  });
});

// Organization isolation test data
const otherOrganization = {
  id: "test-pref-org-other",
  name: "Other Test Org",
  slug: "other-pref-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrgTopic = {
  id: "test-pref-topic-other-org",
  organizationId: otherOrganization.id,
  name: "Other Org Topic",
  slug: "other-org-topic",
  description: "Topic in a different organization",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const otherOrgContact = {
  id: "test-pref-contact-other-org",
  organizationId: otherOrganization.id,
  email: "other-subscriber@example.com",
  emailHash: "other-pref-contact-hash",
  status: "active",
  properties: {},
  emailsSent: 0,
  emailsOpened: 0,
  emailsClicked: 0,
  smsSent: 0,
  smsClicked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Organization isolation", () => {
  beforeAll(async () => {
    // Insert other organization
    await db
      .insert(organization)
      .values(otherOrganization)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: otherOrganization.name },
      });

    // Insert topic in other org
    await db
      .insert(topic)
      .values(otherOrgTopic)
      .onConflictDoUpdate({
        target: topic.id,
        set: { updatedAt: new Date() },
      });

    // Insert contact in other org
    await db
      .insert(contact)
      .values(otherOrgContact)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });
  });

  afterAll(async () => {
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, otherOrgContact.id));
    await db.delete(contact).where(eq(contact.id, otherOrgContact.id));
    await db.delete(topic).where(eq(topic.id, otherOrgTopic.id));
    await db
      .delete(organization)
      .where(eq(organization.id, otherOrganization.id));
  });

  it("should not allow subscribing to topics from another organization", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    // Try to subscribe to a topic from the other organization
    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [otherOrgTopic.id]: true }
    );

    // The action should succeed but should not create a subscription
    // because the topic doesn't belong to the token's organization
    expect(result.success).toBe(true);

    // Verify no subscription was created to the other org's topic
    const subscriptions = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, otherOrgTopic.id)
        )
      );

    expect(subscriptions).toHaveLength(0);
  });

  it("should not allow token from one org to modify contact in another org", async () => {
    // Generate token for testContact in testOrganization
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    // Try to update preferences for a different organization
    const result = await updatePreferences(
      token,
      testContact.id,
      otherOrganization.id, // Different org!
      { [otherOrgTopic.id]: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid token");
  });

  it("should not allow contact from one org to use another org's token", async () => {
    // Generate token for otherOrgContact in otherOrganization
    const otherToken = await generateUnsubscribeToken(
      otherOrgContact.id,
      otherOrganization.id
    );

    // Try to use it with testOrganization
    const result = await updatePreferences(
      otherToken,
      otherOrgContact.id,
      testOrganization.id, // Wrong org for this token
      { [testRegularTopic.id]: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid token");
  });

  it("should not allow resending confirmation for topic in another org", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    // Try to resend confirmation for a topic in another organization
    const result = await resendConfirmation(
      token,
      testContact.id,
      testOrganization.id,
      otherOrgTopic.id // Topic from other org
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Topic not found");
  });

  it("should isolate subscriptions between organizations", async () => {
    // Subscribe testContact to testRegularTopic
    const token1 = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );
    await updatePreferences(token1, testContact.id, testOrganization.id, {
      [testRegularTopic.id]: true,
    });

    // Subscribe otherOrgContact to otherOrgTopic
    const token2 = await generateUnsubscribeToken(
      otherOrgContact.id,
      otherOrganization.id
    );
    await updatePreferences(token2, otherOrgContact.id, otherOrganization.id, {
      [otherOrgTopic.id]: true,
    });

    // Verify testContact's subscriptions don't include other org's topics
    const testContactSubs = await db
      .select()
      .from(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));

    const testContactTopicIds = testContactSubs.map((s) => s.topicId);
    expect(testContactTopicIds).not.toContain(otherOrgTopic.id);

    // Verify otherOrgContact's subscriptions don't include test org's topics
    const otherContactSubs = await db
      .select()
      .from(contactTopic)
      .where(eq(contactTopic.contactId, otherOrgContact.id));

    const otherContactTopicIds = otherContactSubs.map((s) => s.topicId);
    expect(otherContactTopicIds).not.toContain(testRegularTopic.id);
    expect(otherContactTopicIds).not.toContain(testDoubleOptInTopic.id);
  });
});

describe("Workflow event emission from preference center", () => {
  const apiCalls: Array<{ url: string; options: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    apiCalls.length = 0;
    // Plan 023b: emitPreferenceEvents has no default API URL any more, so
    // these tests set one instead of relying on the developer's env.
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");

    // Intercept only API calls to preference-events, pass everything else through
    vi.stubGlobal(
      "fetch",
      (url: string | URL | Request, options?: RequestInit) => {
        const urlStr =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (urlStr.includes("/v1/preference-events")) {
          apiCalls.push({ url: urlStr, options: options || {} });
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, subscribed: 0, unsubscribed: 0 }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }
        return originalFetch(url as RequestInfo, options);
      }
    );

    // Clean up contact topics
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("should call API to emit topic_unsubscribed when a topic is unsubscribed", async () => {
    // First subscribe to a topic
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testRegularTopic.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    await updatePreferences(token, testContact.id, testOrganization.id, {
      [testRegularTopic.id]: false,
    });

    // Verify API was called with unsubscribe event
    expect(apiCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(apiCalls[0].options.body as string);
    expect(body.token).toBe(token);
    expect(body.contactId).toBe(testContact.id);
    expect(body.organizationId).toBe(testOrganization.id);
    expect(body.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: testRegularTopic.id,
          topicName: testRegularTopic.name,
          action: "unsubscribed",
        }),
      ])
    );
  });

  it("should call API to emit topic_subscribed for non-pending subscriptions", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    await updatePreferences(token, testContact.id, testOrganization.id, {
      [testRegularTopic.id]: true,
    });

    expect(apiCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(apiCalls[0].options.body as string);
    expect(body.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: testRegularTopic.id,
          topicName: testRegularTopic.name,
          action: "subscribed",
        }),
      ])
    );
  });

  it("should NOT emit topic_subscribed for pending (double opt-in) subscriptions", async () => {
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    await updatePreferences(token, testContact.id, testOrganization.id, {
      [testDoubleOptInTopic.id]: true,
    });

    // If API was called, verify no "subscribed" action for the double opt-in topic
    if (apiCalls.length > 0) {
      const body = JSON.parse(apiCalls[0].options.body as string);
      const subscribedChanges = body.changes.filter(
        (c: { action: string; topicId: string }) =>
          c.action === "subscribed" && c.topicId === testDoubleOptInTopic.id
      );
      expect(subscribedChanges).toHaveLength(0);
    }
  });

  // Rewritten by plan 023b: on success the API now does the global write and
  // emits, so the web reports topic events only when it falls back to its own
  // write. The API answers 500 here; only calls to the root
  // /v1/preference-events path are recorded.
  it("should call API to emit topic_unsubscribed for all topics when global unsubscribe falls back", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      (url: string | URL | Request, options?: RequestInit) => {
        const urlStr =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        const { origin, pathname } = new URL(urlStr);
        if (
          origin === "http://api.test" &&
          pathname === "/v1/preference-events/unsubscribe-all"
        ) {
          return Promise.resolve(new Response("boom", { status: 500 }));
        }
        if (
          origin === "http://api.test" &&
          pathname === "/v1/preference-events"
        ) {
          apiCalls.push({ url: urlStr, options: options || {} });
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, subscribed: 0, unsubscribed: 0 }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }
        return originalFetch(url as RequestInfo, options);
      }
    );

    // Subscribe to multiple topics first
    await db.insert(contactTopic).values([
      {
        contactId: testContact.id,
        topicId: testRegularTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      },
      {
        contactId: testContact.id,
        topicId: testDoubleOptInTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      },
    ]);

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    try {
      await unsubscribeGlobally(token, testContact.id, testOrganization.id);
    } finally {
      vi.unstubAllEnvs();
    }

    expect(apiCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(apiCalls[0].options.body as string);
    expect(body.changes.length).toBeGreaterThanOrEqual(2);

    const unsubChanges = body.changes.filter(
      (c: { action: string }) => c.action === "unsubscribed"
    );
    expect(unsubChanges.length).toBeGreaterThanOrEqual(2);
  });

  it("should not fail preference update when event emission fails", async () => {
    // Override fetch to fail for API calls
    vi.stubGlobal(
      "fetch",
      (url: string | URL | Request, options?: RequestInit) => {
        const urlStr =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        if (urlStr.includes("/v1/preference-events")) {
          return Promise.reject(new Error("Network error"));
        }
        return originalFetch(url as RequestInfo, options);
      }
    );

    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: testRegularTopic.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    // The action should still succeed even if event emission fails
    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      { [testRegularTopic.id]: false }
    );

    expect(result.success).toBe(true);

    // Verify the DB change still happened
    const [subscription] = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, testContact.id),
          eq(contactTopic.topicId, testRegularTopic.id)
        )
      )
      .limit(1);

    expect(subscription.status).toBe("unsubscribed");
  });
});

// Plan 023b: "unsubscribe from all" asks the API to do the write (so it can
// emit contact_updated) and writes locally only when the API does not
// confirm. Each test installs its own fetch stub over the file-level one.
describe("unsubscribeGlobally — API first, local fallback", () => {
  const API_URL = "http://api.test";
  // Another org's topic, for a contact_topic row that points across orgs.
  const foreignOrg = {
    id: "test-pref-org-foreign",
    name: "Preferences Foreign Org",
    slug: "pref-foreign-org",
    createdAt: new Date(),
    logo: null,
    metadata: null,
  };
  const foreignTopic = {
    id: "test-pref-topic-foreign",
    organizationId: foreignOrg.id,
    name: "Foreign Topic",
    slug: "foreign-topic",
    description: "Belongs to another organization",
    public: true,
    doubleOptIn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: testUser.id,
  };
  const originalFetch = globalThis.fetch;
  type Call = { url: string; options: RequestInit };
  const unsubscribeAllCalls: Call[] = [];
  const eventCalls: Call[] = [];
  const otherApiCalls: Call[] = [];

  function urlOf(url: string | URL | Request): string {
    if (typeof url === "string") {
      return url;
    }
    return url instanceof URL ? url.toString() : url.url;
  }

  /** `unsubscribeAll` answers the /unsubscribe-all call; the root path answers 200. */
  function stubApi(
    unsubscribeAll: (options: RequestInit) => Promise<Response>
  ): void {
    vi.stubGlobal(
      "fetch",
      (url: string | URL | Request, options: RequestInit = {}) => {
        const urlStr = urlOf(url);
        // Exact origin and path, not substrings: "http://api.test.example"
        // is another host.
        const { origin, pathname } = new URL(urlStr);
        if (
          origin === API_URL &&
          pathname === "/v1/preference-events/unsubscribe-all"
        ) {
          unsubscribeAllCalls.push({ url: urlStr, options });
          return unsubscribeAll(options);
        }
        if (origin === API_URL && pathname === "/v1/preference-events") {
          eventCalls.push({ url: urlStr, options });
          return Promise.resolve(
            Response.json({ success: true, subscribed: 0, unsubscribed: 0 })
          );
        }
        if (origin === API_URL) {
          otherApiCalls.push({ url: urlStr, options });
          return Promise.resolve(new Response("unexpected", { status: 418 }));
        }
        return originalFetch(url as RequestInfo, options);
      }
    );
  }

  async function seed({
    emailStatus,
    emailUnsubscribedAt,
    regular,
    doubleOptIn,
  }: {
    emailStatus: "active" | "unsubscribed";
    emailUnsubscribedAt: Date | null;
    regular: "subscribed" | "pending" | "unsubscribed";
    doubleOptIn: "subscribed" | "pending" | "unsubscribed";
  }) {
    await db
      .update(contact)
      .set({ emailStatus, emailUnsubscribedAt })
      .where(eq(contact.id, testContact.id));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));
    await db.insert(contactTopic).values([
      {
        contactId: testContact.id,
        topicId: testRegularTopic.id,
        status: regular,
        subscribedAt: new Date(),
      },
      {
        contactId: testContact.id,
        topicId: testDoubleOptInTopic.id,
        status: doubleOptIn,
        subscribedAt: new Date(),
      },
    ]);
  }

  async function readContact() {
    const [row] = await db
      .select({
        emailStatus: contact.emailStatus,
        emailUnsubscribedAt: contact.emailUnsubscribedAt,
      })
      .from(contact)
      .where(eq(contact.id, testContact.id));
    return row;
  }

  async function topicStatuses() {
    const rows = await db
      .select({ topicId: contactTopic.topicId, status: contactTopic.status })
      .from(contactTopic)
      .where(eq(contactTopic.contactId, testContact.id));
    return Object.fromEntries(rows.map((r) => [r.topicId, r.status]));
  }

  /** The `failure` of each warn/error log for `op`, in order. */
  function loggedFailures(op = "unsubscribe-all-api"): unknown[] {
    return [
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]
      .map(([obj]) => obj as { op?: unknown; failure?: unknown } | undefined)
      .filter((obj) => obj?.op === op && obj.failure !== undefined)
      .map((obj) => obj?.failure);
  }

  beforeAll(async () => {
    await db
      .insert(organization)
      .values(foreignOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: foreignOrg.name },
      });
    await db
      .insert(topic)
      .values(foreignTopic)
      .onConflictDoUpdate({
        target: topic.id,
        set: { updatedAt: new Date() },
      });
  });

  beforeEach(async () => {
    unsubscribeAllCalls.length = 0;
    eventCalls.length = 0;
    otherApiCalls.length = 0;
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
    vi.spyOn(logger, "warn");
    vi.spyOn(logger, "error");
    // The regular topic is subscribed; the double opt-in one is pending.
    await seed({
      emailStatus: "active",
      emailUnsubscribedAt: null,
      regular: "subscribed",
      doubleOptIn: "pending",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db
      .update(contact)
      .set({ emailStatus: "active", emailUnsubscribedAt: null })
      .where(eq(contact.id, testContact.id));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.topicId, foreignTopic.id));
    await db.delete(topic).where(eq(topic.id, foreignTopic.id));
    await db.delete(organization).where(eq(organization.id, foreignOrg.id));
  });

  it("API success: one unsubscribe-all call with the token, and no local write", async () => {
    stubApi(() => Promise.resolve(Response.json({ success: true })));
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await unsubscribeGlobally(
      token,
      testContact.id,
      testOrganization.id
    );

    expect(result).toEqual({ success: true });
    expect(unsubscribeAllCalls).toHaveLength(1);
    expect(unsubscribeAllCalls[0].url).toBe(
      `${API_URL}/v1/preference-events/unsubscribe-all`
    );
    expect(unsubscribeAllCalls[0].options.method).toBe("POST");
    expect(JSON.parse(unsubscribeAllCalls[0].options.body as string)).toEqual({
      token,
    });
    expect(eventCalls).toHaveLength(0);
    expect(otherApiCalls).toHaveLength(0);
    expect((await readContact()).emailStatus).toBe("active");
    expect(await topicStatuses()).toEqual({
      [testRegularTopic.id]: "subscribed",
      [testDoubleOptInTopic.id]: "pending",
    });
    expect(loggedFailures()).toEqual([]);
    expect(loggedFailures("emit-workflow-events")).toEqual([]);
  });

  const timeoutError = () =>
    new DOMException(
      "The operation was aborted due to timeout",
      "TimeoutError"
    );

  const failures: {
    name: string;
    failure: string;
    attempts: number;
    setup: () => void;
  }[] = [
    {
      name: "a 500",
      failure: "status",
      attempts: 1,
      setup: () =>
        stubApi(() => Promise.resolve(new Response("boom", { status: 500 }))),
    },
    {
      name: "a 404 (the web shipped before the API)",
      failure: "status",
      attempts: 1,
      setup: () =>
        stubApi(() =>
          Promise.resolve(
            Response.json({ error: "NOT_FOUND" }, { status: 404 })
          )
        ),
    },
    {
      name: "a timeout",
      failure: "timeout",
      attempts: 1,
      setup: () => {
        // The action's own AbortSignal.timeout(10s), already fired: no waiting.
        vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(
          AbortSignal.abort(timeoutError())
        );
        stubApi((options) =>
          options.signal?.aborted
            ? Promise.reject(options.signal.reason)
            : Promise.resolve(Response.json({ success: true }))
        );
      },
    },
    {
      name: "a network error",
      failure: "network",
      attempts: 1,
      setup: () => stubApi(() => Promise.reject(new TypeError("fetch failed"))),
    },
    {
      name: "a 2xx without success: true",
      failure: "body",
      attempts: 1,
      setup: () => stubApi(() => Promise.resolve(Response.json({ ok: true }))),
    },
  ];

  it.each(failures)(
    "$name: writes locally, reports only the topics it moved, and logs the failure",
    async ({ failure, attempts, setup }) => {
      setup();
      const token = await generateUnsubscribeToken(
        testContact.id,
        testOrganization.id
      );

      const result = await unsubscribeGlobally(
        token,
        testContact.id,
        testOrganization.id
      );

      expect(result).toEqual({ success: true });
      expect(unsubscribeAllCalls).toHaveLength(attempts);
      const contactRow = await readContact();
      expect(contactRow.emailStatus).toBe("unsubscribed");
      expect(contactRow.emailUnsubscribedAt).toBeInstanceOf(Date);
      expect(await topicStatuses()).toEqual({
        [testRegularTopic.id]: "unsubscribed",
        [testDoubleOptInTopic.id]: "unsubscribed",
      });
      // Exactly the subscribed topic the fallback moved; the pending one was
      // never subscribed, so it fires nothing. No other API call is made, so
      // nothing can emit contact_updated.
      expect(eventCalls).toHaveLength(1);
      expect(JSON.parse(eventCalls[0].options.body as string)).toEqual({
        token,
        contactId: testContact.id,
        organizationId: testOrganization.id,
        changes: [
          {
            topicId: testRegularTopic.id,
            topicName: testRegularTopic.name,
            action: "unsubscribed",
          },
        ],
      });
      expect(otherApiCalls).toHaveLength(0);
      expect(loggedFailures()).toEqual([failure]);
      expect(loggedFailures("emit-workflow-events")).toEqual([]);
    }
  );

  it("NEXT_PUBLIC_API_URL unset: writes locally and calls no API at all (no default URL)", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    stubApi(() => Promise.resolve(Response.json({ success: true })));
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await unsubscribeGlobally(
      token,
      testContact.id,
      testOrganization.id
    );

    expect(result).toEqual({ success: true });
    const contactRow = await readContact();
    expect(contactRow.emailStatus).toBe("unsubscribed");
    expect(contactRow.emailUnsubscribedAt).toBeInstanceOf(Date);
    expect(await topicStatuses()).toEqual({
      [testRegularTopic.id]: "unsubscribed",
      [testDoubleOptInTopic.id]: "unsubscribed",
    });
    // Neither the unsubscribe-all call nor the topic events go anywhere:
    // a self-hosted deployment never sends the token to the Wraps platform.
    expect(unsubscribeAllCalls).toHaveLength(0);
    expect(eventCalls).toHaveLength(0);
    expect(otherApiCalls).toHaveLength(0);
    expect(loggedFailures()).toEqual(["unconfigured"]);
    expect(loggedFailures("emit-workflow-events")).toEqual(["unconfigured"]);
  });

  it("the timeout is 10 seconds", async () => {
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(AbortSignal.abort(timeoutError()));
    stubApi((options) =>
      options.signal?.aborted
        ? Promise.reject(options.signal.reason)
        : Promise.resolve(Response.json({ success: true }))
    );
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    await unsubscribeGlobally(token, testContact.id, testOrganization.id);

    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(unsubscribeAllCalls[0].options.signal?.aborted).toBe(true);
  });

  it("a fallback after the API already unsubscribed everything emits no topic events and keeps emailUnsubscribedAt", async () => {
    const firstUnsubscribedAt = new Date("2026-10-01T12:00:00.000Z");
    await seed({
      emailStatus: "unsubscribed",
      emailUnsubscribedAt: firstUnsubscribedAt,
      regular: "unsubscribed",
      doubleOptIn: "unsubscribed",
    });
    stubApi(() => Promise.resolve(new Response("boom", { status: 500 })));
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await unsubscribeGlobally(
      token,
      testContact.id,
      testOrganization.id
    );

    expect(result).toEqual({ success: true });
    expect(eventCalls).toHaveLength(0);
    const contactRow = await readContact();
    expect(contactRow.emailStatus).toBe("unsubscribed");
    expect(contactRow.emailUnsubscribedAt?.toISOString()).toBe(
      firstUnsubscribedAt.toISOString()
    );
  });

  it("a fallback leaves a subscription to another org's topic alone and does not report it", async () => {
    // Bad data on purpose: contact_topic has no org column, so nothing stops
    // a row for this org's contact pointing at another org's topic.
    await db.insert(contactTopic).values({
      contactId: testContact.id,
      topicId: foreignTopic.id,
      status: "subscribed",
      subscribedAt: new Date(),
    });
    stubApi(() => Promise.resolve(new Response("boom", { status: 500 })));
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await unsubscribeGlobally(
      token,
      testContact.id,
      testOrganization.id
    );

    expect(result).toEqual({ success: true });
    expect(await topicStatuses()).toEqual({
      [testRegularTopic.id]: "unsubscribed",
      [testDoubleOptInTopic.id]: "unsubscribed",
      [foreignTopic.id]: "subscribed",
    });
    expect(eventCalls).toHaveLength(1);
    expect(JSON.parse(eventCalls[0].options.body as string).changes).toEqual([
      {
        topicId: testRegularTopic.id,
        topicName: testRegularTopic.name,
        action: "unsubscribed",
      },
    ]);
  });

  it("a fallback for a token pairing this contact with another org touches none of its rows", async () => {
    stubApi(() => Promise.resolve(new Response("boom", { status: 500 })));
    // contact_topic has no org column: without the org-scoped contact lookup
    // the fallback's topic writes would reach this contact's subscriptions.
    const otherOrgId = "test-pref-org-not-the-owner";
    const token = await generateUnsubscribeToken(testContact.id, otherOrgId);

    const result = await unsubscribeGlobally(token, testContact.id, otherOrgId);

    expect(result).toEqual({ success: true });
    expect(eventCalls).toHaveLength(0);
    expect((await readContact()).emailStatus).toBe("active");
    expect(await topicStatuses()).toEqual({
      [testRegularTopic.id]: "subscribed",
      [testDoubleOptInTopic.id]: "pending",
    });
  });
});

async function resetSms(state: {
  phone: string | null;
  smsStatus: "pending_consent" | "opted_in" | "opted_out" | null;
}) {
  await db
    .update(contact)
    .set({
      phone: state.phone,
      smsStatus: state.smsStatus,
      smsConsentedAt: null,
      smsOptedOutAt: null,
    })
    .where(eq(contact.id, testContact.id));
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
}

describe("updatePreferences — SMS consent", () => {
  afterAll(async () => {
    // Make sure smsEnabled is restored regardless of which test ran last.
    await db
      .update(awsAccount)
      .set({ smsEnabled: true })
      .where(eq(awsAccount.id, testAwsAccount.id));
  });

  it("grants consent", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "pending_consent" });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    expect(result.success).toBe(true);

    const [row] = await db
      .select({
        smsStatus: contact.smsStatus,
        smsConsentedAt: contact.smsConsentedAt,
      })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBe("opted_in");
    expect(row.smsConsentedAt).not.toBeNull();
  });

  it("writes an audit record", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "pending_consent" });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "contact.sms_consent_granted")
        )
      );

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.userId).toBeNull();
    expect(row.actorEmail).toBe(testContact.email);
    expect(row.resourceId).toBe(testContact.id);
    expect((row.metadata as Record<string, unknown> | null)?.source).toBe(
      "preference_center"
    );
    expect(
      (row.metadata as Record<string, unknown> | null)?.consentText
    ).toBeTruthy();
  });

  it("is idempotent — saving twice writes no extra audit rows", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "opted_in" });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, testOrganization.id));

    expect(rows).toHaveLength(0);
  });

  it("withdraws consent", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "opted_in" });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      false
    );

    expect(result.success).toBe(true);

    const [row] = await db
      .select({
        smsStatus: contact.smsStatus,
        smsOptedOutAt: contact.smsOptedOutAt,
      })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBe("opted_out");
    expect(row.smsOptedOutAt).not.toBeNull();

    const auditRows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "contact.sms_consent_withdrawn")
        )
      );
    expect(auditRows).toHaveLength(1);
  });

  it("withdrawal is not gated on the org's SMS setup", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "opted_in" });
    await db
      .update(awsAccount)
      .set({ smsEnabled: false })
      .where(eq(awsAccount.id, testAwsAccount.id));

    try {
      const token = await generateUnsubscribeToken(
        testContact.id,
        testOrganization.id
      );

      const result = await updatePreferences(
        token,
        testContact.id,
        testOrganization.id,
        {},
        undefined,
        false
      );

      expect(result.success).toBe(true);

      const [row] = await db
        .select({ smsStatus: contact.smsStatus })
        .from(contact)
        .where(eq(contact.id, testContact.id))
        .limit(1);

      expect(row.smsStatus).toBe("opted_out");
    } finally {
      await db
        .update(awsAccount)
        .set({ smsEnabled: true })
        .where(eq(awsAccount.id, testAwsAccount.id));
    }
  });

  it("granting is gated on the org's SMS setup", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "pending_consent" });
    await db
      .update(awsAccount)
      .set({ smsEnabled: false })
      .where(eq(awsAccount.id, testAwsAccount.id));

    try {
      const token = await generateUnsubscribeToken(
        testContact.id,
        testOrganization.id
      );

      const result = await updatePreferences(
        token,
        testContact.id,
        testOrganization.id,
        {},
        undefined,
        true
      );

      expect(result.success).toBe(true);

      const [row] = await db
        .select({ smsStatus: contact.smsStatus })
        .from(contact)
        .where(eq(contact.id, testContact.id))
        .limit(1);

      expect(row.smsStatus).toBe("pending_consent");

      const auditRows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.organizationId, testOrganization.id));
      expect(auditRows).toHaveLength(0);
    } finally {
      await db
        .update(awsAccount)
        .set({ smsEnabled: true })
        .where(eq(awsAccount.id, testAwsAccount.id));
    }
  });

  it("re-consent after withdrawal stamps a fresh timestamp", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "opted_out" });
    const pastDate = new Date("2020-01-01T00:00:00.000Z");
    await db
      .update(contact)
      .set({ smsConsentedAt: pastDate })
      .where(eq(contact.id, testContact.id));

    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    expect(result.success).toBe(true);

    const [row] = await db
      .select({
        smsStatus: contact.smsStatus,
        smsConsentedAt: contact.smsConsentedAt,
      })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBe("opted_in");
    expect(row.smsConsentedAt).not.toBeNull();
    expect((row.smsConsentedAt as Date).getTime()).toBeGreaterThan(
      pastDate.getTime()
    );
  });

  it("no phone, no consent", async () => {
    await resetSms({ phone: null, smsStatus: null });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    expect(result.success).toBe(true);

    const [row] = await db
      .select({ smsStatus: contact.smsStatus })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBeNull();

    const auditRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, testOrganization.id));
    expect(auditRows).toHaveLength(0);
  });

  it("omitting smsOptIn leaves SMS state untouched", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "opted_in" });
    const token = await generateUnsubscribeToken(
      testContact.id,
      testOrganization.id
    );

    const result = await updatePreferences(
      token,
      testContact.id,
      testOrganization.id,
      {}
    );

    expect(result.success).toBe(true);

    const [row] = await db
      .select({ smsStatus: contact.smsStatus })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBe("opted_in");

    const auditRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, testOrganization.id));
    expect(auditRows).toHaveLength(0);
  });

  it("a bad token still refuses the SMS write", async () => {
    await resetSms({ phone: "+15551234567", smsStatus: "pending_consent" });
    // Token generated for a different contact id
    const badToken = await generateUnsubscribeToken(
      "some-other-contact-id",
      testOrganization.id
    );

    const result = await updatePreferences(
      badToken,
      testContact.id,
      testOrganization.id,
      {},
      undefined,
      true
    );

    expect(result).toEqual({ success: false, error: "Invalid token" });

    const [row] = await db
      .select({ smsStatus: contact.smsStatus })
      .from(contact)
      .where(eq(contact.id, testContact.id))
      .limit(1);

    expect(row.smsStatus).toBe("pending_consent");
  });
});
