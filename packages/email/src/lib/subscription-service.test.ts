import { beforeEach, describe, expect, it, vi } from "vitest";

type MockAccount = {
  id: string;
  roleArn: string;
  externalId: string;
  region: string;
};

type MockSettings = {
  organizationId?: string;
  confirmationTemplateId?: string | null;
  confirmationFromEmail?: string | null;
  confirmationFromName?: string | null;
  confirmationReplyToEmail?: string | null;
};

type MockTemplate = {
  subject: string | null;
  compiledHtml: string | null;
  compiledText: string | null;
};

type MockIdentity = {
  IdentityType?: string;
  SendingEnabled?: boolean;
  IdentityName?: string;
};

type MockCredentials = {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
};

type MockAssumeRoleResponse = {
  Credentials?: MockCredentials;
};

type WhereCall = {
  tableName: string;
  condition: unknown;
};

type SentEmail = {
  from: string | { name: string; email: string };
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type WrapsEmailConfig = {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
};

type MockTable = {
  __table: string;
  [key: string]: string;
};

const mockState = vi.hoisted(() => {
  const state = {
    organization: { name: "Wraps" } as { name: string } | null,
    account: {
      id: "acct_123",
      roleArn: "arn:aws:iam::123456789012:role/wraps-email",
      externalId: "external_123",
      region: "us-east-1",
    } as MockAccount | null,
    settings: null as MockSettings | null,
    template: null as MockTemplate | null,
    identities: [] as Array<MockIdentity>,
    assumeRoleResponse: {
      Credentials: {
        AccessKeyId: "AKIA123",
        SecretAccessKey: "secret123",
        SessionToken: "session123",
      },
    } as MockAssumeRoleResponse,
    whereCalls: [] as Array<WhereCall>,
    sentEmails: [] as Array<SentEmail>,
    wrapsEmailConfigs: [] as Array<WrapsEmailConfig>,
  };

  return {
    state,
    eq: vi.fn((left: unknown, right: unknown) => ({ kind: "eq", left, right })),
    and: vi.fn((...conditions: Array<unknown>) => ({
      kind: "and",
      conditions,
    })),
    stsSend: vi.fn(async () => state.assumeRoleResponse),
    sesSend: vi.fn(async () => ({ EmailIdentities: state.identities })),
    wrapsEmailSend: vi.fn(async (params: SentEmail) => {
      state.sentEmails.push(params);
      return { messageId: "msg_123" };
    }),
    wrapsEmailDestroy: vi.fn(),
    generateConfirmationUrl: vi.fn(
      async () => "https://example.com/confirm/token_123"
    ),
    generateTopicConfirmationEmail: vi.fn(
      ({
        topicName,
        topicDescription,
        organizationName,
        url,
      }: {
        topicName: string;
        topicDescription?: string | null;
        organizationName?: string;
        url: string;
      }) => ({
        subject: `Confirm ${topicName}`,
        html: `<p>${organizationName ?? "Wraps"} ${topicDescription ?? ""} <a href="${url}">Confirm</a></p>`,
        text: `Confirm ${topicName}: ${url}`,
      })
    ),
    toPlainText: vi.fn((html: string) => `plain:${html}`),
  };
});

vi.mock("@wraps/db", () => {
  const organizationTable: MockTable = {
    __table: "organization",
    id: "organization.id",
    name: "organization.name",
  };
  const awsAccountTable: MockTable = {
    __table: "awsAccount",
    id: "awsAccount.id",
    roleArn: "awsAccount.roleArn",
    externalId: "awsAccount.externalId",
    region: "awsAccount.region",
    organizationId: "awsAccount.organizationId",
  };
  const topicSettingsTable: MockTable = {
    __table: "topicSettings",
    organizationId: "topicSettings.organizationId",
  };
  const templateTable: MockTable = {
    __table: "template",
    id: "template.id",
    organizationId: "template.organizationId",
    subject: "template.subject",
    compiledHtml: "template.compiledHtml",
    compiledText: "template.compiledText",
  };

  const createSelectQuery = () => {
    let tableName = "";

    const query = {
      from: (table: MockTable) => {
        tableName = table.__table;
        return query;
      },
      where: (condition: unknown) => {
        mockState.state.whereCalls.push({ tableName, condition });
        return query;
      },
      limit: vi.fn(async (_count: number) => {
        switch (tableName) {
          case "organization":
            return mockState.state.organization
              ? [mockState.state.organization]
              : [];
          case "awsAccount":
            return mockState.state.account ? [mockState.state.account] : [];
          case "topicSettings":
            return mockState.state.settings ? [mockState.state.settings] : [];
          case "template":
            return mockState.state.template ? [mockState.state.template] : [];
          default:
            throw new Error(`Unexpected table query: ${tableName}`);
        }
      }),
    };

    return query;
  };

  return {
    awsAccount: awsAccountTable,
    and: mockState.and,
    db: {
      select: vi.fn(() => createSelectQuery()),
    },
    eq: mockState.eq,
    organization: organizationTable,
    template: templateTable,
    topicSettings: topicSettingsTable,
  };
});

vi.mock("@wraps.dev/email", () => ({
  WrapsEmail: class {
    constructor(config: WrapsEmailConfig) {
      mockState.state.wrapsEmailConfigs.push(config);
    }

    send = mockState.wrapsEmailSend;

    destroy = mockState.wrapsEmailDestroy;
  },
}));

vi.mock("@aws-sdk/client-sts", () => ({
  AssumeRoleCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  STSClient: class {
    send = mockState.stsSend;
  },
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  ListEmailIdentitiesCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  SESv2Client: class {
    send = mockState.sesSend;
  },
}));

vi.mock("./confirmation-token.js", () => ({
  generateConfirmationUrl: mockState.generateConfirmationUrl,
}));

vi.mock("../emails/topic-confirmation.js", () => ({
  generateTopicConfirmationEmail: mockState.generateTopicConfirmationEmail,
}));

vi.mock("@react-email/render", () => ({
  toPlainText: mockState.toPlainText,
}));

import {
  determineSubscriptionStatus,
  sendTopicConfirmationEmail,
} from "./subscription-service.js";

const createParams = () => ({
  contactId: "contact_123",
  contactEmail: "subscriber@example.com",
  topicId: "topic_123",
  topicName: "Product Updates",
  topicDescription: "Stay informed",
  organizationId: "org_123",
});

beforeEach(() => {
  mockState.state.organization = { name: "Wraps" };
  mockState.state.account = {
    id: "acct_123",
    roleArn: "arn:aws:iam::123456789012:role/wraps-email",
    externalId: "external_123",
    region: "us-east-1",
  };
  mockState.state.settings = null;
  mockState.state.template = null;
  mockState.state.assumeRoleResponse = {
    Credentials: {
      AccessKeyId: "AKIA123",
      SecretAccessKey: "secret123",
      SessionToken: "session123",
    },
  };
  mockState.state.identities.length = 0;
  mockState.state.whereCalls.length = 0;
  mockState.state.sentEmails.length = 0;
  mockState.state.wrapsEmailConfigs.length = 0;

  mockState.eq.mockClear();
  mockState.and.mockClear();
  mockState.stsSend.mockClear();
  mockState.sesSend.mockClear();
  mockState.wrapsEmailSend.mockClear();
  mockState.wrapsEmailDestroy.mockClear();
  mockState.generateConfirmationUrl.mockClear();
  mockState.generateTopicConfirmationEmail.mockClear();
  mockState.toPlainText.mockClear();
});

describe("determineSubscriptionStatus", () => {
  it("returns subscribed when the topic does not require double opt-in", async () => {
    const result = await determineSubscriptionStatus({
      ...createParams(),
      topicDoubleOptIn: false,
    });

    expect(result).toEqual({ status: "subscribed" });
    expect(mockState.stsSend).not.toHaveBeenCalled();
    expect(mockState.wrapsEmailSend).not.toHaveBeenCalled();
  });

  it("returns subscribed for re-subscriptions that were already confirmed", async () => {
    const result = await determineSubscriptionStatus({
      ...createParams(),
      topicDoubleOptIn: true,
      existingSubscription: {
        status: "unsubscribed",
        confirmedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });

    expect(result).toEqual({ status: "subscribed" });
    expect(mockState.stsSend).not.toHaveBeenCalled();
    expect(mockState.wrapsEmailSend).not.toHaveBeenCalled();
  });

  it("returns pending when a confirmation email is sent", async () => {
    mockState.state.settings = {
      confirmationFromEmail: "updates@wraps.dev",
      confirmationFromName: "Wraps",
      confirmationReplyToEmail: "support@wraps.dev",
    };

    const result = await determineSubscriptionStatus({
      ...createParams(),
      topicDoubleOptIn: true,
    });

    expect(result).toEqual({
      status: "pending",
      confirmationEmailSent: true,
    });
    expect(mockState.wrapsEmailSend).toHaveBeenCalledTimes(1);
    expect(mockState.state.sentEmails[0]).toMatchObject({
      from: { name: "Wraps", email: "updates@wraps.dev" },
      to: "subscriber@example.com",
      subject: "Confirm Product Updates",
      replyTo: "support@wraps.dev",
    });
  });

  it("returns pending with an error when sending the confirmation email fails", async () => {
    mockState.state.settings = {
      confirmationFromEmail: "updates@wraps.dev",
    };
    mockState.stsSend.mockRejectedValueOnce(new Error("assume role failed"));

    const result = await determineSubscriptionStatus({
      ...createParams(),
      topicDoubleOptIn: true,
    });

    expect(result).toEqual({
      status: "pending",
      confirmationEmailSent: false,
      error: "assume role failed",
    });
    expect(mockState.wrapsEmailSend).not.toHaveBeenCalled();
  });
});

describe("sendTopicConfirmationEmail", () => {
  it("scopes custom confirmation templates to the organization and substitutes variables", async () => {
    mockState.state.settings = {
      organizationId: "org_123",
      confirmationTemplateId: "template_123",
      confirmationFromEmail: "updates@wraps.dev",
      confirmationFromName: "Wraps",
    };
    mockState.state.template = {
      subject: "Confirm {{ topic.name }}",
      compiledHtml:
        '<p>Hello {{ contact.email }}</p><a href="{{ confirmationUrl }}">Confirm</a>',
      compiledText: null,
    };

    const emailSent = await sendTopicConfirmationEmail(createParams());

    expect(emailSent).toBe(true);
    expect(mockState.eq).toHaveBeenCalledWith(
      "template.id",
      "template_123"
    );
    expect(mockState.eq).toHaveBeenCalledWith(
      "template.organizationId",
      "org_123"
    );
    expect(mockState.and).toHaveBeenCalledWith(
      { kind: "eq", left: "template.id", right: "template_123" },
      { kind: "eq", left: "template.organizationId", right: "org_123" }
    );

    const templateWhereCall = mockState.state.whereCalls.find(
      (call) => call.tableName === "template"
    );
    expect(templateWhereCall).toEqual({
      tableName: "template",
      condition: {
        kind: "and",
        conditions: [
          { kind: "eq", left: "template.id", right: "template_123" },
          { kind: "eq", left: "template.organizationId", right: "org_123" },
        ],
      },
    });

    expect(mockState.state.sentEmails[0]).toMatchObject({
      subject: "Confirm Product Updates",
      html: expect.stringContaining(
        "https://example.com/confirm/token_123"
      ),
      text: expect.stringContaining("plain:"),
    });
    expect(mockState.toPlainText).toHaveBeenCalledTimes(1);
    expect(mockState.wrapsEmailDestroy).toHaveBeenCalledTimes(1);
  });
});
