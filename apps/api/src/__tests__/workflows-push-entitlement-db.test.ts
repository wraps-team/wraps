/**
 * `wraps email workflows push` and segment triggers (real DB).
 *
 * Segment entry and exit triggers need the segments feature (Pro and up).
 * The push endpoints refuse them below that, create nothing, and leave every
 * other trigger alone. In a batch, one workflow that needs a higher plan
 * refuses the whole batch.
 *
 * File suffix `-db.test.ts` = real test database. WRAPS_LICENSE_KEY is
 * stubbed empty so a licensed self-hosted environment cannot bypass the gate.
 */

import { db, eq, member, organization, user, workflow } from "@wraps/db";
import { count } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  afterAll,
  afterEach,
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

const P = `wf-seg-db-${crypto.randomUUID().slice(0, 8)}`;

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
  name: "Workflow Segment Test User",
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
  planId: "pro" as string | null,
};

function createApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuth }))
    .use(workflowsSyncRoutes);
}

function pushBody(slug: string, triggerType: string) {
  return {
    slug,
    name: slug,
    sourceTs: "",
    sourceHash: "h",
    steps: [],
    transitions: [],
    triggerType,
    ...(triggerType.startsWith("segment_")
      ? { triggerConfig: { segmentId: "seg-1" } }
      : {}),
  };
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

async function workflowCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, org.id));
  return row?.count ?? 0;
}

beforeAll(async () => {
  await db.insert(user).values(testUser).onConflictDoNothing();
  await db.insert(organization).values(org).onConflictDoNothing();
  await db.insert(member).values(testMember).onConflictDoNothing();
});

beforeEach(async () => {
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
  await db.delete(workflow).where(eq(workflow.organizationId, org.id));
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await db.delete(workflow).where(eq(workflow.organizationId, org.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, org.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("POST /v1/workflows/push", () => {
  it.each(["segment_entry", "segment_exit"])(
    "refuses a %s trigger on Free and creates nothing",
    async (trigger) => {
      mockAuth.planId = "free";

      const res = await post("/push", pushBody("seg-wf", trigger));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("plan_required");
      expect(body.message).toMatch(/pro/i);
      expect(await workflowCount()).toBe(0);
    }
  );

  it("refuses a segment trigger when the org has no plan", async () => {
    mockAuth.planId = null;

    const res = await post("/push", pushBody("seg-wf", "segment_entry"));

    expect(res.status).toBe(403);
    expect(await workflowCount()).toBe(0);
  });

  it.each(["pro", "starter", "business", "growth", "scale"])(
    "accepts a segment trigger on the %s plan",
    async (plan) => {
      mockAuth.planId = plan;

      const res = await post("/push", pushBody("seg-wf", "segment_entry"));

      expect(res.status).not.toBe(403);
    }
  );

  it("still accepts every other trigger on Free", async () => {
    mockAuth.planId = "free";

    // Two, not three: Free holds 2 workflows, and a third push is refused by
    // the workflow limit rather than by the trigger gate.
    for (const trigger of ["event", "contact_created"]) {
      const res = await post("/push", pushBody(`wf-${trigger}`, trigger));
      expect(res.status).not.toBe(403);
    }
  });
});

describe("POST /v1/workflows/push/batch", () => {
  it("refuses the whole batch when one workflow needs segmentation", async () => {
    mockAuth.planId = "free";

    const res = await post("/push/batch", {
      workflows: [
        pushBody("plain", "event"),
        pushBody("segmented", "segment_exit"),
      ],
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("plan_required");
    expect(await workflowCount()).toBe(0);
  });

  it("accepts the same batch on Pro", async () => {
    mockAuth.planId = "pro";

    const res = await post("/push/batch", {
      workflows: [
        pushBody("plain", "event"),
        pushBody("segmented", "segment_exit"),
      ],
    });

    expect(res.status).not.toBe(403);
    expect(await workflowCount()).toBe(2);
  });
});
