/**
 * POST /v1/account/console-policy/:awsAccountId/recheck: the awsAccounts write
 * gate, on the real DB. The probe persists a reading, so it is a write.
 *
 * Sessions need awsAccounts write. API keys are refused outright (no
 * keyScopes, and awsAccounts has no key scope), whatever their scopes.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { awsAccount, db, eq, member, user } from "@wraps/db";
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
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { FULL_ACCESS_PERMISSIONS } from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

const mockGetCredentials = vi.fn();
const mockProbe = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {},
  GetAccountCommand: class {},
  ListEmailIdentitiesCommand: class {},
  ListEmailTemplatesCommand: class {},
  ListConfigurationSetsCommand: class {},
  ListSuppressedDestinationsCommand: class {},
}));

vi.mock("../services/credentials", () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

vi.mock("../lib/console-policy-version", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/console-policy-version")>();
  return {
    ...actual,
    probeConsolePolicyVersion: (...args: unknown[]) => mockProbe(...args),
  };
});

const { accountRoutes } = await import("../routes/account");
const { CURRENT_CONSOLE_POLICY_VERSION } = await import(
  "../lib/console-policy-version"
);

const PREFIX = "console-policy-perm";
const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(auth: {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string;
  apiKeyScopes?: string[];
}) {
  const { app } = createErrorHarness();
  return app.derive(() => ({ auth })).use(accountRoutes);
}

function recheck(app: ReturnType<typeof appFor>) {
  return app.handle(
    new Request(
      `http://localhost/v1/account/console-policy/${ids.awsAccount}/recheck`,
      { method: "POST" }
    )
  );
}

async function setStoredPolicy(version: number | null, checkedAt: Date | null) {
  await db
    .update(awsAccount)
    .set({ consolePolicyVersion: version, consolePolicyCheckedAt: checkedAt })
    .where(eq(awsAccount.id, ids.awsAccount));
}

async function readStoredPolicy() {
  return db.query.awsAccount.findFirst({
    where: eq(awsAccount.id, ids.awsAccount),
    columns: { consolePolicyVersion: true, consolePolicyCheckedAt: true },
  });
}

beforeAll(async () => {
  ids = (await seedBaseOrg(PREFIX)).ids;
  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Console Policy Tester",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db.insert(member).values({
    id: READ_ONLY_MEMBER,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetCredentials.mockResolvedValue({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret",
    sessionToken: "token",
    region: "us-east-1",
  });
  await setStoredPolicy(CURRENT_CONSOLE_POLICY_VERSION - 1, null);
});

afterEach(async () => {
  await setStoredPolicy(null, null);
});

afterAll(async () => {
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("POST /v1/account/console-policy/:id/recheck — awsAccounts write gate", () => {
  it("a read-only member is 403, nothing is probed, and the stored reading is unchanged", async () => {
    const res = await recheck(
      appFor({
        apiKeyId: null,
        organizationId: ids.org,
        userId: READ_ONLY_USER,
        planId: "pro",
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PERMISSION_DENIED });
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockProbe).not.toHaveBeenCalled();
    const stored = await readStoredPolicy();
    expect(stored?.consolePolicyVersion).toBe(
      CURRENT_CONSOLE_POLICY_VERSION - 1
    );
    expect(stored?.consolePolicyCheckedAt).toBeNull();
  });

  it("an API key with full access is still 403: awsAccounts has no key scope", async () => {
    const res = await recheck(
      appFor({
        apiKeyId: "key-console-policy",
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
        apiKeyScopes: FULL_ACCESS_PERMISSIONS,
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PERMISSION_DENIED });
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("an owner session passes the gate and the reading is persisted", async () => {
    mockProbe.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      unreachable: false,
    });

    const res = await recheck(
      appFor({
        apiKeyId: null,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
      })
    );

    expect(res.status).toBe(200);
    expect(mockProbe).toHaveBeenCalledTimes(1);
    const stored = await readStoredPolicy();
    expect(stored?.consolePolicyVersion).toBe(CURRENT_CONSOLE_POLICY_VERSION);
  });
});
