import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  claimIdentityRefresh,
  upsertSnapshotIdentity,
  writeIdentitySnapshot,
} from "../repositories/aws-account-identities";
import { awsAccount, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);

const orgA = `repo-ident-org-a-${suffix}`;
const orgB = `repo-ident-org-b-${suffix}`;
const acct = (n: number) => `repo-ident-acct-${n}-${suffix}`;

const domain = (identity: string, configSetName = "wraps-email-x") => ({
  identity,
  type: "DOMAIN" as const,
  configSetName,
});

async function seed(
  n: number,
  features: (typeof awsAccount.$inferInsert)["features"]
) {
  await db
    .insert(awsAccount)
    .values({
      id: acct(n),
      organizationId: orgA,
      name: `Ident Test Account ${n}`,
      accountId: `33333333333${n}`.slice(0, 12),
      region: "us-east-1",
      roleArn: `arn:aws:iam::333333333333:role/ident-test-${n}`,
      externalId: `ident-ext-${n}-${suffix}`,
      features,
    })
    .onConflictDoNothing();
}

async function read(n: number) {
  const [row] = await db
    .select()
    .from(awsAccount)
    .where(eq(awsAccount.id, acct(n)));
  if (!row) {
    throw new Error("row missing");
  }
  return row;
}

describe("Repository: aws-account-identities", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: orgA,
          name: "Ident Org A",
          slug: `ident-a-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: "Ident Org B",
          slug: `ident-b-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await db.delete(awsAccount).where(eq(awsAccount.id, acct(n)));
    }
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
  });

  it("writeIdentitySnapshot preserves unrelated features keys", async () => {
    const sms = { enabled: true, phoneNumbers: [] };
    await seed(1, {
      email: { sandbox: true, archivingEnabled: true, identities: [] },
      sms,
    });

    await writeIdentitySnapshot({
      organizationId: orgA,
      awsAccountId: acct(1),
      identities: [domain("a.example.com")],
    });

    const row = await read(1);
    expect(row.features?.sms).toEqual(sms);
    expect(row.features?.email?.sandbox).toBe(true);
    expect(row.features?.email?.archivingEnabled).toBe(true);
    expect(row.features?.email?.identities).toEqual([domain("a.example.com")]);
    expect(row.emailEnabled).toBe(true);
    expect(row.identitiesScannedAt).not.toBeNull();
  });

  it("writeIdentitySnapshot handles null features", async () => {
    await seed(2, null);
    await writeIdentitySnapshot({
      organizationId: orgA,
      awsAccountId: acct(2),
      identities: [domain("b.example.com")],
    });
    const row = await read(2);
    expect(row.features).toEqual({
      email: { identities: [domain("b.example.com")] },
    });
  });

  it("writeIdentitySnapshot with the wrong organizationId changes nothing", async () => {
    await seed(3, { email: { identities: [] } });
    await writeIdentitySnapshot({
      organizationId: orgB,
      awsAccountId: acct(3),
      identities: [domain("c.example.com")],
    });
    const row = await read(3);
    expect(row.features).toEqual({ email: { identities: [] } });
    expect(row.identitiesScannedAt).toBeNull();
  });

  it("upsertSnapshotIdentity appends without duplicating and replaces by identity", async () => {
    await seed(4, {
      email: { identities: [domain("one.example.com")] },
      sms: { enabled: false, phoneNumbers: [] },
    });

    await upsertSnapshotIdentity({
      organizationId: orgA,
      awsAccountId: acct(4),
      identity: domain("two.example.com"),
    });
    await upsertSnapshotIdentity({
      organizationId: orgA,
      awsAccountId: acct(4),
      identity: domain("two.example.com"),
    });
    let row = await read(4);
    expect(row.features?.email?.identities).toEqual([
      domain("one.example.com"),
      domain("two.example.com"),
    ]);
    expect(row.features?.sms).toEqual({ enabled: false, phoneNumbers: [] });
    expect(row.identitiesScannedAt).toBeNull();

    await upsertSnapshotIdentity({
      organizationId: orgA,
      awsAccountId: acct(4),
      identity: domain("two.example.com", "wraps-email-y"),
    });
    row = await read(4);
    expect(row.features?.email?.identities).toEqual([
      domain("one.example.com"),
      domain("two.example.com", "wraps-email-y"),
    ]);
  });

  it("claimIdentityRefresh honours the cooldown and org scope", async () => {
    await seed(5, null);
    const base = {
      organizationId: orgA,
      awsAccountId: acct(5),
      cooldownMs: 60_000,
    };
    const t0 = new Date("2026-01-01T00:00:00Z");

    expect(await claimIdentityRefresh({ ...base, now: t0 })).toBe(true);
    expect(
      await claimIdentityRefresh({
        ...base,
        now: new Date(t0.getTime() + 1000),
      })
    ).toBe(false);
    expect(
      await claimIdentityRefresh({
        ...base,
        now: new Date(t0.getTime() + 61_000),
      })
    ).toBe(true);
    expect(await claimIdentityRefresh({ ...base, organizationId: orgB })).toBe(
      false
    );
  });
});
