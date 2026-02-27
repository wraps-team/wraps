/**
 * Workflows Sync API Tests
 *
 * Tests the workflow push/pull endpoints:
 * 1. Creates new workflow on push
 * 2. Updates existing workflow by slug
 * 3. Detects conflicts when lastEditedFrom=dashboard
 * 4. Bypasses conflict with force=true
 * 5. Resolves template slugs to UUIDs
 * 6. Batch push handles multiple workflows
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../middleware/auth";

// Mock DB state
let mockExistingWorkflow: Record<string, unknown> | null = null;
let mockTemplates: Array<{ id: string; slug: string }> = [];
let lastInsertValues: Record<string, unknown> | null = null;
let lastUpdateSet: Record<string, unknown> | null = null;

// Mock @wraps/db before imports
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        // Create a promise-like result that also has .limit() for workflow queries
        const createWhereResult = () => {
          const promise = Promise.resolve(mockTemplates);
          // Add limit method for workflow queries
          (promise as any).limit = vi.fn(() => {
            // awsAccount queries return an account with id
            if (table?.id === "awsAccount.id") {
              return [{ id: "aws-acc-1" }];
            }
            if (mockExistingWorkflow) {
              return [mockExistingWorkflow];
            }
            return [];
          });
          return promise;
        };

        return {
          where: vi.fn(() => createWhereResult()),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        lastUpdateSet = values;
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        lastInsertValues = values;
        return Promise.resolve();
      }),
    })),
    query: {
      template: {
        findMany: vi.fn(() => Promise.resolve(mockTemplates)),
      },
    },
  },
  awsAccount: {
    id: "awsAccount.id",
    organizationId: "awsAccount.organizationId",
  },
  automation: "workflow",
  workflow: "workflow",
  template: "template",
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn(),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
    sql: strings.join("?"),
  }),
}));

const authContext: AuthContext = {
  apiKeyId: "key-1",
  organizationId: "org-1",
  userId: "user-1",
  planId: "starter",
};

// Using 'any' cast for test data as the exact types are complex
// and tests focus on behavior, not type checking
const basePushBody: any = {
  slug: "onboarding",
  name: "User Onboarding",
  description: "Welcome sequence for new users",
  sourceTs: `import { defineWorkflow } from '@wraps.dev/client';
export default defineWorkflow({
  name: 'User Onboarding',
  trigger: { type: 'contact_created' },
  steps: [],
});`,
  sourceHash: "abc123def456",
  steps: [
    {
      id: "trigger",
      type: "trigger",
      name: "When contact is created",
      position: { x: 0, y: 0 },
      config: { type: "trigger", triggerType: "contact_created" },
    },
    {
      id: "email-1",
      type: "send_email",
      name: "Send welcome",
      position: { x: 0, y: 200 },
      config: { type: "send_email", templateId: "welcome" },
    },
  ],
  transitions: [
    { id: "t-trigger-email-1", fromStepId: "trigger", toStepId: "email-1" },
  ],
  triggerType: "contact_created",
  triggerConfig: {},
  cliProjectPath: "workflows/onboarding.ts",
};

beforeEach(() => {
  mockExistingWorkflow = null;
  mockTemplates = [];
  lastInsertValues = null;
  lastUpdateSet = null;
  vi.clearAllMocks();
});

describe("upsertWorkflowFromCli - Push Conflict Detection", () => {
  it("should return conflict when lastEditedFrom=dashboard and force=false", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "dashboard",
      updatedAt: new Date("2024-06-15T12:00:00Z"),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      force: false,
    });

    expect(result.conflict).toBe(true);
    expect(result.id).toBe("wf-1");
    expect(result.created).toBe(false);
    // Should NOT have updated the DB
    expect(lastUpdateSet).toBeNull();
  });

  it("should return conflict when lastEditedFrom=dashboard and force not provided", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "dashboard",
      updatedAt: new Date("2024-06-15T12:00:00Z"),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.conflict).toBe(true);
    expect(lastUpdateSet).toBeNull();
  });

  it("should succeed with force=true even when lastEditedFrom=dashboard", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "dashboard",
      updatedAt: new Date("2024-06-15T12:00:00Z"),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      force: true,
    });

    expect(result.conflict).toBeUndefined();
    expect(result.id).toBe("wf-1");
    expect(result.created).toBe(false);
    // Should have updated the DB
    expect(lastUpdateSet).not.toBeNull();
    expect(lastUpdateSet?.lastEditedFrom).toBe("cli");
  });

  it("should succeed when lastEditedFrom=cli", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date("2024-06-15T12:00:00Z"),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.conflict).toBeUndefined();
    expect(result.created).toBe(false);
    expect(lastUpdateSet).not.toBeNull();
    expect(lastUpdateSet?.lastEditedFrom).toBe("cli");
  });

  it("should succeed when lastEditedFrom is null", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: null,
      updatedAt: new Date("2024-06-15T12:00:00Z"),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.conflict).toBeUndefined();
    expect(result.created).toBe(false);
  });
});

describe("upsertWorkflowFromCli - Insert New Workflow", () => {
  it("should insert new workflow when slug does not exist", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.created).toBe(true);
    expect(result.conflict).toBeUndefined();
    expect(result.id).toBeDefined();
    // Should have inserted into DB
    expect(lastInsertValues).not.toBeNull();
    expect(lastInsertValues?.slug).toBe("onboarding");
    expect(lastInsertValues?.name).toBe("User Onboarding");
    expect(lastInsertValues?.lastEditedFrom).toBe("cli");
    expect(lastInsertValues?.organizationId).toBe("org-1");
    expect(lastInsertValues?.status).toBe("enabled");
  });

  it("should set pushedFromCli=true on insert", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastInsertValues?.pushedFromCli).toBe(true);
  });

  it("should store source TypeScript and hash", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastInsertValues?.sourceTs).toBe(basePushBody.sourceTs);
    expect(lastInsertValues?.sourceHash).toBe(basePushBody.sourceHash);
  });
});

describe("upsertWorkflowFromCli - Update Existing Workflow", () => {
  it("should set pushedFromCli=true on update", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastUpdateSet?.pushedFromCli).toBe(true);
  });

  it("should update steps and transitions", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastUpdateSet?.steps).toEqual(basePushBody.steps);
    expect(lastUpdateSet?.transitions).toEqual(basePushBody.transitions);
  });

  it("should update trigger config", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      triggerType: "event",
      triggerConfig: { eventName: "signup" },
    });

    expect(lastUpdateSet?.triggerType).toBe("event");
    expect(lastUpdateSet?.triggerConfig).toEqual({ eventName: "signup" });
  });
});

describe("resolveTemplateReferences", () => {
  it("should resolve template slugs to UUIDs", async () => {
    mockTemplates = [
      { id: "tmpl-uuid-1", slug: "welcome" },
      { id: "tmpl-uuid-2", slug: "tips" },
    ];

    const { resolveTemplateReferences } = await import(
      "../routes/workflows-sync"
    );

    const steps = [
      {
        id: "email-1",
        type: "send_email",
        name: "Send welcome",
        position: { x: 0, y: 200 },
        config: { type: "send_email", templateId: "welcome" },
      },
      {
        id: "email-2",
        type: "send_email",
        name: "Send tips",
        position: { x: 0, y: 400 },
        config: { type: "send_email", templateId: "tips" },
      },
    ];

    const { db } = await import("@wraps/db");
    const resolved = await resolveTemplateReferences(
      db as never,
      "org-1",
      steps as any
    );

    expect((resolved[0].config as any).templateId).toBe("tmpl-uuid-1");
    expect((resolved[1].config as any).templateId).toBe("tmpl-uuid-2");
  });

  it("should leave non-email steps unchanged", async () => {
    mockTemplates = [];

    const { resolveTemplateReferences } = await import(
      "../routes/workflows-sync"
    );

    const steps = [
      {
        id: "trigger",
        type: "trigger",
        name: "Trigger",
        position: { x: 0, y: 0 },
        config: { type: "trigger", triggerType: "contact_created" },
      },
      {
        id: "delay-1",
        type: "delay",
        name: "Wait",
        position: { x: 0, y: 200 },
        config: { type: "delay", amount: 1, unit: "days" },
      },
    ];

    const { db } = await import("@wraps/db");
    const resolved = await resolveTemplateReferences(
      db as never,
      "org-1",
      steps as any
    );

    expect(resolved[0].config).toEqual(steps[0].config);
    expect(resolved[1].config).toEqual(steps[1].config);
  });

  it("should keep templateId if no matching template found", async () => {
    mockTemplates = []; // No templates

    const { resolveTemplateReferences } = await import(
      "../routes/workflows-sync"
    );

    const steps = [
      {
        id: "email-1",
        type: "send_email",
        name: "Send welcome",
        position: { x: 0, y: 200 },
        config: { type: "send_email", templateId: "nonexistent" },
      },
    ];

    const { db } = await import("@wraps/db");
    const resolved = await resolveTemplateReferences(
      db as never,
      "org-1",
      steps as any
    );

    // Should keep the original slug if not found (API will fail later with better error)
    expect((resolved[0].config as any).templateId).toBe("nonexistent");
  });

  it("should resolve send_sms template slugs to UUIDs", async () => {
    mockTemplates = [
      { id: "tmpl-uuid-1", slug: "welcome" },
      { id: "tmpl-uuid-3", slug: "sms-reminder" },
    ];

    const { resolveTemplateReferences } = await import(
      "../routes/workflows-sync"
    );

    const steps = [
      {
        id: "email-1",
        type: "send_email",
        name: "Send welcome",
        position: { x: 0, y: 200 },
        config: { type: "send_email", templateId: "welcome" },
      },
      {
        id: "sms-1",
        type: "send_sms",
        name: "Send reminder",
        position: { x: 0, y: 400 },
        config: { type: "send_sms", templateId: "sms-reminder" },
      },
    ];

    const { db } = await import("@wraps/db");
    const resolved = await resolveTemplateReferences(
      db as never,
      "org-1",
      steps as any
    );

    expect((resolved[0].config as any).templateId).toBe("tmpl-uuid-1");
    expect((resolved[1].config as any).templateId).toBe("tmpl-uuid-3");
  });
});

describe("Workflow Settings", () => {
  it("should store workflow settings on insert", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      settings: {
        allowReentry: true,
        reentryDelaySeconds: 3600,
        maxConcurrentExecutions: 100,
      },
    });

    expect(lastInsertValues?.allowReentry).toBe(true);
    expect(lastInsertValues?.reentryDelaySeconds).toBe(3600);
    expect(lastInsertValues?.maxConcurrentExecutions).toBe(100);
  });

  it("should store workflow defaults on insert", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      defaults: {
        from: "hello@example.com",
        fromName: "My App",
      },
    });

    expect(lastInsertValues?.defaultFrom).toBe("hello@example.com");
    expect(lastInsertValues?.defaultFromName).toBe("My App");
  });
});

describe("upsertWorkflowFromCli - Draft Push", () => {
  it("should insert new workflow with status=draft when draft=true", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      draft: true,
    });

    expect(result.created).toBe(true);
    expect(lastInsertValues?.status).toBe("draft");
  });

  it("should default to status=enabled when draft not provided (insert)", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastInsertValues?.status).toBe("enabled");
  });

  it("should default to status=enabled when draft=false (insert)", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      draft: false,
    });

    expect(lastInsertValues?.status).toBe("enabled");
  });

  it("should default to status=enabled when draft not provided (update)", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    await upsertWorkflowFromCli(db as never, authContext, basePushBody);

    expect(lastUpdateSet?.status).toBe("enabled");
  });

  it("should update existing workflow with status=draft when draft=true", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      draft: true,
    });

    expect(result.created).toBe(false);
    expect(lastUpdateSet?.status).toBe("draft");
  });

  it("should return status=draft in result when draft=true (insert)", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      draft: true,
    });

    expect(result.status).toBe("draft");
  });

  it("should return status=enabled in result when draft not provided (insert)", async () => {
    mockExistingWorkflow = null;

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.status).toBe("enabled");
  });

  it("should return status=enabled in result when draft not provided (update)", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(
      db as never,
      authContext,
      basePushBody
    );

    expect(result.status).toBe("enabled");
  });

  it("should return status=draft in result when draft=true (update)", async () => {
    mockExistingWorkflow = {
      id: "wf-1",
      lastEditedFrom: "cli",
      updatedAt: new Date(),
    };

    const { upsertWorkflowFromCli } = await import("../routes/workflows-sync");

    const { db } = await import("@wraps/db");
    const result = await upsertWorkflowFromCli(db as never, authContext, {
      ...basePushBody,
      draft: true,
    });

    expect(result.status).toBe("draft");
  });
});
