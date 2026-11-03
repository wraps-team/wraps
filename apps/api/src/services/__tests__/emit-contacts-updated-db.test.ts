/**
 * emitContactsUpdated (real DB)
 *
 * The batch contact_updated emitter behind every API-side email-status change
 * (suppressions, SES webhooks, the unsubscribe link). It reads the stored
 * contacts itself, matches both workflow trigger forms, writes contact_event
 * rows whether or not a workflow matches, and enqueues once.
 *
 * Boundary mock: ONLY `../workflow-queue` (the SQS boundary). `@wraps/db` is
 * the real client; `findContactsByIdsInOrg` is wrapped around its real
 * implementation so one test can delete a contact between the lookup and the
 * event insert.
 */

import { and, contact, contactEvent, db, eq, workflow } from "@wraps/db";
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

vi.mock("../workflow-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workflow-queue")>();
  return {
    ...actual,
    enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
    enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
    deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@wraps/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/db")>();
  return {
    ...actual,
    findContactsByIdsInOrg: vi.fn(actual.findContactsByIdsInOrg),
  };
});

import { findContactsByIdsInOrg } from "@wraps/db";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  seedBaseOrg,
  workflowRow,
} from "../../(ee)/__tests__/fixtures/real-db";
import { emitContactsUpdated } from "../workflow-events";
import { enqueueWorkflowStepBatch, type WorkflowJob } from "../workflow-queue";

const TEST_PREFIX = "emit-contacts-upd-db";
const EXTRA_COUNT = 5;

let fixture: BaseOrgFixture;
let extraIds: string[] = [];

const mockedBatch = vi.mocked(enqueueWorkflowStepBatch);

function enqueuedJobs(): Extract<WorkflowJob, { type: "trigger" }>[] {
  return mockedBatch.mock.calls.flatMap(
    ([jobs]) => jobs as Extract<WorkflowJob, { type: "trigger" }>[]
  );
}

/** The two match forms of a contact_updated workflow, plus a paused one and an unrelated one. */
async function seedContactUpdatedWorkflows(orgId: string): Promise<string[]> {
  const ids = fixture.ids;
  const eventForm = `${orgId}-wf-cu-event`;
  const triggerForm = `${orgId}-wf-cu-trigger`;
  await db.insert(workflow).values([
    workflowRow(ids, {
      id: eventForm,
      organizationId: orgId,
      triggerType: "event",
      triggerConfig: { eventName: "contact_updated" },
    }),
    workflowRow(ids, {
      id: triggerForm,
      organizationId: orgId,
      triggerType: "contact_updated",
      triggerConfig: {},
    }),
    workflowRow(ids, {
      id: `${orgId}-wf-cu-paused`,
      organizationId: orgId,
      status: "paused",
      triggerType: "contact_updated",
      triggerConfig: {},
    }),
    workflowRow(ids, {
      id: `${orgId}-wf-other-event`,
      organizationId: orgId,
      triggerType: "event",
      triggerConfig: { eventName: "contact_created" },
    }),
  ]);
  return [eventForm, triggerForm];
}

async function contactUpdatedEventsFor(contactIds: string[]) {
  return db
    .select({
      contactId: contactEvent.contactId,
      eventData: contactEvent.eventData,
    })
    .from(contactEvent)
    .where(
      and(
        inArray(contactEvent.contactId, contactIds),
        eq(contactEvent.eventName, "contact_updated")
      )
    );
}

async function seedExtraContacts(): Promise<string[]> {
  const now = new Date();
  const ids = Array.from(
    { length: EXTRA_COUNT },
    (_, i) => `${TEST_PREFIX}-extra-${i}`
  );
  await db
    .insert(contact)
    .values(
      ids.map(
        (id, i) =>
          ({
            id,
            organizationId: fixture.ids.org,
            email: `${TEST_PREFIX}-extra-${i}@example.com`,
            emailHash: `${TEST_PREFIX}-extra-hash-${i}`,
            emailStatus: "suppressed",
            status: "active",
            createdAt: now,
            updatedAt: now,
          }) as typeof contact.$inferInsert
      )
    )
    .onConflictDoNothing();
  return ids;
}

describe("emitContactsUpdated (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    extraIds = await seedExtraContacts();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    await db
      .delete(workflow)
      .where(
        inArray(workflow.organizationId, [
          fixture.ids.org,
          fixture.ids.otherOrg,
        ])
      );
    await db
      .delete(contactEvent)
      .where(
        inArray(contactEvent.organizationId, [
          fixture.ids.org,
          fixture.ids.otherOrg,
        ])
      );
    // A test below deletes one extra contact; put it back.
    extraIds = await seedExtraContacts();
  });

  afterAll(async () => {
    await db
      .delete(contactEvent)
      .where(
        inArray(contactEvent.organizationId, [
          fixture.ids.org,
          fixture.ids.otherOrg,
        ])
      );
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("enqueues one job per enabled workflow of either match form, with data read from the stored contact", async () => {
    const workflowIds = await seedContactUpdatedWorkflows(fixture.ids.org);
    await db
      .update(contact)
      .set({ emailStatus: "suppressed", company: "Acme" })
      .where(eq(contact.id, fixture.ids.contact));

    const result = await emitContactsUpdated(fixture.ids.org, [
      {
        contactId: fixture.ids.contact,
        updatedFields: ["emailStatus"],
        changeSource: "api",
      },
    ]);

    expect(result.workflowsTriggered).toBe(2);
    expect(mockedBatch).toHaveBeenCalledTimes(1);
    const jobs = enqueuedJobs();
    expect(jobs.map((j) => j.workflowId).sort()).toEqual(workflowIds.sort());
    for (const job of jobs) {
      expect(job).toMatchObject({
        type: "trigger",
        contactId: fixture.ids.contact,
        organizationId: fixture.ids.org,
      });
      expect(job.eventData).toMatchObject({
        email: `${TEST_PREFIX}-c1@example.com`,
        firstName: "Alice",
        lastName: "Test",
        company: "Acme",
        emailStatus: "suppressed",
        updatedFields: ["emailStatus"],
        changeSource: "api",
      });
      expect(typeof job.eventData?.updatedAt).toBe("string");
    }

    await db
      .update(contact)
      .set({ emailStatus: "active", company: null })
      .where(eq(contact.id, fixture.ids.contact));
  });

  it("another org's contact_updated workflows (both forms) get no job, and its contact ids are dropped", async () => {
    await seedContactUpdatedWorkflows(fixture.ids.otherOrg);

    const result = await emitContactsUpdated(fixture.ids.org, [
      {
        contactId: fixture.ids.contact,
        updatedFields: ["emailStatus"],
        changeSource: "bounce",
      },
      // Belongs to otherOrg: never loaded under org, so never emitted.
      {
        contactId: fixture.ids.otherContact,
        updatedFields: ["emailStatus"],
        changeSource: "bounce",
      },
    ]);

    expect(result.workflowsTriggered).toBe(0);
    expect(mockedBatch).not.toHaveBeenCalled();
    const rows = await contactUpdatedEventsFor([
      fixture.ids.contact,
      fixture.ids.otherContact,
    ]);
    expect(rows.map((r) => r.contactId)).toEqual([fixture.ids.contact]);
  });

  it("writes contact_event rows when no workflow matches", async () => {
    const result = await emitContactsUpdated(
      fixture.ids.org,
      extraIds.map((contactId) => ({
        contactId,
        updatedFields: ["emailStatus"],
        changeSource: "ses_suppression" as const,
      }))
    );

    expect(result.workflowsTriggered).toBe(0);
    expect(mockedBatch).not.toHaveBeenCalled();
    const rows = await contactUpdatedEventsFor(extraIds);
    expect(rows.map((r) => r.contactId).sort()).toEqual([...extraIds].sort());
    for (const row of rows) {
      expect(row.eventData).toMatchObject({
        emailStatus: "suppressed",
        updatedFields: ["emailStatus"],
        changeSource: "ses_suppression",
      });
    }
  });

  it("a contact deleted between the lookup and the event insert does not drop the others' rows", async () => {
    const [victim, ...survivors] = extraIds;
    const actual =
      await vi.importActual<typeof import("@wraps/db")>("@wraps/db");
    vi.mocked(findContactsByIdsInOrg).mockImplementationOnce(
      async (...args) => {
        const rows = await actual.findContactsByIdsInOrg(...args);
        await db.delete(contact).where(eq(contact.id, victim));
        return rows;
      }
    );

    await emitContactsUpdated(
      fixture.ids.org,
      extraIds.map((contactId) => ({
        contactId,
        updatedFields: ["emailStatus"],
        changeSource: "api" as const,
      }))
    );

    const rows = await contactUpdatedEventsFor(extraIds);
    expect(rows.map((r) => r.contactId).sort()).toEqual([...survivors].sort());
  });

  it("runs the same number of lookups for 1 contact and for 5, and enqueues once with N jobs per workflow", async () => {
    const workflowIds = await seedContactUpdatedWorkflows(fixture.ids.org);

    const selectSpy = vi.spyOn(db, "select");
    await emitContactsUpdated(fixture.ids.org, [
      {
        contactId: extraIds[0],
        updatedFields: ["emailStatus"],
        changeSource: "api",
      },
    ]);
    const selectsForOne = selectSpy.mock.calls.length;
    expect(enqueuedJobs()).toHaveLength(workflowIds.length);

    selectSpy.mockClear();
    mockedBatch.mockClear();
    await emitContactsUpdated(
      fixture.ids.org,
      extraIds.map((contactId) => ({
        contactId,
        updatedFields: ["emailStatus"],
        changeSource: "api" as const,
      }))
    );
    const selectsForFive = selectSpy.mock.calls.length;

    // One contact lookup plus one query per match form.
    expect(selectsForOne).toBe(3);
    expect(selectsForFive).toBe(selectsForOne);
    expect(mockedBatch).toHaveBeenCalledTimes(1);
    const jobs = enqueuedJobs();
    expect(jobs).toHaveLength(EXTRA_COUNT * workflowIds.length);
    for (const workflowId of workflowIds) {
      expect(
        jobs
          .filter((j) => j.workflowId === workflowId)
          .map((j) => j.contactId)
          .sort()
      ).toEqual([...extraIds].sort());
    }
  });

  it("does nothing for an empty batch", async () => {
    const selectSpy = vi.spyOn(db, "select");
    const result = await emitContactsUpdated(fixture.ids.org, []);
    expect(result.workflowsTriggered).toBe(0);
    expect(selectSpy).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });
});
