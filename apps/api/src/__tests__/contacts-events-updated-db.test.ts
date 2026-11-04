/**
 * POST /v1/contacts/events/updated (real DB)
 *
 * The dashboard's hop to contact_updated: its server actions write the
 * contact, then call this with the contacts and the fields that changed. The
 * route is session only (API keys get 403), needs contacts:write, always
 * emits with changeSource "user", drops ids outside the caller's org, merges a
 * repeated id into one event, and answers how many contacts it found. It is
 * hidden from the OpenAPI spec, as is the preference centre's unsubscribe-all.
 *
 * Auth is injected (the pattern every route test here uses), which skips
 * authenticate(); the X-Organization-Id header the dashboard sends is covered
 * by the web helper's test and the auth middleware's own tests.
 *
 * Boundaries mocked: the SQS enqueue and the email sender. `@wraps/db` is the
 * real client.
 */

import { swagger } from "@elysiajs/swagger";
import { contact, db, eq, member, user, workflow } from "@wraps/db";
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
const { preferenceEventsRoutes } = await import("../routes/preference-events");
const { FULL_ACCESS_PERMISSIONS } = await import("../services/api-keys");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");

const TEST_PREFIX = "contacts-events-upd-db";
const READER_USER = `${TEST_PREFIX}-reader`;
const READER_MEMBER = `${TEST_PREFIX}-reader-member`;

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

function sessionAuth(userId = fixture.ids.user) {
  return {
    apiKeyId: null,
    organizationId: fixture.ids.org,
    userId,
    planId: "pro",
  };
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

function report(auth: Record<string, unknown>, body: unknown) {
  return appWith(auth).handle(
    new Request("http://localhost/v1/contacts/events/updated", {
      method: "POST",
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

describe("POST /v1/contacts/events/updated (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    await db
      .update(contact)
      .set({ firstName: "Ada", emailStatus: "active" })
      .where(eq(contact.id, fixture.ids.contact));
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
    // A member whose role can read contacts but not write them.
    await db
      .insert(user)
      .values({
        id: READER_USER,
        email: `${READER_USER}@example.com`,
        name: "Read-only member",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
      } as typeof user.$inferInsert)
      .onConflictDoNothing();
    await db
      .insert(member)
      .values({
        id: READER_MEMBER,
        organizationId: fixture.ids.org,
        userId: READER_USER,
        role: "read-only",
        createdAt: new Date(),
      } as typeof member.$inferInsert)
      .onConflictDoUpdate({ target: member.id, set: { role: "read-only" } });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await db.delete(workflow).where(eq(workflow.id, workflowId));
    await db.delete(member).where(eq(member.id, READER_MEMBER));
    await db.delete(user).where(eq(user.id, READER_USER));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("a session with contacts:write emits contact_updated with changeSource user and answers the count found", async () => {
    const res = await report(sessionAuth(), {
      contacts: [
        { contactId: fixture.ids.contact, updatedFields: ["firstName"] },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1 });
    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].contactId).toBe(fixture.ids.contact);
    expect(jobs[0].eventData).toMatchObject({
      firstName: "Ada",
      emailStatus: "active",
      updatedFields: ["firstName"],
      changeSource: "user",
    });
  });

  it("an API key is refused with 403, even with every scope", async () => {
    const res = await report(keyAuth(), {
      contacts: [
        { contactId: fixture.ids.contact, updatedFields: ["firstName"] },
      ],
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toHaveProperty("error");
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("a member without contacts:write is refused with 403", async () => {
    const res = await report(sessionAuth(READER_USER), {
      contacts: [
        { contactId: fixture.ids.contact, updatedFields: ["firstName"] },
      ],
    });

    expect(res.status).toBe(403);
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("another org's contact is neither emitted for nor counted", async () => {
    const res = await report(sessionAuth(), {
      contacts: [
        { contactId: fixture.ids.contact, updatedFields: ["emailStatus"] },
        { contactId: fixture.ids.otherContact, updatedFields: ["emailStatus"] },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1 });
    const jobs = contactUpdatedJobs();
    expect(jobs.map((job) => job.contactId)).toEqual([fixture.ids.contact]);
  });

  it("only another org's contact: answers 0 and emits nothing", async () => {
    const res = await report(sessionAuth(), {
      contacts: [
        { contactId: fixture.ids.otherContact, updatedFields: ["firstName"] },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 0 });
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("a repeated contact id is one event with the fields merged", async () => {
    const res = await report(sessionAuth(), {
      contacts: [
        { contactId: fixture.ids.contact, updatedFields: ["firstName"] },
        {
          contactId: fixture.ids.contact,
          updatedFields: ["emailStatus", "firstName"],
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1 });
    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].eventData?.updatedFields).toEqual([
      "firstName",
      "emailStatus",
    ]);
  });

  it.each([
    [
      "101 contacts",
      {
        contacts: Array.from({ length: 101 }, (_, i) => ({
          contactId: `${TEST_PREFIX}-many-${i}`,
          updatedFields: ["firstName"],
        })),
      },
    ],
    ["no contacts", { contacts: [] }],
    [
      "an unknown field",
      {
        contacts: [{ contactId: "contact-1", updatedFields: ["updatedAt"] }],
      },
    ],
    [
      "an empty updatedFields",
      { contacts: [{ contactId: "contact-1", updatedFields: [] }] },
    ],
    [
      "11 fields",
      {
        contacts: [
          {
            contactId: "contact-1",
            updatedFields: Array.from({ length: 11 }, () => "firstName"),
          },
        ],
      },
    ],
  ])("%s is rejected with a 4xx", async (_name, body) => {
    const res = await report(sessionAuth(), body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("neither new route appears in the OpenAPI spec", async () => {
    const specApp = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(contactsRoutes)
      .use(preferenceEventsRoutes);

    const res = await specApp.handle(
      new Request("http://localhost/swagger/json")
    );

    expect(res.status).toBe(200);
    const spec = (await res.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);
    // The spec is real: the routes around the new ones are listed.
    expect(paths).toContain("/v1/contacts/");
    expect(paths).toContain("/v1/preference-events/");
    expect(paths).not.toContain("/v1/contacts/events/updated");
    expect(paths).not.toContain("/v1/preference-events/unsubscribe-all");
  });
});
