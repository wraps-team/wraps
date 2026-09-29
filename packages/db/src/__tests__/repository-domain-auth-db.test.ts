import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  type DomainAuthObservation,
  recordDomainAuthCheck,
} from "../repositories/domain-auth";
import { awsAccount, domainAuthCheck, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);

const orgA = `repo-dac-org-a-${suffix}`;
const orgB = `repo-dac-org-b-${suffix}`;
const acctA = `repo-dac-acct-a-${suffix}`;
const acctB = `repo-dac-acct-b-${suffix}`;

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-02T00:00:00Z");
const T2 = new Date("2026-01-03T00:00:00Z");
const T3 = new Date("2026-01-04T00:00:00Z");

// Each test uses its own identity/record so cases never share a row.
let n = 0;
function record(status: DomainAuthObservation["status"], name: string) {
  return {
    recordKind: "dkim" as const,
    recordName: name,
    status,
    found: status === "verified" ? ["tok.dkim.amazonses.com"] : [],
  };
}
function freshName() {
  n += 1;
  return `tok${n}-${suffix}._domainkey.example.com`;
}

async function check(
  observation: DomainAuthObservation,
  now: Date,
  ids = { organizationId: orgA, awsAccountId: acctA }
) {
  const [state] = await recordDomainAuthCheck({
    ...ids,
    identity: "example.com",
    observations: [observation],
    now,
  });
  if (!state) {
    throw new Error("recordDomainAuthCheck returned no state");
  }
  return state;
}

async function requireRow(name: string) {
  const row = await rowFor(name);
  if (!row) {
    throw new Error(`no domain_auth_check row for ${name}`);
  }
  return row;
}

async function rowFor(name: string) {
  const [row] = await db
    .select()
    .from(domainAuthCheck)
    .where(
      and(
        eq(domainAuthCheck.awsAccountId, acctA),
        eq(domainAuthCheck.recordName, name)
      )
    );
  return row;
}

describe("Repository: domain-auth", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: orgA,
          name: "Domain Auth Test Org A",
          slug: `dac-a-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: "Domain Auth Test Org B",
          slug: `dac-b-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(awsAccount)
      .values([
        {
          id: acctA,
          organizationId: orgA,
          name: "DAC Test Account A",
          accountId: "111111111111",
          region: "us-east-1",
          roleArn: "arn:aws:iam::111111111111:role/dac-test-a",
          externalId: `dac-ext-a-${suffix}`,
        },
        {
          id: acctB,
          organizationId: orgB,
          name: "DAC Test Account B",
          accountId: "222222222222",
          region: "us-east-1",
          roleArn: "arn:aws:iam::222222222222:role/dac-test-b",
          externalId: `dac-ext-b-${suffix}`,
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(domainAuthCheck)
      .where(eq(domainAuthCheck.organizationId, orgA));
    await db
      .delete(domainAuthCheck)
      .where(eq(domainAuthCheck.organizationId, orgB));
    await db.delete(awsAccount).where(eq(awsAccount.id, acctA));
    await db.delete(awsAccount).where(eq(awsAccount.id, acctB));
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
  });

  it("does not treat a first-ever missing check as drift", async () => {
    const name = freshName();
    const state = await check(record("missing", name), T0);
    expect(state.status).toBe("missing");
    expect(state.drifted).toBe(false);
    expect(state.driftedAt).toBeNull();
    expect(state.lastVerifiedAt).toBeNull();
  });

  it("flags drift when a verified record goes missing and keeps lastVerifiedAt", async () => {
    const name = freshName();
    await check(record("verified", name), T0);
    const state = await check(record("missing", name), T1);
    expect(state.drifted).toBe(true);
    expect(state.driftedAt).toEqual(T1);
    expect(state.lastVerifiedAt).toEqual(T0);
    const row = await requireRow(name);
    expect(row.status).toBe("missing");
    expect(row.driftedAt).toEqual(T1);
    expect(row.lastVerifiedAt).toEqual(T0);
  });

  it("leaves the row unchanged when a later check is unknown", async () => {
    const name = freshName();
    await check(record("verified", name), T0);
    const state = await check(record("unknown", name), T1);
    expect(state.status).toBe("verified");
    expect(state.drifted).toBe(false);
    const row = await requireRow(name);
    expect(row.status).toBe("verified");
    expect(row.checkedAt).toEqual(T0);
  });

  it("does not create a row for an unknown first check", async () => {
    const name = freshName();
    const state = await check(record("unknown", name), T0);
    expect(state.status).toBe("unknown");
    expect(state.drifted).toBe(false);
    expect(await rowFor(name)).toBeUndefined();
  });

  it("clears drift when the record verifies again", async () => {
    const name = freshName();
    await check(record("verified", name), T0);
    await check(record("missing", name), T1);
    const state = await check(record("verified", name), T2);
    expect(state.drifted).toBe(false);
    expect(state.driftedAt).toBeNull();
    expect(state.lastVerifiedAt).toEqual(T2);
  });

  it("keeps the first drift time while the record stays broken", async () => {
    const name = freshName();
    await check(record("verified", name), T0);
    await check(record("missing", name), T1);
    const state = await check(record("missing", name), T2);
    expect(state.drifted).toBe(true);
    expect(state.driftedAt).toEqual(T1);
    expect(state.lastVerifiedAt).toEqual(T0);
  });

  it("neither reads nor updates another org's rows", async () => {
    const name = freshName();
    await check(record("verified", name), T0);
    const before = await rowFor(name);

    const state = await check(record("missing", name), T3, {
      organizationId: orgB,
      awsAccountId: acctA,
    });
    // orgB sees no prior state, so this is a first-ever missing, not drift.
    expect(state.drifted).toBe(false);

    const after = await requireRow(name);
    expect(after).toEqual(before);
    expect(after.organizationId).toBe(orgA);
  });

  it("keeps separate rows for two identities sharing a MAIL FROM record", async () => {
    const name = `mail-${suffix}.example.com`;
    const mailFrom = (status: DomainAuthObservation["status"]) => ({
      recordKind: "mailfrom_mx" as const,
      recordName: name,
      status,
      found: [],
    });
    const ids = { organizationId: orgA, awsAccountId: acctA };
    await recordDomainAuthCheck({
      ...ids,
      identity: "one.example.com",
      observations: [mailFrom("verified")],
      now: T0,
    });
    await recordDomainAuthCheck({
      ...ids,
      identity: "two.example.com",
      observations: [mailFrom("missing")],
      now: T0,
    });

    const rows = await db
      .select()
      .from(domainAuthCheck)
      .where(
        and(
          eq(domainAuthCheck.awsAccountId, acctA),
          eq(domainAuthCheck.recordName, name)
        )
      );
    const byIdentity = new Map(rows.map((r) => [r.identity, r.status]));
    expect(rows).toHaveLength(2);
    expect(byIdentity.get("one.example.com")).toBe("verified");
    expect(byIdentity.get("two.example.com")).toBe("missing");
  });
});
