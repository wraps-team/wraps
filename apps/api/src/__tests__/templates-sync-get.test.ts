import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../middleware/auth";

type MockTemplate = {
  id: string;
  slug: string;
  source: string | null;
  subject: string;
  emailType: string;
  channel: string;
  variables: Record<string, unknown>[];
  sourceHash: string;
  status: string;
  updatedAt: Date;
  lastEditedFrom: string | null;
};

let mockTemplates: MockTemplate[] = [];

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // Unpaginated path awaits `.where(...)` directly (thenable via
          // Promise.resolve below). Paginated path chains `.orderBy().limit()`
          // before awaiting — both must resolve to the same mock rows.
          then: (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown
          ) => Promise.resolve(mockTemplates).then(resolve, reject),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockTemplates)),
          })),
        })),
      })),
    })),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  template: {
    id: "id",
    slug: "slug",
    organizationId: "organization_id",
    source: "source",
    subject: "subject",
    emailType: "email_type",
    channel: "channel",
    variables: "variables",
    sourceHash: "source_hash",
    sourceFormat: "source_format",
    status: "status",
    updatedAt: "updated_at",
    lastEditedFrom: "last_edited_from",
    lastEditedBy: "last_edited_by",
    pushedFromCli: "pushed_from_cli",
    lastPushedAt: "last_pushed_at",
    cliProjectPath: "cli_project_path",
    name: "name",
    previewText: "preview_text",
    compiledHtml: "compiled_html",
    compiledText: "compiled_text",
    sesTemplateName: "ses_template_name",
    content: "content",
    createdBy: "created_by",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  desc: vi.fn((...args) => ({ op: args })),
  or: vi.fn((...args) => ({ op: args })),
  lt: vi.fn((...args) => ({ op: args })),
  gt: vi.fn((...args) => ({ op: args })),
  encodeCursor: vi.fn(() => "cursor"),
  decodeCursor: vi.fn(() => null),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstResourceCreated: vi.fn(async () => {}),
}));

const mockAuth: AuthContext = {
  apiKeyId: "key-1",
  organizationId: "org-abc",
  userId: "user-1",
  planId: "starter",
};

beforeEach(() => {
  mockTemplates = [];
  vi.clearAllMocks();
});

function createTestApp() {
  return import("elysia").then(({ Elysia }) =>
    import("../routes/templates-sync").then(({ templatesSyncRoutes }) =>
      new Elysia().derive(() => ({ auth: mockAuth })).use(templatesSyncRoutes)
    )
  );
}

async function pullTemplates() {
  const app = await createTestApp();
  return app.handle(
    new Request("http://localhost/v1/templates/pull", { method: "GET" })
  );
}

describe("GET /v1/templates/pull", () => {
  describe("empty state", () => {
    it("returns empty array when org has no templates", async () => {
      mockTemplates = [];

      const res = await pullTemplates();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates).toEqual([]);
    });
  });

  describe("returning templates", () => {
    it("returns templates with all expected fields", async () => {
      const updatedAt = new Date("2024-08-01T10:00:00.000Z");
      mockTemplates = [
        {
          id: "tmpl-1",
          slug: "welcome",
          source: "import { Html } from '@react-email/components';",
          subject: "Welcome!",
          emailType: "transactional",
          channel: "email",
          variables: [{ name: "firstName", fallback: "there" }],
          sourceHash: "abc123",
          status: "PUBLISHED",
          updatedAt,
          lastEditedFrom: "cli",
        },
      ];

      const res = await pullTemplates();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.templates).toHaveLength(1);

      const tmpl = body.templates[0];
      expect(tmpl.id).toBe("tmpl-1");
      expect(tmpl.slug).toBe("welcome");
      expect(tmpl.source).toBe(
        "import { Html } from '@react-email/components';"
      );
      expect(tmpl.subject).toBe("Welcome!");
      expect(tmpl.emailType).toBe("transactional");
      expect(tmpl.channel).toBe("email");
      expect(tmpl.variables).toEqual([
        { name: "firstName", fallback: "there" },
      ]);
      expect(tmpl.sourceHash).toBe("abc123");
      expect(tmpl.status).toBe("PUBLISHED");
      expect(tmpl.updatedAt).toBe("2024-08-01T10:00:00.000Z");
      expect(tmpl.lastEditedFrom).toBe("cli");
    });

    it("returns updatedAt as ISO string", async () => {
      const updatedAt = new Date("2025-03-15T14:30:00.000Z");
      mockTemplates = [
        {
          id: "tmpl-2",
          slug: "password-reset",
          source: "// source",
          subject: "Reset your password",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "def456",
          status: "PUBLISHED",
          updatedAt,
          lastEditedFrom: "cli",
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates[0].updatedAt).toBe("2025-03-15T14:30:00.000Z");
      expect(typeof body.templates[0].updatedAt).toBe("string");
    });

    it("returns multiple templates", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-1",
          slug: "welcome",
          source: "// welcome",
          subject: "Welcome",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "hash1",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "cli",
        },
        {
          id: "tmpl-2",
          slug: "newsletter",
          source: "// newsletter",
          subject: "Newsletter",
          emailType: "marketing",
          channel: "email",
          variables: [],
          sourceHash: "hash2",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "cli",
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toHaveLength(2);
      expect(body.templates[0].slug).toBe("welcome");
      expect(body.templates[1].slug).toBe("newsletter");
    });
  });

  describe("null source filtering", () => {
    it("excludes templates where source is null", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-with-source",
          slug: "has-source",
          source: "// valid source",
          subject: "Has Source",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "hash1",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "cli",
        },
        {
          id: "tmpl-null-source",
          slug: "no-source",
          source: null,
          subject: "No Source",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "hash2",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "dashboard",
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toHaveLength(1);
      expect(body.templates[0].id).toBe("tmpl-with-source");
      expect(body.templates[0].slug).toBe("has-source");
    });

    it("returns empty array when all templates have null source", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-1",
          slug: "a",
          source: null,
          subject: "A",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "x",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: null,
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toEqual([]);
    });
  });

  describe("org scoping", () => {
    it("returns only templates from the mock DB result scoped to the authenticated org", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-org-scoped",
          slug: "scoped-template",
          source: "// scoped",
          subject: "Scoped",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "scope-hash",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "cli",
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toHaveLength(1);
      expect(body.templates[0].id).toBe("tmpl-org-scoped");
    });

    it("returns empty array when mock DB returns no templates for the org", async () => {
      mockTemplates = [];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toEqual([]);
    });
  });

  describe("template fields passthrough", () => {
    it("passes through sms channel templates", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-sms",
          slug: "sms-alert",
          source: "// sms source",
          subject: "Alert",
          emailType: "transactional",
          channel: "sms",
          variables: [],
          sourceHash: "sms-hash",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: "cli",
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates).toHaveLength(1);
      expect(body.templates[0].channel).toBe("sms");
    });

    it("passes through lastEditedFrom as null when null in DB", async () => {
      const now = new Date();
      mockTemplates = [
        {
          id: "tmpl-no-editor",
          slug: "legacy",
          source: "// legacy source",
          subject: "Legacy",
          emailType: "transactional",
          channel: "email",
          variables: [],
          sourceHash: "legacy-hash",
          status: "PUBLISHED",
          updatedAt: now,
          lastEditedFrom: null,
        },
      ];

      const res = await pullTemplates();
      const body = await res.json();

      expect(body.templates[0].lastEditedFrom).toBeNull();
    });
  });
});
