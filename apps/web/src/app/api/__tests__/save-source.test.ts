import { auditLog, db, member, organization, template, user } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Test data
const testUser = {
  id: "test-savesrc-user-1",
  email: "savesrc-test@example.com",
  name: "SaveSource Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-savesrc-org-1",
  name: "SaveSource Test Org",
  slug: "savesrc-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-savesrc-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock the auth module
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "session-savesrc-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

// Mock organization helper
vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string, userId: string) => {
    if (slug === testOrganization.slug && userId === testUser.id) {
      return {
        id: testOrganization.id,
        name: testOrganization.name,
        slug: testOrganization.slug,
        userRole: testMember.role,
      };
    }
    return null;
  }),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

// Set up test database
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
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
});

// Clean up templates before each test
beforeEach(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db
    .delete(template)
    .where(eq(template.organizationId, testOrganization.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db
    .delete(template)
    .where(eq(template.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Save Source API - POST /api/[orgSlug]/emails/templates/[id]/save-source", () => {
  it("should save source and set lastEditedFrom to dashboard", async () => {
    // Create a code template (initially pushed from CLI)
    await db.insert(template).values({
      id: "test-savesrc-tmpl-1",
      organizationId: testOrganization.id,
      name: "SaveSource Test",
      content: {},
      status: "PUBLISHED",
      createdBy: testUser.id,
      sourceFormat: "react-email",
      source: "// original source",
      lastEditedFrom: "cli",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const newSource =
      'import { Html } from "@react-email/components";\nexport default () => <Html />;';

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: newSource,
        compiledHtml: "<html></html>",
        compiledText: "",
        variables: [{ name: "userName" }],
      }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-savesrc-tmpl-1",
      }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.template.lastEditedFrom).toBe("dashboard");
    expect(data.template.source).toBe(newSource);
    expect(data.template.compiledHtml).toBe("<html></html>");
    expect(data.template.sourceHash).toBeDefined();
    expect(data.template.sourceHash).toHaveLength(64); // SHA-256 hex

    // Verify in database
    const [saved] = await db
      .select()
      .from(template)
      .where(eq(template.id, "test-savesrc-tmpl-1"));
    expect(saved.lastEditedFrom).toBe("dashboard");
    expect(saved.lastEditedBy).toBe(testUser.id);
  });

  it("should write exactly one template.updated audit row per save", async () => {
    await db.insert(template).values({
      id: "test-savesrc-tmpl-audit",
      organizationId: testOrganization.id,
      name: "SaveSource Audit Test",
      content: {},
      status: "PUBLISHED",
      createdBy: testUser.id,
      sourceFormat: "react-email",
      source: "// original source",
      lastEditedFrom: "cli",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const response = await POST(
      new Request("http://localhost/api/save-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "// edited source",
          compiledHtml: "<html></html>",
        }),
      }),
      {
        params: Promise.resolve({
          orgSlug: testOrganization.slug,
          id: "test-savesrc-tmpl-audit",
        }),
      }
    );

    expect(response.status).toBe(200);
    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "template.updated")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].resourceId).toBe("test-savesrc-tmpl-audit");
  });

  it("should reject non-react-email templates", async () => {
    // "tiptap" is a retired source format, but the column still permits it,
    // so the route must keep rejecting anything that isn't react-email.
    await db.insert(template).values({
      id: "test-savesrc-tmpl-2",
      organizationId: testOrganization.id,
      name: "Legacy Format Template",
      content: { type: "doc", content: [] },
      status: "DRAFT",
      createdBy: testUser.id,
      sourceFormat: "tiptap",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "some source",
        compiledHtml: "<html></html>",
        compiledText: "",
        variables: [],
      }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-savesrc-tmpl-2",
      }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("react-email");
  });

  it("should return 400 when source is missing", async () => {
    await db.insert(template).values({
      id: "test-savesrc-tmpl-3",
      organizationId: testOrganization.id,
      name: "Missing Source",
      content: {},
      status: "DRAFT",
      createdBy: testUser.id,
      sourceFormat: "react-email",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiledHtml: "<html></html>" }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-savesrc-tmpl-3",
      }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(400);
  });

  it("should return 413 when testData exceeds the 64KB limit", async () => {
    await db.insert(template).values({
      id: "test-savesrc-tmpl-toobig",
      organizationId: testOrganization.id,
      name: "Too Big TestData",
      content: {},
      status: "DRAFT",
      createdBy: testUser.id,
      sourceFormat: "react-email",
      source: "// original",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    // Build a testData object whose JSON-serialized form exceeds 64KB
    const huge: Record<string, string> = {};
    const chunk = "x".repeat(1024); // 1 KB string
    for (let i = 0; i < 100; i++) {
      huge[`field_${i}`] = chunk;
    }

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "// source",
        compiledHtml: "<html></html>",
        compiledText: "",
        variables: [],
        testData: huge,
      }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-savesrc-tmpl-toobig",
      }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(413);

    const data = await response.json();
    expect(data.error).toMatch(/testData/i);

    // Verify nothing was persisted
    const [unchanged] = await db
      .select()
      .from(template)
      .where(eq(template.id, "test-savesrc-tmpl-toobig"));
    expect(unchanged.source).toBe("// original");
  });

  it("should accept testData under the 64KB limit", async () => {
    await db.insert(template).values({
      id: "test-savesrc-tmpl-undersized",
      organizationId: testOrganization.id,
      name: "Normal TestData",
      content: {},
      status: "DRAFT",
      createdBy: testUser.id,
      sourceFormat: "react-email",
      source: "// original",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "// new source",
        compiledHtml: "<html></html>",
        compiledText: "",
        variables: [],
        testData: { firstName: "Jane", company: "Acme" },
      }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-savesrc-tmpl-undersized",
      }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(200);
  });

  it("should return 404 for non-existent template", async () => {
    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/save-source/route"
    );

    const request = new Request("http://localhost/api/save-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "// source",
        compiledHtml: "<html></html>",
        compiledText: "",
        variables: [],
      }),
    });

    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "nonexistent-template",
      }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(404);
  });
});
