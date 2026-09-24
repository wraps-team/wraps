/**
 * SCIM provisioning end to end: an IdP's HTTP requests through the real auth
 * handler, bearer verifier, SCIM plugin, drizzle adapter and database.
 *
 * The other SCIM tests call `verifyScimBearerToken` and `resolveScimUser`
 * directly, so a plugin or schema change that breaks the plugin's own writes
 * (a missing `scim_*` column, a renamed model) passes them all. This file is
 * the one that fails when an IdP can no longer create, read, deactivate or
 * delete a user.
 */

import { db, eq, organization, scimProvider, user } from "@wraps/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashScimToken, mintScimToken } from "../scim-token";

vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));

const PREFIX = "scim-provisioning-db-test";
const BASE = "http://localhost:3000/api/auth/scim/v2";
const token = mintScimToken();
const email = `${PREFIX}-${Date.now()}@example.com`;

const org = {
  id: `${PREFIX}-org`,
  name: "SCIM Provisioning Org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

async function cleanup() {
  await db.delete(user).where(eq(user.email, email));
  await db.delete(scimProvider).where(eq(scimProvider.organizationId, org.id));
  await db.delete(organization).where(eq(organization.id, org.id));
}

describe("SCIM provisioning through the auth handler", () => {
  let auth: typeof import("../index").auth;
  let scimUserId: string;

  function scim(path: string, init: RequestInit = {}) {
    return auth.handler(
      new Request(`${BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/scim+json",
        },
      })
    );
  }

  beforeAll(async () => {
    ({ auth } = await import("../index"));
    await cleanup();
    await db.insert(organization).values(org);
    await db.insert(scimProvider).values({
      id: `${PREFIX}-provider`,
      providerId: `scim-${org.id}`,
      organizationId: org.id,
      scimToken: await hashScimToken(token),
    });
  }, 60_000);

  afterAll(cleanup);

  it("rejects a request without a valid token", async () => {
    const res = await auth.handler(
      new Request(`${BASE}/Users`, {
        headers: { authorization: `Bearer ${mintScimToken()}` },
      })
    );
    expect(res.status).toBe(401);
  });

  it("creates a user", async () => {
    const res = await scim("/Users", {
      method: "POST",
      body: JSON.stringify({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: email,
        name: { givenName: "Scim", familyName: "Provisioned" },
        emails: [{ value: email, primary: true, type: "work" }],
        active: true,
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    scimUserId = body.id;

    const [row] = await db.select().from(user).where(eq(user.email, email));
    expect(row?.email).toBe(email);
  });

  it("reads the user back", async () => {
    const res = await scim(`/Users/${scimUserId}`);
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.userName).toBe(email);
  });

  it("deactivates the user", async () => {
    const res = await scim(`/Users/${scimUserId}`, {
      method: "PATCH",
      body: JSON.stringify({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", path: "active", value: false }],
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.active).toBe(false);
  });

  it("deletes the user", async () => {
    const res = await scim(`/Users/${scimUserId}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const gone = await scim(`/Users/${scimUserId}`);
    expect(gone.status).toBe(404);
  });
});
