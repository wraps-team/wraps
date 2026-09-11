/**
 * POST /v1/account/console-policy/:awsAccountId/recheck — real DB.
 *
 * The stale-policy banner renders off `aws_account.consolePolicyVersion`, a
 * stored column only the hourly sweep writes. A customer who repairs their
 * role is watching for that number to move, so this route re-probes on
 * demand. It is the only account route that resolves credentials and calls
 * AWS, which is why it does not share a file with the Postgres-only health
 * routes (those mock getCredentials to throw).
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { awsAccount, db, eq } from "@wraps/db";
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

// Partial mock: the route reads CURRENT_CONSOLE_POLICY_VERSION from this
// module too, and the tests assert against the real ladder height rather than
// a number they invented.
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

const TEST_PREFIX = "console-policy-recheck";

// seedBaseOrg already seeds a second organization under the same prefix, which
// is what the cross-org case needs — seeding a whole second base org would
// double this file's fixture footprint in a database every other API test file
// is using at the same time.
let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: "key-1",
        organizationId,
        userId: null,
        planId: "pro",
      },
    }))
    .use(accountRoutes);
}

function recheck(organizationId: string, awsAccountId: string) {
  return appFor(organizationId).handle(
    new Request(
      `http://localhost/v1/account/console-policy/${awsAccountId}/recheck`,
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
  const row = await db.query.awsAccount.findFirst({
    where: eq(awsAccount.id, ids.awsAccount),
    columns: { consolePolicyVersion: true, consolePolicyCheckedAt: true },
  });
  return row;
}

beforeAll(async () => {
  ids = (await seedBaseOrg(TEST_PREFIX)).ids;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCredentials.mockResolvedValue({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret",
    sessionToken: "token",
    region: "us-east-1",
  });
});

afterEach(async () => {
  await setStoredPolicy(null, null);
});

afterAll(async () => {
  await cleanupBaseOrg(TEST_PREFIX);
});

describe("POST /v1/account/console-policy/:id/recheck — auth and scoping", () => {
  it("returns 401 with no auth", async () => {
    const { app } = createErrorHarness();
    const res = await app
      .use(accountRoutes)
      .handle(
        new Request(
          `http://localhost/v1/account/console-policy/${ids.awsAccount}/recheck`,
          { method: "POST" }
        )
      );

    expect(res.status).toBe(401);
  });

  it("404s on another org's account, and never resolves its credentials", async () => {
    // An account id alone is a cross-org read, and this route hands back a
    // fact derived from that account's credentials.
    const res = await recheck(ids.otherOrg, ids.awsAccount);

    expect(res.status).toBe(404);
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockProbe).not.toHaveBeenCalled();
  });
});

describe("POST /v1/account/console-policy/:id/recheck — probing", () => {
  it("persists a fresh reading and reports the role up to date", async () => {
    await setStoredPolicy(CURRENT_CONSOLE_POLICY_VERSION - 1, null);
    mockProbe.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      unreachable: false,
    });

    const res = await recheck(ids.org, ids.awsAccount);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      currentVersion: CURRENT_CONSOLE_POLICY_VERSION,
      upToDate: true,
      rechecked: true,
    });

    // Persisted, not just reported — the banner reads the column.
    const stored = await readStoredPolicy();
    expect(stored?.consolePolicyVersion).toBe(CURRENT_CONSOLE_POLICY_VERSION);
    expect(stored?.consolePolicyCheckedAt).not.toBeNull();
  });

  it("reports a role that is still behind", async () => {
    await setStoredPolicy(null, null);
    mockProbe.mockResolvedValue({
      version: CURRENT_CONSOLE_POLICY_VERSION - 2,
      unreachable: false,
    });

    const body = await (await recheck(ids.org, ids.awsAccount)).json();

    expect(body).toMatchObject({
      version: CURRENT_CONSOLE_POLICY_VERSION - 2,
      upToDate: false,
      rechecked: true,
    });
  });

  it("serves the stored reading inside the cooldown without calling AWS", async () => {
    await setStoredPolicy(CURRENT_CONSOLE_POLICY_VERSION, new Date());

    const body = await (await recheck(ids.org, ids.awsAccount)).json();

    expect(mockProbe).not.toHaveBeenCalled();
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      upToDate: true,
      rechecked: false,
    });
  });

  it("keeps the known-good version when the probe is throttled", async () => {
    // An unreachable probe is not a policy-version fact. Writing its `version:
    // 0` would drop a healthy account straight back into the stale banner.
    await setStoredPolicy(CURRENT_CONSOLE_POLICY_VERSION, null);
    mockProbe.mockResolvedValue({ version: 0, unreachable: true });

    const body = await (await recheck(ids.org, ids.awsAccount)).json();

    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      version: CURRENT_CONSOLE_POLICY_VERSION,
      upToDate: true,
      rechecked: false,
    });
    const stored = await readStoredPolicy();
    expect(stored?.consolePolicyVersion).toBe(CURRENT_CONSOLE_POLICY_VERSION);
  });
});
