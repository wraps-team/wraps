/**
 * Tests for the broadcast test send (finding H5 of plan 189).
 *
 * The flow had no test send at all, so the only way to try a broadcast was to
 * send a real one. These cover the two things that make a test send worth
 * having: it renders what the broadcast will render, and it records nothing.
 */

import {
  awsAccount,
  batchSend,
  contact,
  db,
  member,
  messageSend,
  organization,
  organizationExtension,
  subscription,
  template,
  user,
} from "@wraps/db";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sendBroadcastTest } from "../broadcast-test-send";

const RUN_ID = crypto.randomUUID().slice(0, 8);

const testUser = {
  id: `tsend-user-${RUN_ID}`,
  email: `tsend-owner-${RUN_ID}@example.com`,
  name: "Test Send Owner",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `tsend-org-${RUN_ID}`,
  name: "Test Send Org",
  slug: `tsend-org-${RUN_ID}`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrg = {
  id: `tsend-other-org-${RUN_ID}`,
  name: "Test Send Other Org",
  slug: `tsend-other-org-${RUN_ID}`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testAwsAccount = {
  id: `tsend-aws-${RUN_ID}`,
  organizationId: testOrg.id,
  accountId: "111122223333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111122223333:role/test-role",
  externalId: `tsend-ext-${RUN_ID}`,
  name: "Test Send AWS",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const otherAwsAccount = {
  ...testAwsAccount,
  id: `tsend-other-aws-${RUN_ID}`,
  organizationId: otherOrg.id,
  externalId: `tsend-other-ext-${RUN_ID}`,
};

const testContact = {
  id: `tsend-contact-${RUN_ID}`,
  organizationId: testOrg.id,
  email: `tsend-recipient-${RUN_ID}@example.com`,
  emailHash: `tsend-hash-${RUN_ID}`,
  emailStatus: "active" as const,
  firstName: "Ada",
  lastName: "Lovelace",
  properties: { dashboardUrl: "https://dash.example.com/ada" },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const compiledTemplate = {
  id: `tsend-tmpl-${RUN_ID}`,
  organizationId: testOrg.id,
  name: "Test Send Template",
  subject: "Hi {{firstName}}",
  content: {},
  compiledHtml: "<p>Hi {{firstName}}, open {{dashboardUrl}}</p>",
  sourceFormat: "react-email" as const,
  variables: [],
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: `wraps-tsend-${RUN_ID}`,
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"),
  createdBy: testUser.id,
};

const uncompiledTemplate = {
  ...compiledTemplate,
  id: `tsend-tmpl-raw-${RUN_ID}`,
  name: "Uncompiled Template",
  compiledHtml: null,
  sesTemplateName: `wraps-tsend-raw-${RUN_ID}`,
};

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@wraps/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/auth")>();
  return {
    ...actual,
    auth: {
      ...actual.auth,
      api: {
        ...actual.auth.api,
        getSession: vi.fn(async () => ({
          user: { id: testUser.id, email: testUser.email },
          session: { token: "test-token" },
        })),
      },
    },
  };
});

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret",
    sessionToken: "token",
    expiration: new Date("2099-01-01"),
  })),
}));

const { sesSendMock } = vi.hoisted(() => ({
  sesSendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = sesSendMock;
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
  GetAccountCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@/actions/shared/verify-org-access", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/actions/shared/verify-org-access")>();
  return actual;
});

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values([testOrg, otherOrg])
    .onConflictDoNothing();
  await db
    .insert(organizationExtension)
    .values([{ organizationId: testOrg.id }, { organizationId: otherOrg.id }])
    .onConflictDoNothing();
  await db
    .insert(subscription)
    .values({
      id: `sub_tsend_${RUN_ID}`,
      plan: "growth",
      referenceId: testOrg.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: `tsend-member-${RUN_ID}`,
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "owner" as const,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(awsAccount)
    .values([testAwsAccount, otherAwsAccount])
    .onConflictDoNothing();
  await db.insert(contact).values(testContact).onConflictDoNothing();
  await db
    .insert(template)
    .values([compiledTemplate, uncompiledTemplate])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(template).where(eq(template.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, otherAwsAccount.id));
  await db.delete(member).where(eq(member.organizationId, testOrg.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_tsend_${RUN_ID}`));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrg.id));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, otherOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(() => {
  sesSendMock.mockReset();
  sesSendMock.mockResolvedValue({ MessageId: "ses-message-id-1" });
});

const basePayload = {
  awsAccountId: testAwsAccount.id,
  to: `verified-${RUN_ID}@example.com`,
  from: "hello@example.com",
  fromName: "Wraps",
  subject: "Hi {{firstName}}",
  templateId: compiledTemplate.id,
  recipientFilter: { audienceType: "all" as const },
};

async function countRows() {
  const [batches] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batchSend)
    .where(eq(batchSend.organizationId, testOrg.id));
  const [messages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageSend)
    .where(eq(messageSend.organizationId, testOrg.id));
  return { batches: batches?.count ?? 0, messages: messages?.count ?? 0 };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("sendBroadcastTest", () => {
  it("sends a rendered copy to the given address", async () => {
    const result = await sendBroadcastTest(testOrg.id, basePayload);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.messageId).toBe("ses-message-id-1");
    expect(sesSendMock).toHaveBeenCalledTimes(1);
  });

  it("renders against a real contact's data, not raw placeholders", async () => {
    const result = await sendBroadcastTest(testOrg.id, basePayload);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.renderedAs).toBe(testContact.email);

    const command = sesSendMock.mock.calls[0]?.[0] as {
      input: {
        Content: {
          Simple: {
            Subject: { Data: string };
            Body: { Html: { Data: string } };
          };
        };
        Destination: { ToAddresses: string[] };
      };
    };
    const html = command.input.Content.Simple.Body.Html.Data;
    const subject = command.input.Content.Simple.Subject.Data;

    expect(html).toContain("Hi Ada");
    expect(html).toContain("https://dash.example.com/ada");
    expect(html).not.toContain("{{");
    expect(subject).toBe("Hi Ada");
    expect(command.input.Destination.ToAddresses).toEqual([basePayload.to]);
  });

  it("records nothing — no batch row, no message row (H5 invariant)", async () => {
    const before = await countRows();

    const result = await sendBroadcastTest(testOrg.id, basePayload);
    expect(result.success).toBe(true);

    const after = await countRows();
    // A test send that showed up in history or moved a counter would become a
    // second source of untrue numbers — exactly what C1 and H1 were about.
    expect(after).toEqual(before);
  });

  it("applies a static variable mapping the same way the sender would", async () => {
    const result = await sendBroadcastTest(testOrg.id, {
      ...basePayload,
      variableMappings: [
        {
          variableName: "dashboardUrl",
          source: { type: "static", value: "https://static.example.com" },
        },
      ],
    });

    expect(result.success).toBe(true);
    const command = sesSendMock.mock.calls[0]?.[0] as {
      input: { Content: { Simple: { Body: { Html: { Data: string } } } } };
    };
    expect(command.input.Content.Simple.Body.Html.Data).toContain(
      "https://static.example.com"
    );
  });

  it("sends hand-authored HTML too, not just templates", async () => {
    const result = await sendBroadcastTest(testOrg.id, {
      ...basePayload,
      templateId: undefined,
      htmlContent: "<p>Custom hello {{firstName}}</p>",
    });

    expect(result.success).toBe(true);
    const command = sesSendMock.mock.calls[0]?.[0] as {
      input: { Content: { Simple: { Body: { Html: { Data: string } } } } };
    };
    expect(command.input.Content.Simple.Body.Html.Data).toContain(
      "Custom hello Ada"
    );
  });

  it("explains a sandbox rejection instead of passing SES's wording through bare", async () => {
    sesSendMock.mockRejectedValueOnce(
      new Error("Email address is not verified. MessageRejected")
    );

    const result = await sendBroadcastTest(testOrg.id, basePayload);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/SES sandbox/i);
    expect(result.error).toContain(basePayload.to);
  });

  it("rejects an invalid recipient before touching SES", async () => {
    const result = await sendBroadcastTest(testOrg.id, {
      ...basePayload,
      to: "not-an-email",
    });

    expect(result.success).toBe(false);
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it("refuses an uncompiled template with an actionable message", async () => {
    const result = await sendBroadcastTest(testOrg.id, {
      ...basePayload,
      templateId: uncompiledTemplate.id,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/compiled/i);
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it("refuses an AWS account belonging to another organization", async () => {
    const result = await sendBroadcastTest(testOrg.id, {
      ...basePayload,
      awsAccountId: otherAwsAccount.id,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("AWS account not found");
    expect(sesSendMock).not.toHaveBeenCalled();
  });
});
