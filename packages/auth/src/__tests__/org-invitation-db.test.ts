/**
 * Organization create + invite through the real organization plugin and
 * database. better-auth 1.7 writes `invitation.createdAt`, which the table did
 * not have, so the plugin's own invitation endpoints threw inside the adapter.
 * The dashboard's inviteMember inserts with raw Drizzle and was unaffected;
 * this guards the plugin path any client call or future refactor goes through.
 */

import { db, invitation, organization, user } from "@wraps/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));

const PREFIX = "org-invitation-db-test";
const stamp = Date.now();
const ownerEmail = `${PREFIX}-owner-${stamp}@example.com`;
const inviteeEmail = `${PREFIX}-invitee-${stamp}@example.com`;
const slug = `${PREFIX}-${stamp}`;

// `betterAuth<BetterAuthOptions>` erases plugin endpoint types from `auth.api`.
type OrgApi = {
  createOrganization(input: {
    body: { name: string; slug: string };
    headers: Headers;
  }): Promise<{ id: string; slug: string } | null>;
  createInvitation(input: {
    body: { email: string; role: string; organizationId?: string };
    headers: Headers;
  }): Promise<{ email: string }>;
};

async function cleanup() {
  await db.delete(organization).where(like(organization.slug, `${PREFIX}-%`));
  await db.delete(user).where(like(user.email, `${PREFIX}-%`));
}

describe("organization invitations", () => {
  let auth: typeof import("../index").auth;
  let api: OrgApi;
  let headers: Headers;

  beforeAll(async () => {
    ({ auth } = await import("../index"));
    api = auth.api as unknown as OrgApi;
    await cleanup();
    const { token } = await auth.api.signUpEmail({
      body: {
        email: ownerEmail,
        password: "a-long-unbreached-test-passphrase-7d1e",
        name: "Invite Owner",
      },
    });
    headers = new Headers({ authorization: `Bearer ${token}` });
  }, 60_000);

  afterAll(cleanup);

  it("creates an organization and invites a member", async () => {
    const org = await api.createOrganization({
      body: { name: "Invite Test Org", slug },
      headers,
    });
    expect(org?.slug).toBe(slug);

    const invite = await api.createInvitation({
      body: { email: inviteeEmail, role: "member", organizationId: org?.id },
      headers,
    });
    expect(invite.email).toBe(inviteeEmail);

    const [row] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.email, inviteeEmail));
    expect(row?.status).toBe("pending");
  });
});
