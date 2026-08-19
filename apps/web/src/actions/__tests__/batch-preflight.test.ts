/**
 * Tests for broadcast pre-flight template variable coverage validation.
 *
 * Tests the `checkTemplateVariableCoverage` action which detects when
 * template variables cannot be resolved for contacts in the audience,
 * and the `promoteDraftToSend` block that prevents all-fail sends.
 */

import {
  awsAccount,
  batchSend,
  contact,
  db,
  member,
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
import { checkFeatureAccess } from "@/lib/plan-limits";
import {
  checkBroadcastSendDuration,
  checkHtmlVariableCoverage,
  checkTemplateVariableCoverage,
  createBatchSend,
  promoteDraftToSend,
  saveDraftBatchSend,
} from "../batch";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const RUN_ID = crypto.randomUUID().slice(0, 8);

const testUser = {
  id: `preflight-user-${RUN_ID}`,
  email: `preflight-owner-${RUN_ID}@example.com`,
  name: "Preflight Owner",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: `preflight-org-${RUN_ID}`,
  name: "Preflight Test Org",
  slug: `preflight-test-org-${RUN_ID}`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOwnerMember = {
  id: `preflight-owner-member-${RUN_ID}`,
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: `preflight-aws-${RUN_ID}`,
  organizationId: testOrganization.id,
  accountId: "111122223333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111122223333:role/test-role",
  externalId: `preflight-ext-${RUN_ID}`,
  name: "Preflight AWS Account",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

// Template with ONLY known contact variables — no custom vars
const templateNoCustomVars = {
  id: `preflight-tmpl-known-${RUN_ID}`,
  organizationId: testOrganization.id,
  name: "Known Vars Template",
  subject: "Hello {{contact.firstName}}",
  content: {},
  sourceFormat: "react-email" as const,
  variables: [
    { name: "contact.firstName", fallback: undefined },
    { name: "unsubscribeUrl", fallback: undefined },
  ],
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: `wraps-org-preflight-known-${RUN_ID}`,
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"),
  createdBy: testUser.id,
};

// Template with ONE custom variable (no fallback)
const templateWithCustomVar = {
  id: `preflight-tmpl-custom-${RUN_ID}`,
  organizationId: testOrganization.id,
  name: "Custom Var Template",
  subject: "Your dashboard",
  content: {},
  sourceFormat: "react-email" as const,
  variables: [
    { name: "contact.firstName", fallback: undefined },
    { name: "dashboardUrl", fallback: undefined }, // custom, no fallback
  ],
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: `wraps-org-preflight-custom-${RUN_ID}`,
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"),
  createdBy: testUser.id,
};

// Template with a custom variable that HAS a fallback
const templateWithFallback = {
  id: `preflight-tmpl-fallback-${RUN_ID}`,
  organizationId: testOrganization.id,
  name: "Fallback Template",
  subject: "Your account",
  content: {},
  sourceFormat: "react-email" as const,
  variables: [
    { name: "dashboardUrl", fallback: "https://default.example.com" }, // has fallback
  ],
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: `wraps-org-preflight-fallback-${RUN_ID}`,
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"),
  createdBy: testUser.id,
};

// Contact that HAS the dashboardUrl property
const contactWithProp = {
  id: `preflight-contact-has-${RUN_ID}`,
  organizationId: testOrganization.id,
  email: `has-prop-${RUN_ID}@example.com`,
  emailHash: `hash-has-${RUN_ID}`,
  emailStatus: "active" as const,
  properties: { dashboardUrl: "https://myapp.example.com/dashboard" },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// Contact that does NOT have dashboardUrl
const contactWithoutProp = {
  id: `preflight-contact-nope-${RUN_ID}`,
  organizationId: testOrganization.id,
  email: `no-prop-${RUN_ID}@example.com`,
  emailHash: `hash-nope-${RUN_ID}`,
  emailStatus: "active" as const,
  properties: {},
  createdAt: new Date("2026-01-02"),
  updatedAt: new Date("2026-01-02"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        },
        session: {
          id: "session-preflight",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token-preflight",
        },
      })),
    },
  },
}));

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/actions/templates", () => ({
  publishTemplateToSES: vi.fn(async () => ({
    success: true,
    sesTemplateName: "wraps-test-template",
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Daily quota reserve preflight mocks — AssumeRole + SES GetAccount
// ─────────────────────────────────────────────────────────────────────────────

const getOrAssumeRoleMock = vi.fn().mockResolvedValue({
  accessKeyId: "AKIA-test",
  secretAccessKey: "secret-test",
  sessionToken: "token-test",
  expiration: new Date("2099-01-01"),
});

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => getOrAssumeRoleMock(...args),
}));

let sesGetAccountShouldThrow = false;
let sesGetAccountQuota: {
  Max24HourSend?: number;
  SentLast24Hours?: number;
} | null = null;
/** undefined = AWS said nothing, which must NOT read as "in the sandbox". */
let sesProductionAccessEnabled: boolean | undefined;

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockImplementation(() => {
      if (sesGetAccountShouldThrow) {
        return Promise.reject(new Error("GetAccount failed: network error"));
      }
      return Promise.resolve({
        SendQuota: sesGetAccountQuota ?? {},
        ...(sesProductionAccessEnabled === undefined
          ? {}
          : { ProductionAccessEnabled: sesProductionAccessEnabled }),
      });
    });
  },
  GetAccountCommand: class {
    constructor(public input: unknown) {}
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  await db
    .insert(organizationExtension)
    .values({ organizationId: testOrganization.id })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(subscription)
    .values({
      id: `sub_preflight_${RUN_ID}`,
      plan: "growth",
      referenceId: testOrganization.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: { plan: "growth", status: "active" },
    });

  await db
    .insert(member)
    .values(testOwnerMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testOwnerMember.role },
    });

  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: testAwsAccount.name },
    });

  await db
    .insert(template)
    .values([templateNoCustomVars, templateWithCustomVar, templateWithFallback])
    .onConflictDoNothing();

  await db
    .insert(contact)
    .values([contactWithProp, contactWithoutProp])
    .onConflictDoNothing();
});

beforeEach(() => {
  vi.clearAllMocks();
  sesGetAccountShouldThrow = false;
  sesGetAccountQuota = null;
  sesProductionAccessEnabled = undefined;
  getOrAssumeRoleMock.mockResolvedValue({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret-test",
    sessionToken: "token-test",
    expiration: new Date("2099-01-01"),
  });
});

afterAll(async () => {
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testOrganization.id));
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  await db.delete(template).where(eq(template.id, templateNoCustomVars.id));
  await db.delete(template).where(eq(template.id, templateWithCustomVar.id));
  await db.delete(template).where(eq(template.id, templateWithFallback.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testOwnerMember.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_preflight_${RUN_ID}`));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 2: clean when template has no custom variables
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — no custom variables", () => {
  it("returns allFail=false and missingCount=0 when template only uses known contact variables", async () => {
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateNoCustomVars.id,
      { audienceType: "all" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBe(0);
    expect(result.missingVariables).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 2b: handlebars block tags in the subject are not treated as variables
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — handlebars conditionals in subject", () => {
  it("does not report {{#if}}/{{/if}} block tags as missing variables", async () => {
    // Regression: the subject parser captured "#if firstName" and "/if" as
    // variable names, so every contact was reported as missing them.
    const conditionalTemplate = {
      ...templateNoCustomVars,
      id: `preflight-tmpl-cond-${RUN_ID}`,
      name: "Conditional Subject Template",
      subject:
        "The setup just got easier{{#if firstName}}, {{firstName}}{{/if}}.",
      variables: [],
      sesTemplateName: `wraps-org-preflight-cond-${RUN_ID}`,
    };

    await db.insert(template).values(conditionalTemplate).onConflictDoNothing();

    try {
      const result = await checkTemplateVariableCoverage(
        testOrganization.id,
        conditionalTemplate.id,
        { audienceType: "all" }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.allFail).toBe(false);
      expect(result.missingCount).toBe(0);
      expect(result.missingVariables).toHaveLength(0);
    } finally {
      await db.delete(template).where(eq(template.id, conditionalTemplate.id));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 3: warning when SOME contacts are missing a custom variable
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — partial coverage", () => {
  it("returns allFail=false and missingCount>0 when one contact is missing the custom variable", async () => {
    // contactWithProp has dashboardUrl, contactWithoutProp does not
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateWithCustomVar.id,
      { audienceType: "all" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBeGreaterThan(0);
    expect(result.missingCount).toBeLessThan(result.totalSampled);
    expect(result.missingVariables).toContain("dashboardUrl");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 4: allFail=true when all contacts are missing the variable
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — all contacts missing variable", () => {
  it("returns allFail=true when no contact in the audience has the required variable", async () => {
    // Use a template with a variable ("dashboardUrl") but only the contact
    // WITHOUT it — filter audience to topic we know only has that contact.
    // Simplest approach: use a separate contact-only audience by temporarily
    // setting up a scenario where only contactWithoutProp is reachable.
    // We can test this by creating a separate org with only the no-prop contact.
    const allFailOrgId = `preflight-allfail-org-${RUN_ID}`;
    const allFailContactId = `preflight-allfail-contact-${RUN_ID}`;

    await db
      .insert(organization)
      .values({
        id: allFailOrgId,
        name: "All Fail Org",
        slug: `allfail-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(member)
      .values({
        id: `preflight-allfail-member-${RUN_ID}`,
        organizationId: allFailOrgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: allFailContactId,
        organizationId: allFailOrgId,
        email: `allfail-${RUN_ID}@example.com`,
        emailHash: `hash-allfail-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {}, // missing dashboardUrl
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const allFailTemplate = {
      id: `preflight-allfail-tmpl-${RUN_ID}`,
      organizationId: allFailOrgId,
      name: "All Fail Template",
      subject: "Your dashboard",
      content: {},
      sourceFormat: "react-email" as const,
      variables: [{ name: "dashboardUrl", fallback: undefined }],
      status: "PUBLISHED" as const,
      type: "EMAIL" as const,
      sesTemplateName: `wraps-allfail-${RUN_ID}`,
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date("2025-12-01"),
      createdBy: testUser.id,
    };

    await db.insert(template).values(allFailTemplate).onConflictDoNothing();

    try {
      const result = await checkTemplateVariableCoverage(
        allFailOrgId,
        allFailTemplate.id,
        { audienceType: "all" }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.allFail).toBe(true);
      expect(result.missingCount).toBe(result.totalSampled);
      expect(result.missingVariables).toContain("dashboardUrl");
    } finally {
      await db.delete(template).where(eq(template.id, allFailTemplate.id));
      await db.delete(contact).where(eq(contact.id, allFailContactId));
      await db.delete(member).where(eq(member.organizationId, allFailOrgId));
      await db.delete(organization).where(eq(organization.id, allFailOrgId));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 5: ignores variables that have a fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — fallback variables are safe", () => {
  it("returns allFail=false and missingCount=0 when the custom variable has a fallback", async () => {
    // templateWithFallback has dashboardUrl with a fallback — contacts
    // without dashboardUrl in properties should NOT count as missing.
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateWithFallback.id,
      { audienceType: "all" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBe(0);
    expect(result.missingVariables).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 6: ignores variables covered by a static mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — static mappings cover variables", () => {
  it("returns allFail=false and missingCount=0 when the variable is covered by a static mapping", async () => {
    // templateWithCustomVar has dashboardUrl (no fallback), but we supply
    // a static mapping for it → should be safe for all contacts.
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateWithCustomVar.id,
      { audienceType: "all" },
      [
        {
          variableName: "dashboardUrl",
          source: { type: "static", value: "https://static.example.com" },
        },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBe(0);
    expect(result.missingVariables).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 6b: contact-field mappings resolve from the column, not properties
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTemplateVariableCoverage — contact-field mappings", () => {
  it("reads the mapped contact column instead of a same-named custom property", async () => {
    // dashboardUrl is mapped to the contact's email column. Neither sampled
    // contact has a dashboardUrl property, but both have an email, so the
    // variable resolves for everyone.
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateWithCustomVar.id,
      { audienceType: "all" },
      [
        {
          variableName: "dashboardUrl",
          source: { type: "contact", field: "email" },
        },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBe(0);
  });

  it("still reports contacts whose mapped column is empty", async () => {
    // firstName is unset on both fixture contacts, so a mapping to it leaves
    // every contact unresolved.
    const result = await checkTemplateVariableCoverage(
      testOrganization.id,
      templateWithCustomVar.id,
      { audienceType: "all" },
      [
        {
          variableName: "dashboardUrl",
          source: { type: "contact", field: "firstName" },
        },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingCount).toBe(result.totalSampled);
    expect(result.missingVariables).toContain("dashboardUrl");
  });

  it("resolves a properties.<key> mapping the same way the send worker does", async () => {
    // The API accepts any field string and the worker resolves the
    // "properties." prefix, so the preflight has to as well. The variable
    // (ctaUrl) is deliberately named differently from the property it maps
    // to (dashboardUrl) — reading the variable name off properties, as the
    // unmapped path does, would report every contact as missing.
    const renamedVarTemplate = {
      ...templateWithCustomVar,
      id: `preflight-tmpl-renamed-${RUN_ID}`,
      name: "Renamed Var Template",
      variables: [{ name: "ctaUrl", fallback: undefined }],
      sesTemplateName: `wraps-org-preflight-renamed-${RUN_ID}`,
    };

    await db.insert(template).values(renamedVarTemplate).onConflictDoNothing();

    try {
      const result = await checkTemplateVariableCoverage(
        testOrganization.id,
        renamedVarTemplate.id,
        { audienceType: "all" },
        [
          {
            variableName: "ctaUrl",
            source: { type: "contact", field: "properties.dashboardUrl" },
          },
        ]
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      // contactWithProp resolves through the mapping, contactWithoutProp does not.
      expect(result.allFail).toBe(false);
      expect(result.missingCount).toBeGreaterThan(0);
      expect(result.missingCount).toBeLessThan(result.totalSampled);
    } finally {
      await db.delete(template).where(eq(template.id, renamedVarTemplate.id));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 7: promoteDraftToSend blocks when all contacts would fail rendering
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteDraftToSend — blocks all-fail sends", () => {
  it("returns an error when every contact in the audience is missing required template variables", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    // Mock fetch so the test doesn't hang if the coverage check somehow
    // doesn't block. In the expected (green) path, fetch is never called.
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (...args: Parameters<typeof fetch>) => {
        const [url] = args;
        const asString = typeof url === "string" ? url : url.toString();
        if (asString.includes("/v1/batch/")) {
          return new Response(JSON.stringify({ id: "mock-id" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return realFetch(...args);
      });
    const blockOrgId = `preflight-block-org-${RUN_ID}`;
    const blockContactId = `preflight-block-contact-${RUN_ID}`;
    const blockMemberId = `preflight-block-member-${RUN_ID}`;
    const blockAwsId = `preflight-block-aws-${RUN_ID}`;
    const blockSubId = `sub_preflight_block_${RUN_ID}`;

    await db
      .insert(organization)
      .values({
        id: blockOrgId,
        name: "Block Test Org",
        slug: `block-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(organizationExtension)
      .values({ organizationId: blockOrgId })
      .onConflictDoNothing();

    await db
      .insert(subscription)
      .values({
        id: blockSubId,
        plan: "growth",
        referenceId: blockOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(member)
      .values({
        id: blockMemberId,
        organizationId: blockOrgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: blockAwsId,
        organizationId: blockOrgId,
        externalId: `block-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: blockContactId,
        organizationId: blockOrgId,
        email: `block-contact-${RUN_ID}@example.com`,
        emailHash: `hash-block-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {}, // missing dashboardUrl
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // Template in the block org that requires dashboardUrl (no fallback)
    const blockTemplate = {
      id: `preflight-block-tmpl-${RUN_ID}`,
      organizationId: blockOrgId,
      name: "Block Template",
      subject: "Your dashboard",
      content: {},
      sourceFormat: "react-email" as const,
      variables: [{ name: "dashboardUrl", fallback: undefined }],
      status: "PUBLISHED" as const,
      type: "EMAIL" as const,
      sesTemplateName: `wraps-block-tmpl-${RUN_ID}`,
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date("2025-12-01"),
      createdBy: testUser.id,
    };

    await db.insert(template).values(blockTemplate).onConflictDoNothing();

    try {
      const draft = await saveDraftBatchSend(blockOrgId, {
        awsAccountId: blockAwsId,
        templateId: blockTemplate.id,
        from: "sender@example.com",
        subject: "Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(draft.batch.id, blockOrgId, {});

      expect(result.success).toBe(false);
      if (result.success) return;
      // Error message should mention the template variable issue
      expect(result.error).toMatch(/variable|template|missing/i);

      // Draft row unchanged
      const after = await db.query.batchSend.findFirst({
        where: eq(batchSend.id, draft.batch.id),
      });
      expect(after?.status).toBe("draft");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, blockOrgId));
      await db.delete(template).where(eq(template.id, blockTemplate.id));
      await db.delete(contact).where(eq(contact.id, blockContactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, blockAwsId));
      await db.delete(member).where(eq(member.id, blockMemberId));
      await db.delete(subscription).where(eq(subscription.id, blockSubId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, blockOrgId));
      await db.delete(organization).where(eq(organization.id, blockOrgId));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 7b: a static mapping unblocks a send no contact could otherwise pass
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteDraftToSend — static mappings unblock all-fail sends", () => {
  it("sends when the required variable is covered by a static mapping instead of contact properties", async () => {
    // Regression: the send-time coverage check ignored variableMappings, so a
    // variable mapped to a static value in the wizard still blocked the send.
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    const orgId = `preflight-static-org-${RUN_ID}`;
    const contactId = `preflight-static-contact-${RUN_ID}`;
    const memberId = `preflight-static-member-${RUN_ID}`;
    const awsId = `preflight-static-aws-${RUN_ID}`;
    const subId = `sub_preflight_static_${RUN_ID}`;

    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Static Mapping Org",
        slug: `static-map-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(organizationExtension)
      .values({ organizationId: orgId })
      .onConflictDoNothing();

    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: "growth",
        referenceId: orgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(member)
      .values({
        id: memberId,
        organizationId: orgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        organizationId: orgId,
        externalId: `static-map-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `static-map-${RUN_ID}@example.com`,
        emailHash: `hash-static-map-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {}, // no changelogLink — only the static mapping covers it
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const staticTemplate = {
      id: `preflight-static-tmpl-${RUN_ID}`,
      organizationId: orgId,
      name: "Static Mapping Template",
      subject: "What's new",
      content: {},
      sourceFormat: "react-email" as const,
      variables: [{ name: "changelogLink", fallback: undefined }],
      status: "PUBLISHED" as const,
      type: "EMAIL" as const,
      sesTemplateName: `wraps-static-map-${RUN_ID}`,
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date("2025-12-01"),
      createdBy: testUser.id,
    };

    await db.insert(template).values(staticTemplate).onConflictDoNothing();

    try {
      const draft = await saveDraftBatchSend(orgId, {
        awsAccountId: awsId,
        templateId: staticTemplate.id,
        from: "sender@example.com",
        subject: "What's new",
        variableMappings: [
          {
            variableName: "changelogLink",
            source: { type: "static", value: "https://torbox.cooking" },
          },
        ],
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(draft.batch.id, orgId, {});

      expect(result.success).toBe(true);
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes(`/v1/batch/${draft.batch.id}/send`)
        )
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db.delete(batchSend).where(eq(batchSend.organizationId, orgId));
      await db.delete(template).where(eq(template.id, staticTemplate.id));
      await db.delete(contact).where(eq(contact.id, contactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
      await db.delete(member).where(eq(member.id, memberId));
      await db.delete(subscription).where(eq(subscription.id, subId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, orgId));
      await db.delete(organization).where(eq(organization.id, orgId));
    }
  });

  it("still blocks when the static mapping value is blank", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    const orgId = `preflight-blank-org-${RUN_ID}`;
    const contactId = `preflight-blank-contact-${RUN_ID}`;
    const memberId = `preflight-blank-member-${RUN_ID}`;
    const awsId = `preflight-blank-aws-${RUN_ID}`;
    const subId = `sub_preflight_blank_${RUN_ID}`;

    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Blank Mapping Org",
        slug: `blank-map-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(organizationExtension)
      .values({ organizationId: orgId })
      .onConflictDoNothing();

    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: "growth",
        referenceId: orgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(member)
      .values({
        id: memberId,
        organizationId: orgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        organizationId: orgId,
        externalId: `blank-map-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `blank-map-${RUN_ID}@example.com`,
        emailHash: `hash-blank-map-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const blankTemplate = {
      id: `preflight-blank-tmpl-${RUN_ID}`,
      organizationId: orgId,
      name: "Blank Mapping Template",
      subject: "What's new",
      content: {},
      sourceFormat: "react-email" as const,
      variables: [{ name: "changelogLink", fallback: undefined }],
      status: "PUBLISHED" as const,
      type: "EMAIL" as const,
      sesTemplateName: `wraps-blank-map-${RUN_ID}`,
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date("2025-12-01"),
      createdBy: testUser.id,
    };

    await db.insert(template).values(blankTemplate).onConflictDoNothing();

    try {
      const draft = await saveDraftBatchSend(orgId, {
        awsAccountId: awsId,
        templateId: blankTemplate.id,
        from: "sender@example.com",
        subject: "What's new",
        variableMappings: [
          {
            variableName: "changelogLink",
            source: { type: "static", value: "  " },
          },
        ],
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(draft.batch.id, orgId, {});

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain("changelogLink");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db.delete(batchSend).where(eq(batchSend.organizationId, orgId));
      await db.delete(template).where(eq(template.id, blankTemplate.id));
      await db.delete(contact).where(eq(contact.id, contactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
      await db.delete(member).where(eq(member.id, memberId));
      await db.delete(subscription).where(eq(subscription.id, subId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, orgId));
      await db.delete(organization).where(eq(organization.id, orgId));
    }
  });

  it("blocks an all-fail custom-HTML send the same way it blocks a template (H7)", async () => {
    // The custom-HTML path had no coverage check at all — client or server —
    // so the exact `{{...}}` failure that failed 1200/1200 sends in July 2026
    // was unguarded here while the template path blocked it.
    const orgId = `preflight-html-org-${RUN_ID}`;
    const contactId = `preflight-html-contact-${RUN_ID}`;
    const memberId = `preflight-html-member-${RUN_ID}`;
    const awsId = `preflight-html-aws-${RUN_ID}`;
    const subId = `sub_preflight_html_${RUN_ID}`;

    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (...args: Parameters<typeof fetch>) => {
        const [url] = args;
        const asString = typeof url === "string" ? url : url.toString();
        if (asString.endsWith("/v1/batch")) {
          return new Response(JSON.stringify({ error: "enqueue-refused" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return realFetch(...args);
      });

    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "HTML Send Org",
        slug: `html-send-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(organizationExtension)
      .values({ organizationId: orgId })
      .onConflictDoNothing();
    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: "growth",
        referenceId: orgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(member)
      .values({
        id: memberId,
        organizationId: orgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        organizationId: orgId,
        externalId: `html-send-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();
    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `html-send-${RUN_ID}@example.com`,
        emailHash: `hash-html-send-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const payload = {
      awsAccountId: awsId,
      from: "sender@example.com",
      subject: "What's new",
      htmlContent: "<p>Read the {{changelogLink}}</p>",
      recipientFilter: { audienceType: "all" as const },
    };

    try {
      const blocked = await createBatchSend(orgId, payload);
      expect(blocked.success).toBe(false);
      if (blocked.success) return;
      expect(blocked.error).toContain("changelogLink");
      expect(blocked.error).toContain("your HTML");
      expect(fetchSpy).not.toHaveBeenCalled();

      // A static mapping clears the same gate and hands off to the API.
      const sent = await createBatchSend(orgId, {
        ...payload,
        variableMappings: [
          {
            variableName: "changelogLink",
            source: { type: "static", value: "https://example.com/changelog" },
          },
        ],
      });

      expect(sent.success).toBe(false);
      if (sent.success) return;
      expect(sent.error).toContain("enqueue-refused");
      expect(sent.error).not.toContain("changelogLink");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db.delete(batchSend).where(eq(batchSend.organizationId, orgId));
      await db.delete(contact).where(eq(contact.id, contactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
      await db.delete(member).where(eq(member.id, memberId));
      await db.delete(subscription).where(eq(subscription.id, subId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, orgId));
      await db.delete(organization).where(eq(organization.id, orgId));
    }
  });

  it("does not leak the API's debug payload into the user-facing error (M9)", async () => {
    const orgId = `preflight-debug-org-${RUN_ID}`;
    const memberId = `preflight-debug-member-${RUN_ID}`;
    const awsId = `preflight-debug-aws-${RUN_ID}`;
    const subId = `sub_preflight_debug_${RUN_ID}`;
    const contactId = `preflight-debug-contact-${RUN_ID}`;

    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (...args: Parameters<typeof fetch>) => {
        const [url] = args;
        const asString = typeof url === "string" ? url : url.toString();
        if (asString.endsWith("/v1/batch")) {
          return new Response(
            JSON.stringify({
              error: "Sending is not configured",
              debug: { stack: "deep internal detail", ids: [1, 2, 3] },
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        return realFetch(...args);
      });

    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Debug Blob Org",
        slug: `debug-blob-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(organizationExtension)
      .values({ organizationId: orgId })
      .onConflictDoNothing();
    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: "growth",
        referenceId: orgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(member)
      .values({
        id: memberId,
        organizationId: orgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        organizationId: orgId,
        externalId: `debug-blob-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();
    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `debug-blob-${RUN_ID}@example.com`,
        emailHash: `hash-debug-blob-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    try {
      const result = await createBatchSend(orgId, {
        awsAccountId: awsId,
        from: "sender@example.com",
        subject: "Hello",
        htmlContent: "<p>Plain content, no variables</p>",
        recipientFilter: { audienceType: "all" as const },
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBe("Sending is not configured");
      expect(result.error).not.toContain("debug");
      expect(result.error).not.toContain("deep internal detail");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db.delete(batchSend).where(eq(batchSend.organizationId, orgId));
      await db.delete(contact).where(eq(contact.id, contactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
      await db.delete(member).where(eq(member.id, memberId));
      await db.delete(subscription).where(eq(subscription.id, subId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, orgId));
      await db.delete(organization).where(eq(organization.id, orgId));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 7c: the direct-send path (no draft) applies the same mapping rules
// ─────────────────────────────────────────────────────────────────────────────

describe("createBatchSend — coverage gate honours variable mappings", () => {
  it("blocks without a mapping and reaches the API with one", async () => {
    // createBatchSend is the "Send" button's path when the wizard was never
    // saved as a draft. It builds its own preflight payload, so it can drop
    // variableMappings independently of promoteDraftToSend.
    const orgId = `preflight-direct-org-${RUN_ID}`;
    const contactId = `preflight-direct-contact-${RUN_ID}`;
    const memberId = `preflight-direct-member-${RUN_ID}`;
    const awsId = `preflight-direct-aws-${RUN_ID}`;
    const subId = `sub_preflight_direct_${RUN_ID}`;

    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    // Reject the enqueue with a distinctive error. Passing the coverage gate
    // is then observable as "got the API's error, not the variable error",
    // without needing the downstream row/tracking machinery to succeed.
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (...args: Parameters<typeof fetch>) => {
        const [url] = args;
        const asString = typeof url === "string" ? url : url.toString();
        if (asString.endsWith("/v1/batch")) {
          return new Response(JSON.stringify({ error: "enqueue-refused" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return realFetch(...args);
      });

    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Direct Send Org",
        slug: `direct-send-org-${RUN_ID}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(organizationExtension)
      .values({ organizationId: orgId })
      .onConflictDoNothing();

    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: "growth",
        referenceId: orgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(member)
      .values({
        id: memberId,
        organizationId: orgId,
        userId: testUser.id,
        role: "owner" as const,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        organizationId: orgId,
        externalId: `direct-send-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `direct-send-${RUN_ID}@example.com`,
        emailHash: `hash-direct-send-${RUN_ID}`,
        emailStatus: "active" as const,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const directTemplate = {
      id: `preflight-direct-tmpl-${RUN_ID}`,
      organizationId: orgId,
      name: "Direct Send Template",
      subject: "What's new",
      content: {},
      sourceFormat: "react-email" as const,
      variables: [{ name: "changelogLink", fallback: undefined }],
      status: "PUBLISHED" as const,
      type: "EMAIL" as const,
      sesTemplateName: `wraps-direct-send-${RUN_ID}`,
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date(),
      updatedAt: new Date("2025-12-01"),
      createdBy: testUser.id,
    };

    await db.insert(template).values(directTemplate).onConflictDoNothing();

    const payload = {
      awsAccountId: awsId,
      templateId: directTemplate.id,
      from: "sender@example.com",
      subject: "What's new",
      recipientFilter: { audienceType: "all" as const },
    };

    try {
      // Control: no mapping, no contact property, no fallback → blocked
      // before the API is ever called.
      const blocked = await createBatchSend(orgId, payload);
      expect(blocked.success).toBe(false);
      if (blocked.success) return;
      expect(blocked.error).toContain("changelogLink");
      expect(fetchSpy).not.toHaveBeenCalled();

      // Same send with a static mapping clears the gate and hands off.
      const sent = await createBatchSend(orgId, {
        ...payload,
        variableMappings: [
          {
            variableName: "changelogLink",
            source: { type: "static", value: "https://torbox.cooking" },
          },
        ],
      });

      expect(sent.success).toBe(false);
      if (sent.success) return;
      expect(sent.error).toContain("enqueue-refused");
      expect(sent.error).not.toContain("changelogLink");

      const enqueue = fetchSpy.mock.calls.find(([url]) =>
        String(url).endsWith("/v1/batch")
      );
      expect(enqueue).toBeDefined();
      const body = JSON.parse(String(enqueue?.[1]?.body)) as {
        variableMappings?: { variableName: string }[];
      };
      expect(body.variableMappings?.[0]?.variableName).toBe("changelogLink");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db.delete(batchSend).where(eq(batchSend.organizationId, orgId));
      await db.delete(template).where(eq(template.id, directTemplate.id));
      await db.delete(contact).where(eq(contact.id, contactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
      await db.delete(member).where(eq(member.id, memberId));
      await db.delete(subscription).where(eq(subscription.id, subId));
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, orgId));
      await db.delete(organization).where(eq(organization.id, orgId));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Daily quota reserve preflight — blocks/allows sends based on SES
// Max24HourSend/SentLast24Hours vs. the account's dailyQuotaReserve.
// ─────────────────────────────────────────────────────────────────────────────

function mockSendApiSuccess() {
  const realFetch = globalThis.fetch.bind(globalThis);
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (...args: Parameters<typeof fetch>) => {
      const [url] = args;
      const asString = typeof url === "string" ? url : url.toString();
      if (asString.includes("/v1/batch/")) {
        return new Response(JSON.stringify({ id: "mock-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(...args);
    });
}

describe("promoteDraftToSend — daily quota reserve preflight", () => {
  it("allows the send with a warning when today's headroom is exhausted but the audience still fits a day's capacity", async () => {
    // The worker pauses and re-enqueues chunks that would touch the reserve,
    // so a send with no headroom RIGHT NOW still drains as the rolling 24h
    // window frees up. It must not be blocked up front.
    const quotaAwsId = `preflight-quota-warn-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-warn-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    // Capacity = 120,000 − 40,000 = 80,000 (audience of 2 fits easily), but
    // headroom = 120,000 − 115,000 − 40,000 is negative.
    sesGetAccountQuota = { Max24HourSend: 120_000, SentLast24Hours: 115_000 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Quota Warn Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Warning explains the pause using quota, usage, and reserve.
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("120,000");
      expect(result.warning).toContain("115,000");
      expect(result.warning).toContain("40,000");
      expect(result.warning).toMatch(/resumes automatically/i);
      // Nothing sendable right now, so the warning reports 0.
      expect(result.warning).toMatch(/^Only 0 of 2 emails/);

      // The preflight handed the send off to the API instead of blocking it.
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes(`/v1/batch/${draft.batch.id}/send`)
        )
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("omits the warning on a scheduled send, where current usage is not predictive", async () => {
    const quotaAwsId = `preflight-quota-sched-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-sched-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    // Same exhausted-headroom numbers that warn on an immediate send.
    sesGetAccountQuota = { Max24HourSend: 120_000, SentLast24Hours: 115_000 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Quota Scheduled Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        { scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("returns no warning when the audience fits inside current headroom", async () => {
    const quotaAwsId = `preflight-quota-clean-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-clean-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    // headroom = 120,000 − 1,000 − 40,000 = 79,000, well above 2 recipients.
    sesGetAccountQuota = { Max24HourSend: 120_000, SentLast24Hours: 1000 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Quota Clean Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("warns instead of blocking when the audience needs multiple days", async () => {
    const quotaAwsId = `preflight-quota-block-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-block-ext-${RUN_ID}`,
        dailyQuotaReserve: 99,
      })
      .onConflictDoNothing();

    // Capacity = 100 − 99 = 1, below the 2-contact audience. The worker's
    // reserve gate drains this across days as the rolling 24h window frees
    // up, so it must warn — not block — with an estimated duration.
    sesGetAccountQuota = { Max24HourSend: 100, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Quota Block Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeDefined();
      expect(result.warning).toMatch(/about \d+ days?/);
      expect(result.warning).toMatch(/resumes automatically/i);

      // The preflight handed the send off to the API instead of blocking it.
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes(`/v1/batch/${draft.batch.id}/send`)
        )
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("blocks every broadcast when the reserve is at or above the daily quota", async () => {
    const quotaAwsId = `preflight-quota-starved-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-starved-ext-${RUN_ID}`,
        dailyQuotaReserve: 50_000,
      })
      .onConflictDoNothing();

    // Reserve swallows the whole quota — capacity is 0.
    sesGetAccountQuota = { Max24HourSend: 50_000, SentLast24Hours: 0 };

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Quota Starved Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/at or above/i);
      expect(result.error).toMatch(/Lower the reserve/i);

      const after = await db.query.batchSend.findFirst({
        where: eq(batchSend.id, draft.batch.id),
      });
      expect(after?.status).toBe("draft");
    } finally {
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("consults SES even with no reserve set — the whole quota is the broadcast budget", async () => {
    // testAwsAccount has no dailyQuotaReserve set (null by fixture default).
    // With reserve 0, the whole daily quota IS the broadcast budget, so the
    // preflight must still check it — only the SMS channel skips this now.
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "No Reserve Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      expect(getOrAssumeRoleMock).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
    }
  });

  it("fails open (send proceeds) when GetAccount rejects", async () => {
    const quotaAwsId = `preflight-quota-failopen-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-failopen-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    sesGetAccountShouldThrow = true;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Fail Open Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("fails open (send proceeds) when GetAccount rejects, even with no reserve set", async () => {
    // testAwsAccount has no dailyQuotaReserve set (null by fixture default).
    // The quota check now runs unconditionally, so this fail-open path must
    // hold at reserve 0 too, not only when a reserve is configured.
    sesGetAccountShouldThrow = true;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Fail Open No Reserve Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
    }
  });

  // Now the sole guard keeping SMS out of the SES quota-check path — the
  // quota check itself no longer gates on `reserve > 0`.
  it("skips the quota check for SMS channel even when reserve is set", async () => {
    const quotaAwsId = `preflight-quota-sms-aws-${RUN_ID}`;
    const smsContactId = `preflight-quota-sms-contact-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `quota-sms-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: smsContactId,
        organizationId: testOrganization.id,
        phone: "+15005550006",
        phoneHash: `hash-sms-${RUN_ID}`,
        smsStatus: "opted_in",
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // Even though the account has a reserve set, an SES GetAccount call
    // would fail this test if made — the SMS channel gate should never
    // reach it. Configure it to throw so any accidental call is caught.
    sesGetAccountShouldThrow = true;

    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        channel: "sms",
        senderId: "wraps",
        body: "Test SMS body",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      expect(getOrAssumeRoleMock).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(contact).where(eq(contact.id, smsContactId));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkBroadcastSendDuration — pre-confirmation multi-day send estimate.
// Same quota math as the send preflight (via assessQuotaHeadroom), exposed
// read-only so ReviewStep can show the estimate BEFORE the user confirms.
// ─────────────────────────────────────────────────────────────────────────────

describe("checkBroadcastSendDuration", () => {
  const otherOrgId = `preflight-duration-other-org-${RUN_ID}`;

  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: otherOrgId,
        name: "Other Org (duration IDOR test)",
        slug: `preflight-duration-other-org-${RUN_ID}`,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, otherOrgId));
  });

  it("returns available:true with estimatedDays computed by hand when the audience exceeds a day's capacity", async () => {
    const quotaAwsId = `preflight-duration-block-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `duration-block-ext-${RUN_ID}`,
        dailyQuotaReserve: 99,
      })
      .onConflictDoNothing();

    // Capacity = 100 − 99 = 1, below the 2-contact audience.
    sesGetAccountQuota = { Max24HourSend: 100, SentLast24Hours: 0 };

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        quotaAwsId,
        "email",
        2,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      // Computed by hand from the mocked quota, not merely asserted truthy.
      expect(result.dailyCapacity).toBe(1);
      expect(result.estimatedDays).toBe(Math.ceil(2 / 1));
      expect(result.estimatedDays).toBe(2);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("returns estimatedDays: null when the audience fits within a day's capacity", async () => {
    const quotaAwsId = `preflight-duration-fits-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `duration-fits-ext-${RUN_ID}`,
        dailyQuotaReserve: 0,
      })
      .onConflictDoNothing();

    // Capacity = 120,000 − 0, far above the 2-contact audience.
    sesGetAccountQuota = { Max24HourSend: 120_000, SentLast24Hours: 0 };

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        quotaAwsId,
        "email",
        2,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      expect(result.estimatedDays).toBeNull();
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("fails open: available:false (still success:true) when GetAccount rejects", async () => {
    const quotaAwsId = `preflight-duration-failopen-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `duration-failopen-ext-${RUN_ID}`,
        dailyQuotaReserve: 40_000,
      })
      .onConflictDoNothing();

    sesGetAccountShouldThrow = true;

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        quotaAwsId,
        "email",
        2,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(false);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("returns available:false for an awsAccountId belonging to a different organization (IDOR guard)", async () => {
    const otherOrgAwsId = `preflight-duration-idor-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: otherOrgAwsId,
        organizationId: otherOrgId,
        externalId: `duration-idor-ext-${RUN_ID}`,
        dailyQuotaReserve: 0,
      })
      .onConflictDoNothing();

    // A generous quota — if the org-scope guard failed and this account were
    // read anyway, it would produce available:true. Configure it so this test
    // fails loudly (not by coincidence) if that guard is ever removed.
    sesGetAccountQuota = { Max24HourSend: 120_000, SentLast24Hours: 0 };

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        otherOrgAwsId,
        "email",
        2,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(false);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, otherOrgAwsId));
    }
  });

  it("produces an estimate whether the reserve is set or 0 — reserve 0 is not 'no estimate'", async () => {
    const reserveAwsId = `preflight-duration-reserve-aws-${RUN_ID}`;
    const noReserveAwsId = `preflight-duration-noreserve-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values([
        {
          ...testAwsAccount,
          id: reserveAwsId,
          externalId: `duration-reserve-ext-${RUN_ID}`,
          dailyQuotaReserve: 99,
        },
        {
          ...testAwsAccount,
          id: noReserveAwsId,
          externalId: `duration-noreserve-ext-${RUN_ID}`,
          dailyQuotaReserve: 0,
        },
      ])
      .onConflictDoNothing();

    try {
      // Reserve set: capacity = 100 − 99 = 1.
      sesGetAccountQuota = { Max24HourSend: 100, SentLast24Hours: 0 };
      const withReserve = await checkBroadcastSendDuration(
        testOrganization.id,
        reserveAwsId,
        "email",
        2,
        false
      );
      expect(withReserve.success).toBe(true);
      if (!withReserve.success) return;
      expect(withReserve.available).toBe(true);
      if (!withReserve.available) return;
      expect(withReserve.dailyCapacity).toBe(1);
      expect(withReserve.estimatedDays).toBe(2);

      // Reserve 0: dailyCapacity === max24HourSend, still produces an estimate
      // when the audience exceeds it — not "no estimate".
      sesGetAccountQuota = { Max24HourSend: 1, SentLast24Hours: 0 };
      const noReserve = await checkBroadcastSendDuration(
        testOrganization.id,
        noReserveAwsId,
        "email",
        2,
        false
      );
      expect(noReserve.success).toBe(true);
      if (!noReserve.success) return;
      expect(noReserve.available).toBe(true);
      if (!noReserve.available) return;
      expect(noReserve.dailyCapacity).toBe(1);
      expect(noReserve.estimatedDays).toBe(2);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, reserveAwsId));
      await db.delete(awsAccount).where(eq(awsAccount.id, noReserveAwsId));
    }
  });
});

describe("cross-broadcast quota accounting", () => {
  // testOrganization has exactly 2 active email contacts (contactWithProp,
  // contactWithoutProp — see fixtures above), so promoteDraftToSend's
  // real audience is always 2 here. Cases below use small, hand-picked
  // quota numbers (rather than the literal 16,227 / 29,849 figures from the
  // production incident) so that contention alone — not the audience size —
  // is what tips a send from "fits" to "warns". Math.ceil is still asserted
  // by hand in every case. checkBroadcastSendDuration (case 10) takes
  // recipientCount as a raw parameter, so it reproduces the incident's exact
  // numbers directly.

  it("counts recipients still unsent on another in-flight broadcast when estimating a multi-day send (the incident)", async () => {
    const quotaAwsId = `preflight-crossquota-incident-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-incident-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-incident-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // dailyCapacity = 104 − 100 = 4. The real audience (2) fits comfortably
    // on its own — see the control case below. Only with the 5 recipients
    // still unsent on another broadcast does contendedCount (7) exceed
    // capacity: Math.ceil(7 / 4) = 2.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 5,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Incident Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeDefined();
      const warning = result.warning as string;
      // Computed by hand: contendedCount = 2 (audience) + 5 (in-flight
      // remainder) = 7; dailyCapacity = 4; Math.ceil(7 / 4) = 2.
      expect(warning).toMatch(/about 2 days?/);
      // The audience alone (2) does NOT exceed dailyCapacity (4) — only the
      // combined figure (7) does. The leading clause must say so: it must
      // name the combined figure, not claim the bare audience alone exceeds
      // capacity (that would be the exact self-contradicting-arithmetic bug
      // rule 5b exists to prevent, on this branch instead).
      expect(warning).not.toMatch(/^2 recipients is more than/);
      expect(warning).toMatch(
        /2 recipients, plus 5 already queued on this AWS account, is more than/
      );
      expect(warning).toMatch(
        /1 other broadcast on this AWS account shares the same daily quota with this one/
      );
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("keeps the multi-day warning's leading claim honest against its own printed capacity when contention alone tips it over (rule 5b, multi-day branch)", async () => {
    const quotaAwsId = `preflight-crossquota-incident-arithmetic-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-incident-arithmetic-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-incident-arithmetic-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // Same fixture as the incident case: dailyCapacity = 4, audience = 2
    // (fits alone), in-flight remainder = 5 (tips contendedCount to 7).
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 5,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Incident Arithmetic Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeDefined();
      const warning = result.warning as string;

      // Parse the leading claim ("N recipients, plus M already queued on
      // this AWS account, is more than...") and the printed capacity figure
      // (".../day for broadcasts") out of the rendered string, then verify
      // the sentence's own claim holds against its own printed number — the
      // combined quantity it says exceeds capacity actually does, so a
      // future edit that reintroduces the bare-audience claim (which does
      // NOT exceed capacity here) fails this test instead of shipping
      // visibly wrong arithmetic.
      const claimMatch = warning.match(
        /^([\d,]+) recipients, plus ([\d,]+) already queued on this AWS account, is more than/
      );
      expect(claimMatch).not.toBeNull();
      if (!claimMatch) return;
      const [ownAudience, inFlightRemainder] = claimMatch
        .slice(1)
        .map((n) => Number(n.replaceAll(",", "")));

      const capacityMatch = warning.match(/([\d,]+)\/day for broadcasts/);
      expect(capacityMatch).not.toBeNull();
      if (!capacityMatch) return;
      const printedCapacity = Number(capacityMatch[1].replaceAll(",", ""));

      expect(printedCapacity).toBe(4);
      // The combined figure the sentence claims exceeds capacity really does.
      expect(ownAudience + inFlightRemainder).toBeGreaterThan(printedCapacity);
      // And the bare audience alone — what the OLD leading clause would have
      // named — does NOT exceed the same printed capacity, which is exactly
      // why naming it bare would have been a lie.
      expect(ownAudience).toBeLessThanOrEqual(printedCapacity);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("produces no multi-day warning for the same send when nothing else is in flight (control)", async () => {
    const quotaAwsId = `preflight-crossquota-control-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-control-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // Same dailyCapacity (4) as the incident case, but no in-flight batch —
    // proves the warning above was caused by the accounting, not the fixture.
    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Control Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("counts only the unsent remainder of an in-flight broadcast, not its total", async () => {
    const quotaAwsId = `preflight-crossquota-remainder-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-remainder-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-remainder-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // totalRecipients 5, processedRecipients 4 → remainder 1, not 5.
    // contendedCount = 2 + 1 = 3, which still fits dailyCapacity (4).
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 5,
      processedRecipients: 4,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Remainder Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("excludes draft, scheduled, completed, failed, and cancelled broadcasts from the in-flight sum", async () => {
    const quotaAwsId = `preflight-crossquota-statuses-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-statuses-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // Each row has a huge remainder (1,000). If any of these statuses were
    // wrongly counted, contendedCount would blow past dailyCapacity (4) and
    // produce a multi-day warning. None should contribute.
    const excludedStatuses = [
      "draft",
      "scheduled",
      "completed",
      "failed",
      "cancelled",
    ] as const;
    await db.insert(batchSend).values(
      excludedStatuses.map(
        (status) =>
          ({
            id: `preflight-crossquota-statuses-${status}-${RUN_ID}`,
            organizationId: testOrganization.id,
            awsAccountId: quotaAwsId,
            channel: "email",
            status,
            totalRecipients: 1000,
            processedRecipients: 0,
          }) as typeof batchSend.$inferInsert
      )
    );

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Statuses Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("does not count an in-flight broadcast on a different AWS account", async () => {
    const quotaAwsId = `preflight-crossquota-otheraccount-aws-${RUN_ID}`;
    const otherAwsId = `preflight-crossquota-otheraccount-other-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-otheraccount-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values([
        {
          ...testAwsAccount,
          id: quotaAwsId,
          externalId: `crossquota-otheraccount-ext-${RUN_ID}`,
          dailyQuotaReserve: 100,
        },
        {
          ...testAwsAccount,
          id: otherAwsId,
          externalId: `crossquota-otheraccount-ext2-${RUN_ID}`,
          dailyQuotaReserve: 0,
        },
      ])
      .onConflictDoNothing();

    // Huge remainder, but on a DIFFERENT aws_account row — must not count
    // toward quotaAwsId's headroom.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: otherAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 1000,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Other Account Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
      await db.delete(awsAccount).where(eq(awsAccount.id, otherAwsId));
    }
  });

  it("does not count an in-flight broadcast belonging to a different organization, even on the same AWS account row", async () => {
    // Artificial — the FK makes a real cross-org row on the same
    // aws_account id unlikely — but this is exactly the assertion that
    // proves the organizationId filter in sumInFlightBroadcastRecipients is
    // live, not just present in the SQL text.
    const otherOrgId = `preflight-crossquota-otherorg-org-${RUN_ID}`;
    const quotaAwsId = `preflight-crossquota-otherorg-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-otherorg-inflight-${RUN_ID}`;
    await db
      .insert(organization)
      .values({
        id: otherOrgId,
        name: "Cross-Quota Other Org",
        slug: `preflight-crossquota-otherorg-${RUN_ID}`,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      })
      .onConflictDoNothing();
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-otherorg-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // Same awsAccountId, but organizationId belongs to a different org.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: otherOrgId,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 1000,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Other Org Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, otherOrgId));
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
      await db.delete(organization).where(eq(organization.id, otherOrgId));
    }
  });

  it("does not count an in-flight SMS broadcast toward the email quota", async () => {
    const quotaAwsId = `preflight-crossquota-smschannel-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-smschannel-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-smschannel-ext-${RUN_ID}`,
        dailyQuotaReserve: 100,
      })
      .onConflictDoNothing();

    // Huge remainder, but channel "sms" — SES quota is email-only.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "sms",
      status: "processing",
      totalRecipients: 1000,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 104, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota SMS Channel Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("never manufactures a warning from contention alone when the send still fits (rule 5a)", async () => {
    const quotaAwsId = `preflight-crossquota-benign-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-benign-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-benign-ext-${RUN_ID}`,
        dailyQuotaReserve: 50,
      })
      .onConflictDoNothing();

    // dailyCapacity = 150 − 50 = 100. In-flight remainder = 50.
    // contendedCount = 2 + 50 = 52, well under capacity (100).
    // headroom (with in-flight) = 150 − 0 − 50 − 50 = 50, still above the
    // 2-contact audience. Neither branch should produce a warning.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 50,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 150, SentLast24Hours: 0 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Benign Contention Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("keeps the today-only warning's printed arithmetic correct once the in-flight term is added (rule 5b)", async () => {
    const quotaAwsId = `preflight-crossquota-arithmetic-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-arithmetic-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-arithmetic-ext-${RUN_ID}`,
        dailyQuotaReserve: 1000,
      })
      .onConflictDoNothing();

    // dailyCapacity = 50,000 − 1,000 = 49,000 — the 2-contact audience plus
    // the 8,000 in-flight remainder (8,002) fits easily, so this stays in
    // the today-only branch rather than the multi-day one.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 8000,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    // headroom = 50,000 − 41,000 − 1,000 − 8,000 = 0, below the 2-contact
    // audience, so the today-only warning fires.
    sesGetAccountQuota = { Max24HourSend: 50_000, SentLast24Hours: 41_000 };
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
    const fetchSpy = mockSendApiSuccess();

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: quotaAwsId,
        templateId: templateNoCustomVars.id,
        from: "sender@example.com",
        subject: "Cross-Quota Arithmetic Test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warning).toBeDefined();
      const warning = result.warning as string;
      expect(warning).toContain("8,000 queued in other broadcasts");

      // Parse every number out of the "Only N of M ... (quota − sent − reserve
      // − inFlight)" sentence and verify the printed subtraction actually
      // reduces to the printed "Only N" figure, so a future edit that drops
      // a term fails here instead of shipping visibly wrong arithmetic.
      const match = warning.match(
        /Only ([\d,]+) of ([\d,]+) emails can send right now \(daily quota ([\d,]+) − ([\d,]+) sent in the last 24h − ([\d,]+) reserved for transactional − ([\d,]+) queued in other broadcasts\)/
      );
      expect(match).not.toBeNull();
      if (!match) return;
      const [, sendableNow, , maxDaily, sentLast24, reserve, inFlightTerm] =
        match.map((n) => Number(n.replaceAll(",", "")));
      expect(sendableNow).toBe(maxDaily - sentLast24 - reserve - inFlightTerm);
      expect(sendableNow).toBe(0);
    } finally {
      fetchSpy.mockRestore();
      delete process.env.NEXT_PUBLIC_API_URL;
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });

  it("checkBroadcastSendDuration sees the same in-flight accounting, reproducing the incident's exact numbers", async () => {
    const quotaAwsId = `preflight-crossquota-duration-aws-${RUN_ID}`;
    const inFlightId = `preflight-crossquota-duration-inflight-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: quotaAwsId,
        externalId: `crossquota-duration-ext-${RUN_ID}`,
        dailyQuotaReserve: 10_000,
      })
      .onConflictDoNothing();

    // Reproduces the production incident exactly: dailyCapacity = 50,000 −
    // 10,000 = 40,000. Another broadcast has 29,849 recipients left to send.
    // checkBroadcastSendDuration takes recipientCount as a raw parameter, so
    // the incident's own audience size (16,227) can be used directly without
    // needing 16,227 real contact rows.
    await db.insert(batchSend).values({
      id: inFlightId,
      organizationId: testOrganization.id,
      awsAccountId: quotaAwsId,
      channel: "email",
      status: "processing",
      totalRecipients: 29_849,
      processedRecipients: 0,
    } as typeof batchSend.$inferInsert);

    sesGetAccountQuota = { Max24HourSend: 50_000, SentLast24Hours: 0 };

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        quotaAwsId,
        "email",
        16_227,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      expect(result.dailyCapacity).toBe(40_000);
      expect(result.inFlightBatches).toBe(1);
      expect(result.inFlightRecipients).toBe(29_849);
      // Computed by hand: Math.ceil((16,227 + 29,849) / 40,000) = 2.
      expect(result.estimatedDays).toBe(Math.ceil((16_227 + 29_849) / 40_000));
      expect(result.estimatedDays).toBe(2);
    } finally {
      await db
        .delete(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      await db.delete(awsAccount).where(eq(awsAccount.id, quotaAwsId));
    }
  });
});

describe("SES sandbox awareness (H6)", () => {
  it("reports productionAccessEnabled: false when the account is in the sandbox", async () => {
    const awsId = `preflight-sandbox-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        externalId: `sandbox-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    // Sandbox accounts get a 200/day quota — the real cause of the enormous
    // day estimate the wizard used to show with no explanation.
    sesGetAccountQuota = { Max24HourSend: 200, SentLast24Hours: 0 };
    sesProductionAccessEnabled = false;

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        awsId,
        "email",
        20_000,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      expect(result.productionAccessEnabled).toBe(false);
      expect(result.estimatedDays).toBe(100);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
    }
  });

  it("reports productionAccessEnabled: true when AWS says production access is on", async () => {
    const awsId = `preflight-prod-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        externalId: `prod-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    sesGetAccountQuota = { Max24HourSend: 50_000, SentLast24Hours: 0 };
    sesProductionAccessEnabled = true;

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        awsId,
        "email",
        10,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      expect(result.productionAccessEnabled).toBe(true);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
    }
  });

  it("treats a silent AWS response as production, not as the sandbox", async () => {
    const awsId = `preflight-silent-aws-${RUN_ID}`;
    await db
      .insert(awsAccount)
      .values({
        ...testAwsAccount,
        id: awsId,
        externalId: `silent-ext-${RUN_ID}`,
      })
      .onConflictDoNothing();

    sesGetAccountQuota = { Max24HourSend: 50_000, SentLast24Hours: 0 };
    sesProductionAccessEnabled = undefined;

    try {
      const result = await checkBroadcastSendDuration(
        testOrganization.id,
        awsId,
        "email",
        10,
        false
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.available).toBe(true);
      if (!result.available) return;
      // Guessing "sandbox" would put a scary, wrong warning on healthy accounts.
      expect(result.productionAccessEnabled).toBe(true);
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, awsId));
    }
  });
});

describe("checkHtmlVariableCoverage (H7)", () => {
  const filter = { audienceType: "all" as const };

  it("flags a custom variable in hand-authored HTML that no contact has", async () => {
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      "<p>Open your {{missingThing}}</p>",
      "Hello",
      filter
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toContain("missingThing");
    expect(result.allFail).toBe(true);
  });

  it("flags a custom variable that only appears in the subject line", async () => {
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      "<p>Hi there</p>",
      "Your {{subjectOnlyThing}} is ready",
      filter
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toContain("subjectOnlyThing");
  });

  it("does not flag a variable with a fallback", async () => {
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      "<p>Open {{dashboardUrl|https://default.example.com}}</p>",
      "Hello",
      filter
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toEqual([]);
    expect(result.allFail).toBe(false);
  });

  it("does not flag a variable satisfied by a static mapping", async () => {
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      "<p>Open {{missingThing}}</p>",
      "Hello",
      filter,
      [
        {
          variableName: "missingThing",
          source: { type: "static", value: "https://example.com" },
        },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toEqual([]);
  });

  it("does not flag contact fields the batch sender always provides", async () => {
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      '<p>Hi {{firstName}}, <a href="{{unsubscribeUrl}}">unsubscribe</a></p>',
      "Hello {{contact.firstName}}",
      filter
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toEqual([]);
  });

  it("reports partial coverage when only some contacts have the property", async () => {
    // contactWithProp has dashboardUrl, contactWithoutProp does not.
    const result = await checkHtmlVariableCoverage(
      testOrganization.id,
      "<p>Open {{dashboardUrl}}</p>",
      "Hello",
      filter
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.missingVariables).toEqual(["dashboardUrl"]);
    expect(result.allFail).toBe(false);
    expect(result.missingCount).toBeGreaterThan(0);
    expect(result.missingCount).toBeLessThan(result.totalSampled);
  });
});
