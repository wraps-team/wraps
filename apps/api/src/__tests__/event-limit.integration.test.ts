/**
 * Event Limit Enforcement — Integration Tests
 *
 * Runs against REAL SST dev resources:
 * - Real database (apps/web/.env.local)
 * - Real API Lambda (SST dev)
 * - Real HTTP via fetch()
 *
 * Prerequisites:
 * 1. Run `pnpm sst:dev` in another terminal
 * 2. Run `pnpm --filter @wraps/api test:integration`
 *
 * Validates that a free-plan organization is gated out of event ingestion by
 * planGateMiddleware. Volume no longer blocks anything on any plan — see
 * event-limit.test.ts for that coverage, which has an injectable auth context.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  apiKey,
  contact,
  db,
  eq,
  eventUsageMonthly,
  member,
  organization,
  user,
} from "@wraps/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// -----------------------------------------------------------------------------
// SST output loading
// -----------------------------------------------------------------------------

type SstOutputs = { apiUrl: string };

function loadSstOutputs(): SstOutputs {
  const outputsPath = resolve(process.cwd(), "../../.sst/outputs.json");
  if (!existsSync(outputsPath)) {
    throw new Error(
      `SST outputs not found at ${outputsPath}. Run "pnpm sst:dev" first.`
    );
  }
  const outputs = JSON.parse(readFileSync(outputsPath, "utf-8"));
  if (!outputs.apiUrl) {
    throw new Error("apiUrl not found in SST outputs. Is SST dev running?");
  }
  return outputs as SstOutputs;
}

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const TEST_PREFIX = "int-event-limit-test";
const RAW_API_KEY = `wraps_live_${TEST_PREFIX}_key`;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Event Limit Integration User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Event Limit Integration Org",
  slug: `${TEST_PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${TEST_PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testApiKey = {
  id: `${TEST_PREFIX}-apikey-1`,
  organizationId: testOrg.id,
  name: "Event Limit Integration Key",
  keyHash: hashKey(RAW_API_KEY),
  prefix: "wraps_live",
  permissions: [] as string[],
  expiresAt: null,
  createdBy: testUser.id,
  createdAt: new Date(),
};

const testContact = {
  id: `${TEST_PREFIX}-contact-1`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-contact@example.com`,
  emailHash: `${TEST_PREFIX}-contact-hash`,
  firstName: "Limit",
  lastName: "Test",
  emailStatus: "active" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PERIOD_KEY = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
const FREE_LIMIT = 5000;
const FREE_GRACE = Math.floor(FREE_LIMIT * 1.25); // 6250

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function seedUsage(count: number) {
  await db
    .insert(eventUsageMonthly)
    .values({
      organizationId: testOrg.id,
      periodKey: PERIOD_KEY,
      eventCount: count,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [eventUsageMonthly.organizationId, eventUsageMonthly.periodKey],
      set: { eventCount: count, updatedAt: new Date() },
    });
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe.skipIf(!existsSync(resolve(process.cwd(), "../../.sst/outputs.json")))(
  "free plan is gated out of event ingestion (real Lambda, real DB)",
  () => {
    let apiUrl: string;

    function postEvent(): Promise<Response> {
      return fetch(`${apiUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RAW_API_KEY}`,
        },
        body: JSON.stringify({
          name: "test.limit.event",
          contactId: testContact.id,
        }),
      });
    }

    beforeAll(async () => {
      ({ apiUrl } = loadSstOutputs());

      await db
        .insert(user)
        .values(testUser)
        .onConflictDoUpdate({
          target: user.id,
          set: { updatedAt: new Date() },
        });
      await db
        .insert(organization)
        .values(testOrg)
        .onConflictDoUpdate({
          target: organization.id,
          set: { name: testOrg.name },
        });
      await db
        .insert(member)
        .values(testMember)
        .onConflictDoUpdate({
          target: member.id,
          set: { role: testMember.role },
        });
      await db
        .insert(apiKey)
        .values(testApiKey)
        .onConflictDoUpdate({
          target: apiKey.id,
          set: { keyHash: testApiKey.keyHash },
        });
      await db
        .insert(contact)
        .values(testContact)
        .onConflictDoUpdate({
          target: contact.id,
          set: { updatedAt: new Date() },
        });
    });

    afterAll(async () => {
      // org cascade deletes: eventUsageMonthly, contact, member, apiKey
      await db.delete(organization).where(eq(organization.id, testOrg.id));
      await db.delete(user).where(eq(user.id, testUser.id));
    });

    beforeEach(async () => {
      await db
        .delete(eventUsageMonthly)
        .where(eq(eventUsageMonthly.organizationId, testOrg.id));
    });

    // Volume behaviour (no cap on paid plans) is covered in event-limit.test.ts,
    // where the auth context is injectable. This file's fixture org has no
    // subscription row, so it can only ever exercise the free-plan gate.

    it("returns 403 with zero prior usage", async () => {
      const res = await postEvent();
      expect(res.status).toBe(403);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      const body = await res.json();
      expect(body.error).toMatch(/requires starter plan/i);
    });

    it("returns 403 with usage under the former free limit (2500)", async () => {
      await seedUsage(2500);
      const res = await postEvent();
      expect(res.status).toBe(403);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
    });

    it("returns 403 one below the former grace limit (6249)", async () => {
      await seedUsage(FREE_GRACE - 1);
      const res = await postEvent();
      expect(res.status).toBe(403);
    });

    it("returns 403 at the former grace limit (6250)", async () => {
      await seedUsage(FREE_GRACE);
      const res = await postEvent();
      expect(res.status).toBe(403);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      expect(res.headers.get("Retry-After")).toBeNull();
      const body = await res.json();
      expect(body.error).toMatch(/requires starter plan/i);
    });

    it("returns 403 well over the former limit (Darren's 8259 scenario)", async () => {
      await seedUsage(8259);
      const res = await postEvent();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/requires starter plan/i);
    });
  }
);
