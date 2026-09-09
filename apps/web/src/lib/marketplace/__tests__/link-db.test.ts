/**
 * Linking an AWS Marketplace subscription to a new organization (real DB).
 *
 * Linking is proof-of-possession only: the registration cookie, or a subscription
 * id already verified from a signed email token. Matching on the contact address
 * was removed deliberately — whoever subscribes types that address in, so they
 * could enter a stranger's and have that stranger's signup attach an agreement
 * they never bought.
 */

import { db, organization } from "@wraps/db";
import { awsMarketplaceSubscription } from "@wraps/db/schema/aws-marketplace";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { linkMarketplaceSubscription } from "../aws";

const PREFIX = "awsmp-link-db";
const ORG_A = `${PREFIX}-org-a`;
const ORG_B = `${PREFIX}-org-b`;
const EMAIL = `${PREFIX}@example.com`;

async function seedSubscription(overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(awsMarketplaceSubscription)
    .values({
      licenseArn: `arn:aws:license-manager::999:license/${PREFIX}-${crypto.randomUUID()}`,
      customerAwsAccountId: "999999999999",
      productCode: `${PREFIX}-prod`,
      contactEmail: EMAIL,
      status: "active",
      ...overrides,
    })
    .returning();
  return row;
}

async function cleanup() {
  await db
    .delete(awsMarketplaceSubscription)
    .where(eq(awsMarketplaceSubscription.productCode, `${PREFIX}-prod`));
  await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
}

beforeEach(async () => {
  await cleanup();
  await db.insert(organization).values([
    { id: ORG_A, name: "Org A", slug: `${PREFIX}-a`, createdAt: new Date() },
    { id: ORG_B, name: "Org B", slug: `${PREFIX}-b`, createdAt: new Date() },
  ]);
});

afterAll(cleanup);

describe("linkMarketplaceSubscription", () => {
  it("links via the registration cookie", async () => {
    const row = await seedSubscription();

    const linked = await linkMarketplaceSubscription({
      organizationId: ORG_A,
      cookieRef: row?.id ?? null,
    });

    expect(linked).toBe(row?.id);

    const [after] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.id, row?.id ?? ""));
    expect(after?.organizationId).toBe(ORG_A);
  });

  it("links via a verified link token when there is no cookie", async () => {
    const row = await seedSubscription();

    const linked = await linkMarketplaceSubscription({
      organizationId: ORG_A,
      cookieRef: null,
      linkTokenSubscriptionId: row?.id ?? null,
    });

    expect(linked).toBe(row?.id);
  });

  it("does not link on a contact-address match alone", async () => {
    // The address is attacker-controlled at registration, so it is not proof
    // of anything. Only the cookie or a signed token attaches a subscription.
    await seedSubscription({ contactEmail: EMAIL });

    const linked = await linkMarketplaceSubscription({
      organizationId: ORG_A,
      cookieRef: null,
      linkTokenSubscriptionId: null,
    });

    expect(linked).toBeNull();
  });

  it("never moves a subscription that is already attached", async () => {
    const row = await seedSubscription({ organizationId: ORG_B });

    const linked = await linkMarketplaceSubscription({
      organizationId: ORG_A,
      cookieRef: row?.id ?? null,
    });

    expect(linked).toBeNull();

    const [after] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.id, row?.id ?? ""));
    expect(after?.organizationId).toBe(ORG_B);
  });

  it("links at most once when two signups race the same cookie", async () => {
    const row = await seedSubscription();

    const [first, second] = await Promise.all([
      linkMarketplaceSubscription({
        organizationId: ORG_A,
        cookieRef: row?.id ?? null,
      }),
      linkMarketplaceSubscription({
        organizationId: ORG_B,
        cookieRef: row?.id ?? null,
      }),
    ]);

    // The conditional UPDATE means exactly one wins.
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("returns null when there is nothing to link", async () => {
    const linked = await linkMarketplaceSubscription({
      organizationId: ORG_A,
      cookieRef: null,
      linkTokenSubscriptionId: null,
    });

    expect(linked).toBeNull();
  });
});
