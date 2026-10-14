import {
  awsAccount,
  db,
  member,
  organization,
  template,
  templateVersion,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
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
  id: "test-template-user-1",
  email: "template-test@example.com",
  name: "Template Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-template-org-1",
  name: "Template Test Org",
  slug: "template-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-template-member-1",
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
          id: "session-123",
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
        userRole: "owner",
      };
    }
    return null;
  }),
}));

// Mock AWS credential cache
vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    sessionToken: "test-token",
  })),
}));

// Mock SES template operations
const { mockDeleteSESTemplate } = vi.hoisted(() => ({
  mockDeleteSESTemplate: vi.fn(async () => {}),
}));

vi.mock("@wraps/email", () => ({
  deleteSESTemplate: mockDeleteSESTemplate,
}));

// Test AWS account
const testAwsAccount = {
  id: "test-template-aws-account",
  organizationId: testOrganization.id,
  name: "Test AWS Account",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/test-role",
  externalId: `test-template-external-id-${Date.now()}`,
  createdAt: new Date(),
  updatedAt: new Date(),
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
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });

  // Insert test AWS account
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

// Clean up templates before each test
beforeEach(async () => {
  // Delete all templates for this test org
  await db
    .delete(template)
    .where(eq(template.organizationId, testOrganization.id));
  mockDeleteSESTemplate.mockClear();
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(template)
    .where(eq(template.organizationId, testOrganization.id));
  await db
    .delete(awsAccount)
    .where(eq(awsAccount.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Templates API - GET /api/[orgSlug]/emails/templates", () => {
  it("should return empty list when no templates exist", async () => {
    const { GET } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return templates for authorized user", async () => {
    // Create a template first
    await db.insert(template).values({
      id: "test-template-1",
      organizationId: testOrganization.id,
      name: "Test Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { GET } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Test Template");
  });

  it("should filter templates by status", async () => {
    // Create multiple templates with different statuses
    await db.insert(template).values([
      {
        id: "test-template-draft",
        organizationId: testOrganization.id,
        name: "Draft Template",
        content: { type: "doc", content: [] },
        createdBy: testUser.id,
        status: "DRAFT",
      },
      {
        id: "test-template-published",
        organizationId: testOrganization.id,
        name: "Published Template",
        content: { type: "doc", content: [] },
        createdBy: testUser.id,
        status: "PUBLISHED",
      },
    ]);

    const { GET } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates?status=DRAFT`
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("DRAFT");
  });
});

describe("Templates API - POST /api/[orgSlug]/emails/templates", () => {
  it("should create a new template", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "My New Template",
          description: "A test template",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("My New Template");
    expect(data.description).toBe("A test template");
    expect(data.status).toBe("DRAFT");
    expect(data.organizationId).toBe(testOrganization.id);
  });

  it("should require template name", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          description: "Missing name",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Template name is required");
  });

  it("should trim whitespace from name", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "  Trimmed Name  ",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Trimmed Name");
  });
});

describe("Templates API - GET /api/[orgSlug]/emails/templates/[id]", () => {
  it("should return a single template", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-single",
      organizationId: testOrganization.id,
      name: "Single Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { GET } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-single`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-single",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Single Template");
    expect(data.id).toBe("test-template-single");
  });

  it("should return 404 for non-existent template", async () => {
    const { GET } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/non-existent`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "non-existent",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });
});

describe("Templates API - PUT /api/[orgSlug]/emails/templates/[id]", () => {
  it("should update template content", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-update",
      organizationId: testOrganization.id,
      name: "Update Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const newContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Updated content" }],
        },
      ],
    };

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-update`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: newContent,
          createVersion: true,
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-update",
      }),
    };

    const response = await PUT(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.content).toEqual(newContent);

    // Check that a version was created
    const versions = await db.query.templateVersion.findMany({
      where: eq(templateVersion.templateId, "test-template-update"),
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
  });

  it("should update template name and description", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-meta-update",
      organizationId: testOrganization.id,
      name: "Original Name",
      description: "Original description",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-meta-update`,
      {
        method: "PUT",
        body: JSON.stringify({
          name: "New Name",
          description: "New description",
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-meta-update",
      }),
    };

    const response = await PUT(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("New Name");
    expect(data.description).toBe("New description");
  });

  it("should update template status", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-status-update",
      organizationId: testOrganization.id,
      name: "Status Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-status-update`,
      {
        method: "PUT",
        body: JSON.stringify({
          status: "PUBLISHED",
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-status-update",
      }),
    };

    const response = await PUT(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("PUBLISHED");
  });

  it("should update compiledText for SMS templates", async () => {
    // Create an SMS template
    await db.insert(template).values({
      id: "test-template-sms-update",
      organizationId: testOrganization.id,
      name: "SMS Update Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
      channel: "sms",
      compiledText: "Original message",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-sms-update`,
      {
        method: "PUT",
        body: JSON.stringify({
          compiledText: "Updated SMS message with {{contact.firstName}}",
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-sms-update",
      }),
    };

    const response = await PUT(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.compiledText).toBe(
      "Updated SMS message with {{contact.firstName}}"
    );
  });

  it("should reject non-string compiledText values", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-bad-compiled",
      organizationId: testOrganization.id,
      name: "Bad Compiled Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
      compiledText: "Original",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-bad-compiled`,
      {
        method: "PUT",
        body: JSON.stringify({
          compiledText: 12_345,
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-bad-compiled",
      }),
    };

    const response = await PUT(request, context);

    // Zod schema rejects non-string compiledText with 400
    expect(response.status).toBe(400);
  });

  it("should return 404 for non-existent template", async () => {
    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/non-existent`,
      {
        method: "PUT",
        body: JSON.stringify({
          name: "New Name",
        }),
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "non-existent",
      }),
    };

    const response = await PUT(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });

  it("marks a subject edit as a dashboard edit so a push will not overwrite it", async () => {
    await db.insert(template).values({
      id: "test-template-put-marks-subject",
      organizationId: testOrganization.id,
      name: "Marks Subject",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
      lastEditedFrom: "cli",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const response = await PUT(
      new Request(
        `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-put-marks-subject`,
        { method: "PUT", body: JSON.stringify({ subject: "New" }) }
      ),
      {
        params: Promise.resolve({
          orgSlug: testOrganization.slug,
          id: "test-template-put-marks-subject",
        }),
      }
    );

    expect(response.status).toBe(200);
    const stored = await db.query.template.findFirst({
      where: eq(template.id, "test-template-put-marks-subject"),
    });
    expect(stored?.subject).toBe("New");
    expect(stored?.lastEditedFrom).toBe("dashboard");
  });

  it("leaves lastEditedFrom alone on a rename", async () => {
    await db.insert(template).values({
      id: "test-template-put-rename-unmarked",
      organizationId: testOrganization.id,
      name: "Original",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
      lastEditedFrom: "cli",
    });

    const { PUT } = await import("../[orgSlug]/emails/templates/[id]/route");

    const response = await PUT(
      new Request(
        `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-put-rename-unmarked`,
        { method: "PUT", body: JSON.stringify({ name: "Renamed" }) }
      ),
      {
        params: Promise.resolve({
          orgSlug: testOrganization.slug,
          id: "test-template-put-rename-unmarked",
        }),
      }
    );

    expect(response.status).toBe(200);
    const stored = await db.query.template.findFirst({
      where: eq(template.id, "test-template-put-rename-unmarked"),
    });
    expect(stored?.name).toBe("Renamed");
    expect(stored?.lastEditedFrom).toBe("cli");
  });
});

describe("Templates API - DELETE /api/[orgSlug]/emails/templates/[id]", () => {
  it("should delete a template", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-delete",
      organizationId: testOrganization.id,
      name: "Delete Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-delete`,
      {
        method: "DELETE",
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-delete",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify template is deleted
    const deleted = await db.query.template.findFirst({
      where: eq(template.id, "test-template-delete"),
    });
    expect(deleted).toBeUndefined();
  });

  it("should return 404 for non-existent template", async () => {
    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/non-existent`,
      {
        method: "DELETE",
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "non-existent",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });
});

describe("Templates API - DELETE SES cleanup", () => {
  it("should delete SES template when sesTemplateName is set", async () => {
    // Create a published template with an SES template name
    await db.insert(template).values({
      id: "test-template-ses-delete",
      organizationId: testOrganization.id,
      name: "Published Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "PUBLISHED",
      sesTemplateName: "wraps-test-template-ses-delete",
      publishedAt: new Date(),
    });

    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-ses-delete`,
      { method: "DELETE" }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-ses-delete",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify SES template was deleted
    expect(mockDeleteSESTemplate).toHaveBeenCalledOnce();
    expect(mockDeleteSESTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
        sessionToken: "test-token",
      }),
      testAwsAccount.region,
      "wraps-test-template-ses-delete"
    );

    // Verify template is deleted from DB
    const deleted = await db.query.template.findFirst({
      where: eq(template.id, "test-template-ses-delete"),
    });
    expect(deleted).toBeUndefined();
  });

  it("should skip SES cleanup when sesTemplateName is null (draft template)", async () => {
    // Create a draft template with no SES template name
    await db.insert(template).values({
      id: "test-template-draft-delete",
      organizationId: testOrganization.id,
      name: "Draft Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
      sesTemplateName: null,
    });

    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-draft-delete`,
      { method: "DELETE" }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-draft-delete",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // SES delete should NOT be called for draft templates
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();

    // Verify template is deleted from DB
    const deleted = await db.query.template.findFirst({
      where: eq(template.id, "test-template-draft-delete"),
    });
    expect(deleted).toBeUndefined();
  });

  it("should still succeed if SES deletion fails", async () => {
    // Create a published template
    await db.insert(template).values({
      id: "test-template-ses-fail",
      organizationId: testOrganization.id,
      name: "SES Fail Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "PUBLISHED",
      sesTemplateName: "wraps-test-template-ses-fail",
      publishedAt: new Date(),
    });

    // Make SES delete fail
    mockDeleteSESTemplate.mockRejectedValueOnce(new Error("SES rate limit"));

    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-ses-fail`,
      { method: "DELETE" }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-ses-fail",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    // Should still succeed despite SES failure
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // SES delete was attempted
    expect(mockDeleteSESTemplate).toHaveBeenCalledOnce();

    // Template should still be deleted from DB
    const deleted = await db.query.template.findFirst({
      where: eq(template.id, "test-template-ses-fail"),
    });
    expect(deleted).toBeUndefined();
  });

  it("should still succeed if no AWS account exists for org", async () => {
    // Remove the AWS account for this test
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, testOrganization.id));

    // Create a published template
    await db.insert(template).values({
      id: "test-template-no-aws",
      organizationId: testOrganization.id,
      name: "No AWS Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "PUBLISHED",
      sesTemplateName: "wraps-test-template-no-aws",
      publishedAt: new Date(),
    });

    const { DELETE } = await import("../[orgSlug]/emails/templates/[id]/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-no-aws`,
      { method: "DELETE" }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-no-aws",
      }),
    };

    const response = await DELETE(request, context);
    const data = await response.json();

    // Should still succeed without AWS account
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // SES delete should NOT be called (no AWS account to assume role for)
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();

    // Template should still be deleted from DB
    const deleted = await db.query.template.findFirst({
      where: eq(template.id, "test-template-no-aws"),
    });
    expect(deleted).toBeUndefined();

    // Re-insert AWS account for other tests
    await db.insert(awsAccount).values(testAwsAccount);
  });
});

describe("Templates API - POST /api/[orgSlug]/emails/templates/[id]/duplicate", () => {
  it("should duplicate a template", async () => {
    // Create a template to duplicate
    await db.insert(template).values({
      id: "test-template-original",
      organizationId: testOrganization.id,
      name: "Original Template",
      description: "Original description",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      variables: [{ name: "testVar", defaultValue: "test" }],
      testData: { testVar: "value" },
      createdBy: testUser.id,
      status: "PUBLISHED",
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/duplicate/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-original/duplicate`,
      {
        method: "POST",
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-original",
      }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Original Template (Copy)");
    expect(data.description).toBe("Original description");
    expect(data.status).toBe("DRAFT"); // Duplicates are always drafts
    expect(data.id).not.toBe("test-template-original");
  });

  it("should return 404 for non-existent template", async () => {
    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/duplicate/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/non-existent/duplicate`,
      {
        method: "POST",
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "non-existent",
      }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });

  it("should preserve sourceFormat, source, compiledHtml, compiledText, and subject when duplicating a CLI-pushed react-email template", async () => {
    // Create a template that simulates a CLI push with react-email source
    await db.insert(template).values({
      id: "test-template-react-email",
      organizationId: testOrganization.id,
      name: "CLI Pushed Template",
      description: "A template pushed from the CLI",
      subject: "Welcome {{firstName}}!",
      content: { type: "doc", content: [] },
      variables: [{ name: "firstName", defaultValue: "World" }],
      testData: { firstName: "Test" },
      createdBy: testUser.id,
      status: "PUBLISHED",
      // CLI-push specific fields
      sourceFormat: "react-email",
      source:
        'import { Html } from "@react-email/components"; export default function Welcome() { return <Html><h1>Hello</h1></Html>; }',
      compiledHtml: "<html><h1>Hello</h1></html>",
      compiledText: "Hello",
      sourceHash: "abc123def456",
      pushedFromCli: true,
    });

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/duplicate/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-react-email/duplicate`,
      {
        method: "POST",
      }
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-react-email",
      }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("CLI Pushed Template (Copy)");

    expect(data.sourceFormat).toBe("react-email");
    expect(data.source).toBe(
      'import { Html } from "@react-email/components"; export default function Welcome() { return <Html><h1>Hello</h1></Html>; }'
    );
    expect(data.compiledHtml).toBe("<html><h1>Hello</h1></html>");
    expect(data.compiledText).toBe("Hello");
    expect(data.subject).toBe("Welcome {{firstName}}!");
  });
});

describe("Templates API - GET /api/[orgSlug]/emails/templates/[id]/versions", () => {
  it("should return empty list when no versions exist", async () => {
    // Create a template without versions
    await db.insert(template).values({
      id: "test-template-no-versions",
      organizationId: testOrganization.id,
      name: "No Versions Template",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { GET } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-no-versions/versions`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-no-versions",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should return versions for a template", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-with-versions",
      organizationId: testOrganization.id,
      name: "Template With Versions",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    // Create versions
    await db.insert(templateVersion).values([
      {
        templateId: "test-template-with-versions",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "v1" }] },
          ],
        },
        version: 1,
        createdBy: testUser.id,
      },
      {
        templateId: "test-template-with-versions",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "v2" }] },
          ],
        },
        version: 2,
        createdBy: testUser.id,
      },
    ]);

    const { GET } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-with-versions/versions`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-with-versions",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    // Versions should be ordered by version desc
    expect(data[0].version).toBe(2);
    expect(data[1].version).toBe(1);
  });

  it("should return 404 for non-existent template", async () => {
    const { GET } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/non-existent/versions`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "non-existent",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });
});

describe("Templates API - GET /api/[orgSlug]/emails/templates/[id]/versions/[versionId]", () => {
  it("should return a specific version", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-version-get",
      organizationId: testOrganization.id,
      name: "Version Get Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    // Create a version
    const [version] = await db
      .insert(templateVersion)
      .values({
        templateId: "test-template-version-get",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        version: 1,
        createdBy: testUser.id,
      })
      .returning();

    const { GET } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/[versionId]/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-version-get/versions/${version.id}`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-version-get",
        versionId: version.id,
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.version).toBe(1);
    expect(data.id).toBe(version.id);
  });

  it("should return 404 for non-existent version", async () => {
    // Create a template
    await db.insert(template).values({
      id: "test-template-version-404",
      organizationId: testOrganization.id,
      name: "Version 404 Test",
      content: { type: "doc", content: [] },
      createdBy: testUser.id,
      status: "DRAFT",
    });

    const { GET } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/[versionId]/route"
    );

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-version-404/versions/non-existent`
    );
    const context = {
      params: Promise.resolve({
        orgSlug: testOrganization.slug,
        id: "test-template-version-404",
        versionId: "non-existent",
      }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Version not found");
  });
});

describe("Templates API - POST …/versions/[versionId] (restore)", () => {
  it("marks a restore as a dashboard edit so a push will not overwrite it", async () => {
    await db.insert(template).values({
      id: "test-template-restore-marks",
      organizationId: testOrganization.id,
      name: "Restore Marks",
      content: { type: "doc", content: [] },
      source: "export default function Current() { return null; }",
      createdBy: testUser.id,
      status: "DRAFT",
      lastEditedFrom: "cli",
    });

    const [version] = await db
      .insert(templateVersion)
      .values({
        templateId: "test-template-restore-marks",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        source: "export default function Old() { return null; }",
        version: 1,
        createdBy: testUser.id,
      })
      .returning();

    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/[versionId]/route"
    );

    const response = await POST(
      new Request(
        `http://localhost/api/${testOrganization.slug}/emails/templates/test-template-restore-marks/versions/${version.id}`,
        { method: "POST" }
      ),
      {
        params: Promise.resolve({
          orgSlug: testOrganization.slug,
          id: "test-template-restore-marks",
          versionId: version.id,
        }),
      }
    );

    expect(response.status).toBe(200);
    const stored = await db.query.template.findFirst({
      where: eq(template.id, "test-template-restore-marks"),
    });
    expect(stored?.source).toBe(
      "export default function Old() { return null; }"
    );
    expect(stored?.lastEditedFrom).toBe("dashboard");
  });
});

describe("Templates API - POST SMS channel support", () => {
  it("should create a template with channel 'sms'", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "SMS Welcome",
          channel: "sms",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.channel).toBe("sms");
    // SMS templates should have null subject
    expect(data.subject).toBeNull();
    // SMS templates get empty doc content
    expect(data.content).toEqual({ type: "doc", content: [] });
  });

  it("should default to 'email' channel for invalid channel values", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "Invalid Channel Template",
          channel: "push-notification",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.channel).toBe("email");
    // Email templates default to react-email with empty content (AI generates)
    expect(data.content).toEqual({});
    expect(data.sourceFormat).toBe("react-email");
  });

  it("should default to 'email' channel when no channel is provided", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "No Channel Template",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.channel).toBe("email");
  });
});

describe("Templates API - POST with starter template fields", () => {
  it("should create a template with source, compiledHtml, subject, previewText, and emailType", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "Welcome Email",
          source:
            'import { Html } from "@react-email/components"; export default function Welcome() { return <Html><h1>Hello</h1></Html>; }',
          compiledHtml: "<html><h1>Hello</h1></html>",
          subject: "Welcome to Acme!",
          previewText: "We're glad to have you",
          emailType: "transactional",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Welcome Email");
    expect(data.source).toBe(
      'import { Html } from "@react-email/components"; export default function Welcome() { return <Html><h1>Hello</h1></Html>; }'
    );
    expect(data.compiledHtml).toBe("<html><h1>Hello</h1></html>");
    expect(data.subject).toBe("Welcome to Acme!");
    expect(data.previewText).toBe("We're glad to have you");
    expect(data.emailType).toBe("transactional");
  });

  it("should create empty template when no source fields provided (backward compat)", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "Plain Template",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Plain Template");
    expect(data.source).toBeNull();
    expect(data.compiledHtml).toBeNull();
    expect(data.emailType).toBe("marketing"); // DB default
  });

  it("should set emailType to transactional when provided", async () => {
    const { POST } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      `http://localhost/api/${testOrganization.slug}/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "Password Reset",
          emailType: "transactional",
        }),
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.emailType).toBe("transactional");
  });
});

describe("Templates API - Authorization", () => {
  it("should return 403 for unauthorized organization", async () => {
    const { GET } = await import("../[orgSlug]/emails/templates/route");

    const request = new Request(
      "http://localhost/api/unauthorized-org/templates"
    );
    const context = {
      params: Promise.resolve({ orgSlug: "unauthorized-org" }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });
});
