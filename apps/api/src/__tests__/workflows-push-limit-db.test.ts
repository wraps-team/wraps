/**
 * Workflow push plan-limit tests (real DB)
 *
 * `wraps email workflows push` used to insert workflows with no plan check, so
 * a Free org could exceed the 2-workflow limit the dashboard enforces. These
 * tests pin: new slugs are refused past the limit, updates to existing slugs
 * are not, a batch is all-or-nothing, and paid plans are unlimited.
 *
 * File suffix `-db.test.ts` = real Neon test branch.
 */

import { db, eq, member, organization, user, workflow } from "@wraps/db";
import { count } from "drizzle-orm";
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

import { workflowsSyncRoutes } from "../(ee)/routes/workflows-sync";

vi.mock("../lib/activation-tracking", () => ({
  trackFirstResourceCreated: vi.fn(),
}));

const P = `wf-limit-db-${crypto.randomUUID().slice(0, 8)}`;

const org = {
  id: `${P}-org`,
  name: `${P} Org`,
  slug: `${P}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testUser = {
  id: `${P}-user`,
  email: `${P}@example.com`,
  name: "Workflow Limit Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMember = {
  id: `${P}-member`,
  organizationId: org.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const mockAuth = {
  apiKeyId: `${P}-key`,
  organizationId: org.id,
  userId: testUser.id,
  planId: "free" as string | null,
};

function createApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuth }))
    .use(workflowsSyncRoutes);
}

function pushBody(slug: string) {
  return {
    slug,
    name: slug,
    sourceTs: "",
    sourceHash: "h",
    steps: [],
    transitions: [],
    triggerType: "event",
  };
}

async function seedWorkflow(slug: string) {
  await db.insert(workflow).values({
    organizationId: org.id,
    name: slug,
    slug,
    status: "draft",
    triggerType: "event",
  });
}

async function workflowCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, org.id));
  return row?.count ?? 0;
}

function post(path: string, body: unknown) {
  return createApp().handle(
    new Request(`http://localhost/v1/workflows${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(org)
    .onConflictDoUpdate({ target: organization.id, set: { name: org.name } });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
});

beforeEach(async () => {
  await db.delete(workflow).where(eq(workflow.organizationId, org.id));
  mockAuth.planId = "free";
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.delete(workflow).where(eq(workflow.organizationId, org.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, org.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("POST /v1/workflows/push plan limit", () => {
  it("refuses a new slug when a free org already has 2 workflows", async () => {
    await seedWorkflow(`${P}-a`);
    await seedWorkflow(`${P}-b`);

    const res = await post("/push", pushBody(`${P}-new`));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("workflow_limit");
    expect(await workflowCount()).toBe(2);
  });

  it("still updates an existing slug when a free org is at the limit", async () => {
    await seedWorkflow(`${P}-a`);
    await seedWorkflow(`${P}-b`);

    const res = await post("/push", pushBody(`${P}-a`));

    expect(res.status).toBe(200);
    expect(await workflowCount()).toBe(2);
  });

  it("allows reaching the limit", async () => {
    await seedWorkflow(`${P}-a`);

    const res = await post("/push", pushBody(`${P}-new`));

    expect(res.status).toBe(201);
    expect(await workflowCount()).toBe(2);
  });

  it("writes nothing when a batch would exceed the limit", async () => {
    await seedWorkflow(`${P}-a`);

    const res = await post("/push/batch", {
      workflows: [pushBody(`${P}-x`), pushBody(`${P}-y`)],
    });

    expect(res.status).toBe(403);
    expect(await workflowCount()).toBe(1);
  });

  it("does not limit a pro org", async () => {
    mockAuth.planId = "pro";
    await seedWorkflow(`${P}-a`);
    await seedWorkflow(`${P}-b`);

    const res = await post("/push", pushBody(`${P}-new`));

    expect(res.status).toBe(201);
  });
});
