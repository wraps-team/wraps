/**
 * contact_updated from the API suppression routes (real DB)
 *
 * POST /v1/suppressions, POST /v1/suppressions/bulk and
 * DELETE /v1/suppressions/:email emit contact_updated when, and only when,
 * they change a contact's email status. The event carries
 * `updatedFields: ["emailStatus"]` and `changeSource` "api" (API key) or
 * "user" (session). Bulk emits once per request.
 *
 * Boundaries mocked: SES and AssumeRole (in-memory suppression list per AWS
 * account) and the SQS enqueue. `emitContactsUpdated` is wrapped around its
 * real implementation so calls per request can be counted. `@wraps/db` is the
 * real client.
 */

import { createHash } from "node:crypto";
import { and, auditLog, contact, db, eq, workflow } from "@wraps/db";
import { inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  baseOrgIds,
  cleanupBaseOrg,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";
import { createErrorHarness } from "./error-handler-harness";

const sesState = vi.hoisted(() => ({
  // awsAccountId -> suppression list
  store: new Map<string, { EmailAddress: string; Reason: string }[]>(),
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn(async (awsAccountId: string) => ({
    accessKeyId: `AKIA${awsAccountId}`,
    secretAccessKey: "test-secret",
    sessionToken: "test-token",
    expiration: new Date(Date.now() + 3_600_000),
    region: "us-east-1",
  })),
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  function notFound(): Error {
    return Object.assign(new Error("NotFoundException: not on the list"), {
      name: "NotFoundException",
    });
  }
  class SESv2Client {
    accountId: string;
    constructor(config: { credentials: { accessKeyId: string } }) {
      this.accountId = config.credentials.accessKeyId.replace(/^AKIA/, "");
    }
    send(command: { kind: string; input: Record<string, unknown> }) {
      const list = sesState.store.get(this.accountId) ?? [];
      const email = command.input.EmailAddress as string;
      const index = list.findIndex((e) => e.EmailAddress === email);
      if (command.kind === "get") {
        if (index < 0) {
          return Promise.reject(notFound());
        }
        return Promise.resolve({
          SuppressedDestination: {
            ...list[index],
            LastUpdateTime: new Date("2026-10-01T00:00:00.000Z"),
          },
        });
      }
      if (command.kind === "put") {
        const entry = {
          EmailAddress: email,
          Reason: command.input.Reason as string,
        };
        if (index >= 0) {
          list[index] = entry;
        } else {
          list.push(entry);
        }
        sesState.store.set(this.accountId, list);
        return Promise.resolve({});
      }
      if (command.kind === "delete") {
        if (index < 0) {
          return Promise.reject(notFound());
        }
        list.splice(index, 1);
        return Promise.resolve({});
      }
      return Promise.reject(
        new Error(`unexpected SES command ${command.kind}`)
      );
    }
  }
  class ListSuppressedDestinationsCommand {
    readonly kind = "list";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class GetSuppressedDestinationCommand {
    readonly kind = "get";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class PutSuppressedDestinationCommand {
    readonly kind = "put";
    constructor(readonly input: Record<string, unknown>) {}
  }
  class DeleteSuppressedDestinationCommand {
    readonly kind = "delete";
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    SESv2Client,
    ListSuppressedDestinationsCommand,
    GetSuppressedDestinationCommand,
    PutSuppressedDestinationCommand,
    DeleteSuppressedDestinationCommand,
  };
});

vi.mock("../services/workflow-queue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workflow-queue")>();
  return {
    ...actual,
    enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
    enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
    deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../services/workflow-events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workflow-events")>();
  return {
    ...actual,
    emitContactsUpdated: vi.fn(actual.emitContactsUpdated),
  };
});

const { suppressionsRoutes } = await import("../routes/suppressions");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");
const { emitContactsUpdated } = await import("../services/workflow-events");

const PREFIX = `t023a-sup-${crypto.randomUUID().slice(0, 8)}`;
const ids = baseOrgIds(PREFIX);

type TriggerJob = {
  type: string;
  workflowId: string;
  contactId: string;
  organizationId: string;
  eventData?: Record<string, unknown>;
};

const mockedBatch = vi.mocked(enqueueWorkflowStepBatch);
const mockedEmit = vi.mocked(emitContactsUpdated);

function enqueuedJobs(): TriggerJob[] {
  return mockedBatch.mock.calls.flatMap(([jobs]) => jobs as TriggerJob[]);
}

function sessionApp() {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
      },
    }))
    .use(suppressionsRoutes);
}

function keyApp() {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: `key-${PREFIX}`,
        organizationId: ids.org,
        // API keys carry a userId too; changeSource must still say "api".
        userId: ids.user,
        planId: "pro",
        apiKeyScopes: ["contacts:write"],
      },
    }))
    .use(suppressionsRoutes);
}

async function call(
  app: { handle: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown
) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

/** Lowercase, as the routes store it. */
function uniqueEmail(label: string): string {
  return `${PREFIX}-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`.toLowerCase();
}

async function seedContact(email: string, emailStatus: string | null) {
  const id = `${PREFIX}-c-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date();
  await db.insert(contact).values({
    id,
    organizationId: ids.org,
    email,
    emailHash: hashEmail(email),
    firstName: "Sup",
    lastName: "Test",
    emailStatus,
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as typeof contact.$inferInsert);
  return id;
}

async function statusOf(contactId: string) {
  const [row] = await db
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(eq(contact.id, contactId));
  return row?.emailStatus;
}

async function auditMetadataFor(email: string) {
  const rows = await db
    .select({ action: auditLog.action, metadata: auditLog.metadata })
    .from(auditLog)
    .where(
      and(eq(auditLog.organizationId, ids.org), eq(auditLog.resourceId, email))
    );
  return rows;
}

/** Both match forms in the org, a paused one, and both forms in the other org. */
async function seedWorkflows(): Promise<string[]> {
  const eventForm = `${PREFIX}-wf-event`;
  const triggerForm = `${PREFIX}-wf-trigger`;
  await db.insert(workflow).values([
    workflowRow(ids, {
      id: eventForm,
      triggerType: "event",
      triggerConfig: { eventName: "contact_updated" },
    }),
    workflowRow(ids, {
      id: triggerForm,
      triggerType: "contact_updated",
      triggerConfig: {},
    }),
    workflowRow(ids, {
      id: `${PREFIX}-wf-paused`,
      status: "paused",
      triggerType: "contact_updated",
      triggerConfig: {},
    }),
    workflowRow(ids, {
      id: `${PREFIX}-wf-other-event`,
      organizationId: ids.otherOrg,
      triggerType: "event",
      triggerConfig: { eventName: "contact_updated" },
    }),
    workflowRow(ids, {
      id: `${PREFIX}-wf-other-trigger`,
      organizationId: ids.otherOrg,
      triggerType: "contact_updated",
      triggerConfig: {},
    }),
  ]);
  return [eventForm, triggerForm];
}

let workflowIds: string[] = [];

beforeAll(async () => {
  await seedBaseOrg(PREFIX);
  workflowIds = await seedWorkflows();
});

beforeEach(() => {
  sesState.store = new Map();
  vi.clearAllMocks();
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
  await cleanupBaseOrg(PREFIX);
});

function expectStatusJobs(
  jobs: TriggerJob[],
  contactId: string,
  expected: { emailStatus: string; changeSource: string }
) {
  expect(jobs.map((j) => j.workflowId).sort()).toEqual([...workflowIds].sort());
  for (const job of jobs) {
    expect(job).toMatchObject({
      type: "trigger",
      contactId,
      organizationId: ids.org,
    });
    expect(job.eventData).toMatchObject({
      emailStatus: expected.emailStatus,
      updatedFields: ["emailStatus"],
      changeSource: expected.changeSource,
    });
  }
}

describe("single add", () => {
  it("an API key suppressing an active contact enqueues one job per enabled contact_updated workflow, changeSource api", async () => {
    const email = uniqueEmail("key");
    const contactId = await seedContact(email, "active");

    const res = await call(keyApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expect(res.body.alreadyPresent).toBe(false);
    expect(await statusOf(contactId)).toBe("suppressed");
    expectStatusJobs(enqueuedJobs(), contactId, {
      emailStatus: "suppressed",
      changeSource: "api",
    });
  });

  it("a signed-in session doing the same reports changeSource user", async () => {
    const email = uniqueEmail("session");
    const contactId = await seedContact(email, "active");

    const res = await call(sessionApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expectStatusJobs(enqueuedJobs(), contactId, {
      emailStatus: "suppressed",
      changeSource: "user",
    });
  });

  it("an already-suppressed contact enqueues nothing, and its audit row still says contactSuppressed false", async () => {
    const email = uniqueEmail("already");
    await seedContact(email, "suppressed");

    const res = await call(sessionApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expect(res.body.alreadyPresent).toBe(false);
    expect(mockedBatch).not.toHaveBeenCalled();
    const audit = await auditMetadataFor(email);
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ contactSuppressed: false });
  });

  it("an address with no contact enqueues nothing, and its audit row says contactSuppressed false", async () => {
    const email = uniqueEmail("nocontact");

    const res = await call(sessionApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expect(mockedBatch).not.toHaveBeenCalled();
    const audit = await auditMetadataFor(email);
    expect(audit[0].metadata).toMatchObject({ contactSuppressed: false });
  });

  it("a new add of an active contact writes contactSuppressed true to the audit row", async () => {
    const email = uniqueEmail("auditTrue");
    await seedContact(email, "active");

    await call(sessionApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    const audit = await auditMetadataFor(email);
    expect(audit[0].metadata).toMatchObject({ contactSuppressed: true });
  });

  it("SES already lists the address but the contact is active: alreadyPresent, and one job per workflow", async () => {
    const email = uniqueEmail("sesHas");
    const contactId = await seedContact(email, "active");
    sesState.store.set(ids.awsAccount, [
      { EmailAddress: email, Reason: "BOUNCE" },
    ]);

    const res = await call(keyApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expect(res.body.alreadyPresent).toBe(true);
    expect(await statusOf(contactId)).toBe("suppressed");
    // No audit row on the already-present branch, as before.
    expect(await auditMetadataFor(email)).toHaveLength(0);
    expectStatusJobs(enqueuedJobs(), contactId, {
      emailStatus: "suppressed",
      changeSource: "api",
    });
  });

  it("a failing emit is logged and the add still succeeds", async () => {
    const email = uniqueEmail("emitFails");
    const contactId = await seedContact(email, "active");
    mockedEmit.mockRejectedValueOnce(new Error("queue down"));

    const res = await call(sessionApp(), "POST", "/v1/suppressions", {
      awsAccountId: ids.awsAccount,
      email,
      reason: "BOUNCE",
    });

    expect(res.status).toBe(200);
    expect(await statusOf(contactId)).toBe("suppressed");
  });
});

describe("bulk add", () => {
  it("N addresses where M contacts change: one emit per request, M jobs per workflow", async () => {
    const changing = [
      uniqueEmail("bulkA"),
      uniqueEmail("bulkB"),
      uniqueEmail("bulkC"),
    ];
    const changingIds = [
      await seedContact(changing[0], "active"),
      await seedContact(changing[1], null),
      await seedContact(changing[2], "soft_bounced"),
    ];
    const unchanged = uniqueEmail("bulkSuppressed");
    await seedContact(unchanged, "suppressed");
    const noContact = uniqueEmail("bulkNoContact");

    const res = await call(keyApp(), "POST", "/v1/suppressions/bulk", {
      entries: [...changing, unchanged, noContact].map((email) => ({
        awsAccountId: ids.awsAccount,
        email,
        reason: "BOUNCE",
      })),
    });

    expect(res.status).toBe(200);
    const results = res.body.results as { success: boolean }[];
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.success)).toBe(true);

    expect(mockedEmit).toHaveBeenCalledTimes(1);
    expect(mockedEmit.mock.calls[0][1]).toHaveLength(changingIds.length);
    expect(mockedBatch).toHaveBeenCalledTimes(1);

    const jobs = enqueuedJobs();
    expect(jobs).toHaveLength(changingIds.length * workflowIds.length);
    for (const workflowId of workflowIds) {
      expect(
        jobs
          .filter((j) => j.workflowId === workflowId)
          .map((j) => j.contactId)
          .sort()
      ).toEqual([...changingIds].sort());
    }
    for (const job of jobs) {
      expect(job.eventData).toMatchObject({
        emailStatus: "suppressed",
        updatedFields: ["emailStatus"],
        changeSource: "api",
      });
    }
  });

  it("a single-entry bulk also emits once, with the same workflow lookups", async () => {
    const email = uniqueEmail("bulkOne");
    const contactId = await seedContact(email, "active");

    const res = await call(sessionApp(), "POST", "/v1/suppressions/bulk", {
      entries: [{ awsAccountId: ids.awsAccount, email, reason: "BOUNCE" }],
    });

    expect(res.status).toBe(200);
    expect(mockedEmit).toHaveBeenCalledTimes(1);
    expectStatusJobs(enqueuedJobs(), contactId, {
      emailStatus: "suppressed",
      changeSource: "user",
    });
  });

  it("a bulk where no contact changes does not emit", async () => {
    const email = uniqueEmail("bulkNone");
    await seedContact(email, "bounced");

    const res = await call(keyApp(), "POST", "/v1/suppressions/bulk", {
      entries: [
        { awsAccountId: ids.awsAccount, email, reason: "BOUNCE" },
        {
          awsAccountId: ids.awsAccount,
          email: uniqueEmail("bulkNoneMissing"),
          reason: "BOUNCE",
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  function removePath(email: string) {
    return `/v1/suppressions/${encodeURIComponent(email)}?awsAccountId=${ids.awsAccount}&confirm=true`;
  }

  it("restoring a suppressed contact emits contact_updated with the restored status", async () => {
    const email = uniqueEmail("remove");
    const contactId = await seedContact(email, "suppressed");
    sesState.store.set(ids.awsAccount, [
      { EmailAddress: email, Reason: "BOUNCE" },
    ]);

    const res = await call(keyApp(), "DELETE", removePath(email));

    expect(res.status).toBe(200);
    expect(await statusOf(contactId)).toBe("active");
    expectStatusJobs(enqueuedJobs(), contactId, {
      emailStatus: "active",
      changeSource: "api",
    });
    const audit = await auditMetadataFor(email);
    expect(audit[0].metadata).toMatchObject({ contactRestored: true });
  });

  it("removing an address whose contact is not suppressed emits nothing", async () => {
    const email = uniqueEmail("removeBounced");
    const contactId = await seedContact(email, "bounced");
    sesState.store.set(ids.awsAccount, [
      { EmailAddress: email, Reason: "BOUNCE" },
    ]);

    const res = await call(sessionApp(), "DELETE", removePath(email));

    expect(res.status).toBe(200);
    expect(await statusOf(contactId)).toBe("bounced");
    expect(mockedBatch).not.toHaveBeenCalled();
    const audit = await auditMetadataFor(email);
    expect(audit[0].metadata).toMatchObject({ contactRestored: false });
  });
});
