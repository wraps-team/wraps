/**
 * Audit Log Instrumentation Tests — Audit Coverage Gaps
 *
 * Verifies that each previously-unaudited mutation surface writes a correctly-shaped
 * audit log row: permissions grant/revoke, contacts-topics subscribe/unsubscribe,
 * org create, sender defaults update, and webhook secret save/remove.
 */

import {
  auditLog,
  awsAccount,
  awsAccountPermission,
  contact,
  contactTopic,
  db,
  member,
  organization,
  subscription,
  topic,
  user,
} from "@wraps/db";
import { organizationExtension } from "@wraps/db/schema/app";
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

// --- Mocks (hoisted before imports) ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@tanstack/react-form-nextjs", () => ({
  createServerValidate: vi.fn(),
  formOptions: vi.fn((opts: unknown) => opts),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "audit-gaps-user-a",
          email: "audit-gaps-user-a@example.com",
          name: "Audit Gaps User A",
        },
        session: {
          id: "audit-gaps-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "audit-gaps-user-a",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-gaps-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(
    async (_slug: string, _userId: string) => ({
      id: "audit-gaps-org-a",
      name: "Audit Gaps Org A",
      slug: "audit-gaps-org-a",
      userRole: "owner",
    })
  ),
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, "-")
  ),
}));

// --- Fixtures ---

const fixUser = {
  id: "audit-gaps-user-a",
  email: "audit-gaps-user-a@example.com",
  name: "Audit Gaps User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const fixOrg = {
  id: "audit-gaps-org-a",
  name: "Audit Gaps Org A",
  slug: "audit-gaps-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const fixMember = {
  id: "audit-gaps-member-a",
  organizationId: fixOrg.id,
  userId: fixUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const fixSubscription = {
  id: "audit-gaps-sub-a",
  plan: "starter",
  referenceId: fixOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fixAwsAccount = {
  id: "audit-gaps-aws-a",
  organizationId: fixOrg.id,
  name: "Audit Gaps AWS",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/wraps-console-access-role",
  externalId: "audit-gaps-ext-id-a",
  isVerified: true,
  emailEnabled: true,
  smsEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fixContact = {
  id: "audit-gaps-contact-a",
  organizationId: fixOrg.id,
  email: "audit-gaps-contact@example.com",
  emailHash: "audit-gaps-contact-hash",
  emailStatus: "active" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fixTopic = {
  id: "audit-gaps-topic-a",
  organizationId: fixOrg.id,
  name: "Audit Gaps Topic",
  slug: "audit-gaps-topic-a",
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// grantAccessAction's `serverValidateGrant` is bound once, at module import
// time, to whatever `createServerValidate` returns at that moment — later
// `mockReturnValue` calls have no effect on it. Route every test's "form
// data" through this mutable box instead so each test can vary it.
let grantFormValues: {
  userId: string;
  awsAccountId: string;
  permissions: "READ_ONLY" | "FULL_ACCESS" | "ADMIN";
  expiresAt: string | undefined;
} = {
  userId: "",
  awsAccountId: "",
  permissions: "READ_ONLY",
  expiresAt: undefined,
};

// --- Fixtures for permissions.ts denial-path tests ---

const fixUserNonOwner = {
  id: "audit-gaps-user-nonowner",
  email: "audit-gaps-user-nonowner@example.com",
  name: "Audit Gaps Non-Owner",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const fixUserOutsider = {
  id: "audit-gaps-user-outsider",
  email: "audit-gaps-user-outsider@example.com",
  name: "Audit Gaps Outsider",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const fixMemberNonOwner = {
  id: "audit-gaps-member-nonowner",
  organizationId: fixOrg.id,
  userId: fixUserNonOwner.id,
  role: "member" as const,
  createdAt: new Date(),
};

const fixOrgB = {
  id: "audit-gaps-org-b",
  name: "Audit Gaps Org B",
  slug: "audit-gaps-org-b",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const fixAwsAccountB = {
  id: "audit-gaps-aws-b",
  organizationId: fixOrgB.id,
  name: "Audit Gaps AWS B",
  accountId: "210987654321",
  region: "us-east-1",
  roleArn: "arn:aws:iam::210987654321:role/wraps-console-access-role",
  externalId: "audit-gaps-ext-id-b",
  isVerified: true,
  emailEnabled: true,
  smsEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- DB setup & teardown ---

beforeAll(async () => {
  const { createServerValidate } = await import("@tanstack/react-form-nextjs");
  vi.mocked(createServerValidate).mockReturnValue(
    (async () => grantFormValues) as ReturnType<typeof createServerValidate>
  );

  await db
    .insert(user)
    .values(fixUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(fixOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: fixOrg.name },
    });

  await db
    .insert(organizationExtension)
    .values({
      organizationId: fixOrg.id,
      awsAccountCount: 0,
      memberCount: 1,
      onboardingCompleted: false,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(member)
    .values(fixMember)
    .onConflictDoUpdate({ target: member.id, set: { role: fixMember.role } });

  await db
    .insert(subscription)
    .values(fixSubscription)
    .onConflictDoUpdate({
      target: subscription.id,
      set: { status: fixSubscription.status },
    });

  await db
    .insert(awsAccount)
    .values(fixAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(contact)
    .values(fixContact)
    .onConflictDoUpdate({ target: contact.id, set: { updatedAt: new Date() } });

  await db
    .insert(topic)
    .values(fixTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: fixTopic.name },
    });

  // Second org + cross-org caller/target fixtures for the permissions.ts
  // denial-path tests — these run against the real authorization checks.
  await db
    .insert(user)
    .values(fixUserNonOwner)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(user)
    .values(fixUserOutsider)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(member)
    .values(fixMemberNonOwner)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: fixMemberNonOwner.role },
    });

  await db
    .insert(organization)
    .values(fixOrgB)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: fixOrgB.name },
    });

  await db
    .insert(awsAccount)
    .values(fixAwsAccountB)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, fixOrg.id));
  await db
    .delete(contactTopic)
    .where(eq(contactTopic.contactId, fixContact.id));
  await db.delete(contact).where(eq(contact.id, fixContact.id));
  await db.delete(topic).where(eq(topic.id, fixTopic.id));
  await db
    .delete(awsAccountPermission)
    .where(eq(awsAccountPermission.awsAccountId, fixAwsAccount.id));
  await db
    .delete(awsAccountPermission)
    .where(eq(awsAccountPermission.awsAccountId, fixAwsAccountB.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, fixAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, fixAwsAccountB.id));
  await db.delete(subscription).where(eq(subscription.id, fixSubscription.id));
  await db.delete(member).where(eq(member.organizationId, fixOrg.id));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, fixOrg.id));
  await db.delete(organization).where(eq(organization.id, fixOrg.id));
  await db.delete(organization).where(eq(organization.id, fixOrgB.id));
  await db.delete(user).where(eq(user.id, fixUser.id));
  await db.delete(user).where(eq(user.id, fixUserNonOwner.id));
  await db.delete(user).where(eq(user.id, fixUserOutsider.id));
});

// ============================================================
// permissions.ts
// ============================================================

describe("grantAccessAction — writes permissions.granted audit log", () => {
  it("inserts a permissions.granted audit log row with correct fields", async () => {
    grantFormValues = {
      userId: fixUser.id,
      awsAccountId: fixAwsAccount.id,
      permissions: "READ_ONLY",
      expiresAt: undefined,
    };

    const { grantAccessAction } = await import("../permissions");
    const result = await grantAccessAction(undefined, new FormData());

    expect((result as { success: boolean }).success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "permissions.granted")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("permissions.granted");
    expect(row.resource).toBe("aws_account_permission");
    expect(row.metadata).toMatchObject({
      awsAccountId: fixAwsAccount.id,
      targetUserId: fixUser.id,
      permissions: "READ_ONLY",
    });
  });
});

describe("revokeAccessAction — writes permissions.revoked audit log", () => {
  it("inserts a permissions.revoked audit log row with correct fields", async () => {
    const { revokeAccessAction } = await import("../permissions");
    const result = await revokeAccessAction(fixUser.id, fixAwsAccount.id);

    expect((result as { success: boolean }).success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "permissions.revoked")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("permissions.revoked");
    expect(row.resource).toBe("aws_account_permission");
    expect(row.metadata).toMatchObject({
      awsAccountId: fixAwsAccount.id,
      targetUserId: fixUser.id,
    });
  });
});

describe("grantAccessAction — denial paths", () => {
  it("denies a caller without manage permission on the account", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: {
        id: fixUserNonOwner.id,
        email: fixUserNonOwner.email,
        name: fixUserNonOwner.name,
      },
      session: {
        id: "audit-gaps-session-nonowner-grant",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: fixUserNonOwner.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "audit-gaps-token-nonowner-grant",
      },
    } as any);

    grantFormValues = {
      userId: fixUser.id,
      awsAccountId: fixAwsAccount.id,
      permissions: "READ_ONLY",
      expiresAt: undefined,
    };

    const { grantAccessAction } = await import("../permissions");
    const result = await grantAccessAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "Access denied" });
  });

  it("denies a caller whose org does not own the AWS account", async () => {
    grantFormValues = {
      userId: fixUser.id,
      awsAccountId: fixAwsAccountB.id,
      permissions: "READ_ONLY",
      expiresAt: undefined,
    };

    const { grantAccessAction } = await import("../permissions");
    const result = await grantAccessAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "Access denied" });
    expect((result as { error?: string }).error).not.toBe("Internal error");
  });

  it("denies granting to a user who is not a member of the account's org", async () => {
    grantFormValues = {
      userId: fixUserOutsider.id,
      awsAccountId: fixAwsAccount.id,
      permissions: "READ_ONLY",
      expiresAt: undefined,
    };

    const { grantAccessAction } = await import("../permissions");
    const result = await grantAccessAction(undefined, new FormData());

    expect(result).toMatchObject({ error: "User not found in organization" });
  });
});

describe("revokeAccessAction — denial paths", () => {
  it("denies a caller without manage permission on the account", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: {
        id: fixUserNonOwner.id,
        email: fixUserNonOwner.email,
        name: fixUserNonOwner.name,
      },
      session: {
        id: "audit-gaps-session-nonowner-revoke",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: fixUserNonOwner.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "audit-gaps-token-nonowner-revoke",
      },
    } as any);

    const { revokeAccessAction } = await import("../permissions");
    const result = await revokeAccessAction(fixUser.id, fixAwsAccount.id);

    expect(result).toMatchObject({ error: "Access denied" });
  });

  it("denies a caller whose org does not own the AWS account", async () => {
    const { revokeAccessAction } = await import("../permissions");
    const result = await revokeAccessAction(fixUser.id, fixAwsAccountB.id);

    expect(result).toMatchObject({ error: "Access denied" });
    expect((result as { error?: string }).error).not.toBe(
      "Something went wrong. Please try again."
    );
  });
});

// ============================================================
// contacts-topics.ts
// ============================================================

describe("subscribeContactToTopics — writes contact.topic_subscribed audit log", () => {
  afterEach(async () => {
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, fixContact.id));
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topic_subscribed")
        )
      );
  });

  it("inserts a contact.topic_subscribed audit log row", async () => {
    const { subscribeContactToTopics } = await import("../contacts-topics");
    const result = await subscribeContactToTopics(fixContact.id, fixOrg.id, [
      fixTopic.id,
    ]);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topic_subscribed")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.action).toBe("contact.topic_subscribed");
    expect(row.resource).toBe("contact");
    expect(row.resourceId).toBe(fixContact.id);
    expect(row.metadata).toMatchObject({
      contactId: fixContact.id,
      topicIds: [fixTopic.id],
    });
  });
});

describe("unsubscribeContactFromTopics — writes contact.topic_unsubscribed audit log", () => {
  beforeEach(async () => {
    await db
      .insert(contactTopic)
      .values({
        contactId: fixContact.id,
        topicId: fixTopic.id,
        status: "subscribed",
      })
      .onConflictDoNothing();
  });

  afterEach(async () => {
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, fixContact.id));
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topic_unsubscribed")
        )
      );
  });

  it("inserts a contact.topic_unsubscribed audit log row", async () => {
    const { unsubscribeContactFromTopics } = await import("../contacts-topics");
    const result = await unsubscribeContactFromTopics(
      fixContact.id,
      fixOrg.id,
      [fixTopic.id]
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topic_unsubscribed")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.action).toBe("contact.topic_unsubscribed");
    expect(row.resource).toBe("contact");
    expect(row.resourceId).toBe(fixContact.id);
    expect(row.metadata).toMatchObject({
      contactId: fixContact.id,
      topicIds: [fixTopic.id],
    });
  });
});

describe("bulkSubscribeContactsToTopics — writes contact.topics_bulk_subscribed audit log", () => {
  afterEach(async () => {
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, fixContact.id));
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topics_bulk_subscribed")
        )
      );
  });

  it("inserts a contact.topics_bulk_subscribed audit log row", async () => {
    const { bulkSubscribeContactsToTopics } = await import(
      "../contacts-topics"
    );
    const result = await bulkSubscribeContactsToTopics(
      fixOrg.id,
      [fixContact.id],
      [fixTopic.id]
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topics_bulk_subscribed")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.action).toBe("contact.topics_bulk_subscribed");
    expect(row.resource).toBe("contact");
    expect(row.metadata).toMatchObject({
      contactCount: 1,
      topicIds: [fixTopic.id],
    });
  });
});

describe("bulkUnsubscribeContactsFromTopics — writes contact.topics_bulk_unsubscribed audit log", () => {
  beforeEach(async () => {
    await db
      .insert(contactTopic)
      .values({
        contactId: fixContact.id,
        topicId: fixTopic.id,
        status: "subscribed",
      })
      .onConflictDoNothing();
  });

  afterEach(async () => {
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.contactId, fixContact.id));
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topics_bulk_unsubscribed")
        )
      );
  });

  it("inserts a contact.topics_bulk_unsubscribed audit log row", async () => {
    const { bulkUnsubscribeContactsFromTopics } = await import(
      "../contacts-topics"
    );
    const result = await bulkUnsubscribeContactsFromTopics(
      fixOrg.id,
      [fixContact.id],
      [fixTopic.id]
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "contact.topics_bulk_unsubscribed")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.action).toBe("contact.topics_bulk_unsubscribed");
    expect(row.resource).toBe("contact");
    expect(row.metadata).toMatchObject({
      contactCount: 1,
      topicIds: [fixTopic.id],
    });
  });
});

// ============================================================
// organizations.ts
// ============================================================

describe("createOrganizationAction — writes org.created audit log", () => {
  const newOrgSlug = "audit-gaps-created-org";

  afterEach(async () => {
    const createdOrg = await db.query.organization.findFirst({
      where: (o, { eq: eqOp }) => eqOp(o.slug, newOrgSlug),
    });
    if (createdOrg) {
      await db
        .delete(auditLog)
        .where(eq(auditLog.organizationId, createdOrg.id));
      await db.delete(member).where(eq(member.organizationId, createdOrg.id));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, createdOrg.id));
      await db.delete(organization).where(eq(organization.id, createdOrg.id));
    }
  });

  it("inserts an org.created audit log row after creating an organization", async () => {
    const { createOrganizationAction } = await import("../organizations");
    const result = await createOrganizationAction({
      name: "Audit Gaps Created Org",
      slug: newOrgSlug,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, result.organization.id),
          eq(auditLog.action, "org.created")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(result.organization.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("org.created");
    expect(row.resource).toBe("organization");
    expect(row.resourceId).toBe(result.organization.id);
    expect(row.metadata).toMatchObject({
      name: "Audit Gaps Created Org",
      slug: newOrgSlug,
    });
  });
});

describe("updateSenderDefaultsAction — writes settings.sender_defaults_updated audit log", () => {
  afterEach(async () => {
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.sender_defaults_updated")
        )
      );
  });

  it("inserts a settings.sender_defaults_updated audit log row", async () => {
    const { updateSenderDefaultsAction } = await import("../organizations");
    const result = await updateSenderDefaultsAction(fixOrg.slug, {
      defaultFrom: "noreply@example.com",
      defaultFromName: "Test",
    });

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.sender_defaults_updated")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("settings.sender_defaults_updated");
    expect(row.resource).toBe("organization");
    expect(row.resourceId).toBe(fixOrg.id);
  });
});

// ============================================================
// aws-accounts.ts
// ============================================================

describe("saveWebhookSecretAction — writes settings.webhook_secret_saved audit log", () => {
  afterEach(async () => {
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.webhook_secret_saved")
        )
      );
  });

  it("inserts a settings.webhook_secret_saved audit log row", async () => {
    const { saveWebhookSecretAction } = await import("../aws-accounts");
    const result = await saveWebhookSecretAction(
      fixAwsAccount.id,
      "a".repeat(64),
      fixOrg.id
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.webhook_secret_saved")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("settings.webhook_secret_saved");
    expect(row.resource).toBe("aws_account");
    expect(row.resourceId).toBe(fixAwsAccount.id);
  });
});

describe("removeWebhookSecretAction — writes settings.webhook_secret_removed audit log", () => {
  afterEach(async () => {
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.webhook_secret_removed")
        )
      );
  });

  it("inserts a settings.webhook_secret_removed audit log row", async () => {
    const { removeWebhookSecretAction } = await import("../aws-accounts");
    const result = await removeWebhookSecretAction(fixAwsAccount.id, fixOrg.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "settings.webhook_secret_removed")
        )
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("settings.webhook_secret_removed");
    expect(row.resource).toBe("aws_account");
    expect(row.resourceId).toBe(fixAwsAccount.id);
  });
});
