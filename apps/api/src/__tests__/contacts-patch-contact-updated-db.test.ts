/**
 * PATCH /v1/contacts/:id contact_updated payload (real DB)
 *
 * PATCH keeps emitting contact_updated as before, now with the contact's
 * `emailStatus` in the event data and `changeSource` "api" for an API key or
 * "user" for a signed-in session (keys carry a userId too).
 *
 * Boundaries mocked: the SQS enqueue and the email sender. `@wraps/db` is the
 * real client.
 */

import { contact, db, eq, workflow } from "@wraps/db";
import { Elysia } from "elysia";
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
  type BaseOrgFixture,
  cleanupBaseOrg,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(true),
}));

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

const { contactsRoutes } = await import("../routes/contacts");
const { FULL_ACCESS_PERMISSIONS } = await import("../services/api-keys");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");

const TEST_PREFIX = "contacts-patch-cu-db";
// PATCH resolves a non-UUID id as an externalId, so this contact needs a UUID.
const CONTACT_ID = crypto.randomUUID();

type TriggerJob = {
  workflowId: string;
  contactId: string;
  eventData?: Record<string, unknown>;
};

const mockedBatch = vi.mocked(enqueueWorkflowStepBatch);

let fixture: BaseOrgFixture;
let workflowId: string;

function appWith(auth: Record<string, unknown>) {
  return new Elysia().derive(() => ({ auth })).use(contactsRoutes);
}

function keyAuth() {
  return {
    apiKeyId: `${TEST_PREFIX}-key`,
    organizationId: fixture.ids.org,
    userId: fixture.ids.user,
    planId: "pro",
    apiKeyScopes: [...FULL_ACCESS_PERMISSIONS],
  };
}

function sessionAuth() {
  return {
    apiKeyId: null,
    organizationId: fixture.ids.org,
    userId: fixture.ids.user,
    planId: "pro",
  };
}

async function patch(auth: Record<string, unknown>, body: unknown) {
  return appWith(auth).handle(
    new Request(`http://localhost/v1/contacts/${CONTACT_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function contactUpdatedJobs(): TriggerJob[] {
  return mockedBatch.mock.calls
    .flatMap(([jobs]) => jobs as TriggerJob[])
    .filter((job) => job.workflowId === workflowId);
}

describe("PATCH /v1/contacts/:id contact_updated (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    await db.insert(contact).values({
      id: CONTACT_ID,
      organizationId: fixture.ids.org,
      email: `${TEST_PREFIX}-patch@example.com`,
      emailHash: `${TEST_PREFIX}-patch-hash`,
      firstName: "Pat",
      emailStatus: "active",
      status: "active",
    } as typeof contact.$inferInsert);
    workflowId = `${TEST_PREFIX}-wf-cu`;
    await db
      .insert(workflow)
      .values(
        workflowRow(fixture.ids, {
          id: workflowId,
          triggerType: "contact_updated",
          triggerConfig: {},
        })
      )
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db
      .update(contact)
      .set({ emailStatus: "active" })
      .where(eq(contact.id, CONTACT_ID));
  });

  afterAll(async () => {
    await db.delete(workflow).where(eq(workflow.id, workflowId));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("an API key PATCH carries changeSource api and the stored emailStatus", async () => {
    const res = await patch(keyAuth(), { emailStatus: "unsubscribed" });

    expect(res.status).toBe(200);
    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].contactId).toBe(CONTACT_ID);
    expect(jobs[0].eventData).toMatchObject({
      emailStatus: "unsubscribed",
      updatedFields: ["emailStatus"],
      changeSource: "api",
    });
  });

  it("a session PATCH carries changeSource user, and emailStatus even when it did not change", async () => {
    const res = await patch(sessionAuth(), { firstName: "Renamed" });

    expect(res.status).toBe(200);
    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].eventData).toMatchObject({
      firstName: "Renamed",
      emailStatus: "active",
      updatedFields: ["firstName"],
      changeSource: "user",
    });
  });
});
