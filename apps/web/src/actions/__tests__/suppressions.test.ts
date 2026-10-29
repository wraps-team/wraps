/**
 * Tests for removeSuppression — audit-row write, the COMPLAINT
 * acknowledgement guard, and the server-side reason re-read — and for
 * addSuppression — idempotency, never weakening a COMPLAINT, and the audit row.
 *
 * Mocking model follows domains.test.ts (added 2026-09-10): session/db
 * fixtures are real rows in the shared test Postgres (per contacts-audit
 * test conventions), while AWS is mocked. Fixture ids use the
 * `suppression-296-*` prefix so this file cannot collide with any other
 * file's rows in the shared database.
 */

import {
  auditLog,
  awsAccount,
  db,
  member,
  organization,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { addSuppression, removeSuppression } from "../suppressions";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let currentMockUserId: string | null = null;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (currentMockUserId === null) {
          return null;
        }
        return {
          user: {
            id: currentMockUserId,
            email: "suppression-296-test@example.com",
            name: "Suppression Test User",
          },
          session: {
            id: "suppression-296-session",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: currentMockUserId,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "suppression-296-token",
          },
        };
      }),
    },
  },
}));

const mockGetOrAssumeRole = vi.fn();
vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type SesCommand = {
  _type: string;
  input: Record<string, unknown>;
};

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send(command: SesCommand) {
      return mockSend(command);
    }
  },
  GetSuppressedDestinationCommand: class {
    _type = "GetSuppressedDestinationCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  DeleteSuppressedDestinationCommand: class {
    _type = "DeleteSuppressedDestinationCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  PutSuppressedDestinationCommand: class {
    _type = "PutSuppressedDestinationCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

// ─── Test fixtures ──────────────────────────────────────────────────────────

const testUser = {
  id: "suppression-296-user-1",
  email: "suppression-296-user@example.com",
  name: "Suppression 296 Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "suppression-296-org-1",
  name: "Suppression 296 Test Org",
  slug: "suppression-296-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

// A second org with its own AWS account, to prove addSuppression refuses an
// account id that belongs to someone else's org.
const otherOrg = {
  id: "suppression-296-org-2",
  name: "Suppression 296 Other Org",
  slug: "suppression-296-other-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrgAccount = {
  id: "suppression-296-aws-account-2",
  name: "Suppression 296 Other AWS Account",
  accountId: "222222222222",
  region: "us-east-1",
  roleArn: "arn:aws:iam::222222222222:role/WrapsRole",
  externalId: "suppression-296-external-id-2",
  organizationId: otherOrg.id,
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

const testMember = {
  id: "suppression-296-member-1",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "suppression-296-aws-account-1",
  organizationId: testOrg.id,
  name: "Suppression 296 Test AWS Account",
  accountId: "111111111111",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111111111111:role/WrapsRole",
  externalId: "suppression-296-external-id-1",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

function mockGetSuppressedDestination(reason: "BOUNCE" | "COMPLAINT") {
  mockSend.mockImplementation((command: SesCommand) => {
    if (command._type === "GetSuppressedDestinationCommand") {
      return Promise.resolve({
        SuppressedDestination: {
          EmailAddress: command.input.EmailAddress,
          Reason: reason,
          LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }
    if (command._type === "DeleteSuppressedDestinationCommand") {
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Unexpected command ${command._type}`));
  });
}

const PERMISSION_DENIED_ERROR =
  "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions.";

function namedError(name: string) {
  const err = new Error(name);
  err.name = name;
  return err;
}

/**
 * Models the SES side of addSuppression: `existing` is what GetSuppressedDestination
 * finds (undefined = NotFoundException), and `getError` / `putError` make the
 * named call fail with that exception name instead.
 */
function mockSesState({
  existing,
  getError,
  putError,
}: {
  existing?: "BOUNCE" | "COMPLAINT";
  getError?: string;
  putError?: string;
} = {}) {
  mockSend.mockImplementation((command: SesCommand) => {
    if (command._type === "GetSuppressedDestinationCommand") {
      if (getError) {
        return Promise.reject(namedError(getError));
      }
      if (!existing) {
        return Promise.reject(namedError("NotFoundException"));
      }
      return Promise.resolve({
        SuppressedDestination: {
          EmailAddress: command.input.EmailAddress,
          Reason: existing,
          LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
        },
      });
    }
    if (command._type === "PutSuppressedDestinationCommand") {
      if (putError) {
        return Promise.reject(namedError(putError));
      }
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Unexpected command ${command._type}`));
  });
}

function callsOf(type: string) {
  return mockSend.mock.calls.filter(
    (call: SesCommand[]) => call[0]._type === type
  );
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

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
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(organization)
    .values(otherOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: otherOrg.name },
    });

  await db
    .insert(awsAccount)
    .values(otherOrgAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(auditLog).where(eq(auditLog.organizationId, otherOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, otherOrgAccount.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(async () => {
  currentMockUserId = testUser.id;
  mockGetOrAssumeRole.mockReset();
  mockGetOrAssumeRole.mockResolvedValue({
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "session-token",
  });
  mockSend.mockReset();
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
});

// ─── removeSuppression ──────────────────────────────────────────────────────

describe("removeSuppression", () => {
  it("removing a BOUNCE-reason address calls AWS and writes exactly one suppression.removed audit row", async () => {
    mockGetSuppressedDestination("BOUNCE");

    const email = "bounced-296@example.com";
    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      email,
      false
    );

    expect(result.success).toBe(true);

    const deleteCalls = mockSend.mock.calls.filter(
      (call: SesCommand[]) =>
        call[0]._type === "DeleteSuppressedDestinationCommand"
    );
    expect(deleteCalls).toHaveLength(1);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "suppression.removed")
        )
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].resourceId).toBe(email);
    expect(rows[0].metadata).toMatchObject({ email, reason: "BOUNCE" });
  });

  it("removing a COMPLAINT-reason address with acknowledgedComplaint: false returns a failure and never calls DeleteSuppressedDestination", async () => {
    mockGetSuppressedDestination("COMPLAINT");

    const email = "complainer-296@example.com";
    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      email,
      false
    );

    expect(result.success).toBe(false);

    // Asserting only on the return value would pass against a broken
    // implementation that deleted first and reported failure after — assert
    // directly on the AWS mock instead.
    const deleteCalls = mockSend.mock.calls.filter(
      (call: SesCommand[]) =>
        call[0]._type === "DeleteSuppressedDestinationCommand"
    );
    expect(deleteCalls).toHaveLength(0);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "suppression.removed")
        )
      );
    expect(rows).toHaveLength(0);
  });

  it("re-reads the reason server-side: a caller unaware the address is now a COMPLAINT (passing acknowledgedComplaint: false, as for an ordinary BOUNCE) is still refused, not trusting any stale client-side belief about the reason", async () => {
    // The action takes no client-supplied "reason" argument at all — this is
    // deliberate: it forces every decision through a live
    // GetSuppressedDestinationCommand rather than anything the client could
    // have cached from an earlier list page.
    mockGetSuppressedDestination("COMPLAINT");

    const email = "flipped-to-complaint-296@example.com";
    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      email,
      false
    );

    expect(result.success).toBe(false);

    const getCalls = mockSend.mock.calls.filter(
      (call: SesCommand[]) =>
        call[0]._type === "GetSuppressedDestinationCommand"
    );
    expect(getCalls).toHaveLength(1);

    const deleteCalls = mockSend.mock.calls.filter(
      (call: SesCommand[]) =>
        call[0]._type === "DeleteSuppressedDestinationCommand"
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it("acknowledging the complaint (acknowledgedComplaint: true) allows the removal to proceed", async () => {
    mockGetSuppressedDestination("COMPLAINT");

    const email = "acknowledged-296@example.com";
    const result = await removeSuppression(
      testOrg.id,
      testAwsAccount.id,
      email,
      true
    );

    expect(result.success).toBe(true);
  });
});

// ─── addSuppression ─────────────────────────────────────────────────────────

async function addedAuditRows() {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, testOrg.id),
        eq(auditLog.action, "suppression.added")
      )
    );
}

describe("addSuppression", () => {
  it("adds an address with the chosen reason and writes exactly one suppression.added audit row", async () => {
    mockSesState();

    const email = "bounced-add-296@example.com";
    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      email,
      "BOUNCE"
    );

    expect(result).toEqual({ success: true, email, alreadyPresent: false });

    const puts = callsOf("PutSuppressedDestinationCommand");
    expect(puts).toHaveLength(1);
    expect(puts[0][0].input).toEqual({
      EmailAddress: email,
      Reason: "BOUNCE",
    });

    const rows = await addedAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].resourceId).toBe(email);
    expect(rows[0].metadata).toMatchObject({
      email,
      reason: "BOUNCE",
      awsAccountId: testAwsAccount.id,
      source: "manual",
    });
  });

  it("stores the address lower-cased and trimmed, in the AWS call, the audit row and the result", async () => {
    mockSesState();

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "  Mixed.Case-296@Example.COM ",
      "COMPLAINT"
    );

    const expected = "mixed.case-296@example.com";
    expect(result).toEqual({
      success: true,
      email: expected,
      alreadyPresent: false,
    });
    expect(callsOf("PutSuppressedDestinationCommand")[0][0].input).toEqual({
      EmailAddress: expected,
      Reason: "COMPLAINT",
    });
    const rows = await addedAuditRows();
    expect(rows[0].resourceId).toBe(expected);
  });

  it("an address already on the list with the same reason is a no-op: no Put, no audit row", async () => {
    mockSesState({ existing: "BOUNCE" });

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "same-296@example.com",
      "BOUNCE"
    );

    expect(result).toEqual({
      success: true,
      email: "same-296@example.com",
      alreadyPresent: true,
    });
    expect(callsOf("PutSuppressedDestinationCommand")).toHaveLength(0);
    expect(await addedAuditRows()).toHaveLength(0);
  });

  it("an address already COMPLAINT is never weakened: a BOUNCE request is a no-op", async () => {
    mockSesState({ existing: "COMPLAINT" });

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "complaint-296@example.com",
      "BOUNCE"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyPresent).toBe(true);
    }
    expect(callsOf("PutSuppressedDestinationCommand")).toHaveLength(0);
    expect(await addedAuditRows()).toHaveLength(0);
  });

  it("a BOUNCE address upgraded to COMPLAINT is written, since that strengthens the record", async () => {
    mockSesState({ existing: "BOUNCE" });

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "upgrade-296@example.com",
      "COMPLAINT"
    );

    expect(result).toEqual({
      success: true,
      email: "upgrade-296@example.com",
      alreadyPresent: false,
    });
    expect(callsOf("PutSuppressedDestinationCommand")[0][0].input).toEqual({
      EmailAddress: "upgrade-296@example.com",
      Reason: "COMPLAINT",
    });
    expect(await addedAuditRows()).toHaveLength(1);
  });

  it("returns the permission message and writes no audit row when Put is denied", async () => {
    mockSesState({ putError: "AccessDeniedException" });

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "put-denied-296@example.com",
      "BOUNCE"
    );

    expect(result).toEqual({
      success: false,
      error: PERMISSION_DENIED_ERROR,
    });
    expect(await addedAuditRows()).toHaveLength(0);
  });

  it("returns the permission message and never calls Put when the re-read is denied (fails closed)", async () => {
    mockSesState({ getError: "AccessDeniedException" });

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "get-denied-296@example.com",
      "BOUNCE"
    );

    expect(result).toEqual({
      success: false,
      error: PERMISSION_DENIED_ERROR,
    });
    expect(callsOf("PutSuppressedDestinationCommand")).toHaveLength(0);
    expect(await addedAuditRows()).toHaveLength(0);
  });

  it("refuses an AWS account id that belongs to another org, without any AWS call", async () => {
    mockSesState();

    const result = await addSuppression(
      testOrg.id,
      otherOrgAccount.id,
      "cross-org-296@example.com",
      "BOUNCE"
    );

    expect(result).toEqual({ success: false, error: "AWS account not found" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects a reason other than BOUNCE or COMPLAINT without any AWS call", async () => {
    mockSesState();

    const result = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "reason-296@example.com",
      // Deliberately invalid: exercises the server-side reason guard.
      "SPAM" as unknown as "BOUNCE"
    );

    expect(result).toEqual({
      success: false,
      error: "Reason must be BOUNCE or COMPLAINT.",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects an address with no @ and a malformed address without any AWS call", async () => {
    mockSesState();

    const noAt = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "not-an-email",
      "BOUNCE"
    );
    expect(noAt).toEqual({
      success: false,
      error: "Enter an email address.",
    });

    const malformed = await addSuppression(
      testOrg.id,
      testAwsAccount.id,
      "a@b",
      "BOUNCE"
    );
    expect(malformed).toEqual({
      success: false,
      error: "Enter a valid email address.",
    });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
