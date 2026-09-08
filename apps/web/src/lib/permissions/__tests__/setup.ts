import { awsAccount, db, member, organization, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, vi } from "vitest";

// Component tests run in jsdom and, since this suite went parallel, share the
// machine with every other file in the app plus apps/api and packages/cli under
// `pnpm test`. A React state update can then land well past Testing Library's
// 1s `waitFor` default — `preference-center-settings-analytics.test.tsx` failed
// that way on a congested run while passing on four others. Headroom for
// scheduling, not for slow assertions: an update that never arrives still fails.
if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/dom");
  configure({ asyncUtilTimeout: 10_000 });
}

// Global mock: prevent activation-tracking from emitting real events to production.
// Every exported function returns a resolved Promise (the real functions are async).
const noop = () => Promise.resolve();
vi.mock("@/lib/activation-tracking", () => ({
  trackAwsConnected: vi.fn(noop),
  trackDomainVerified: vi.fn(noop),
  trackFirstEmailSent: vi.fn(noop),
  trackOnboardingCompleted: vi.fn(noop),
  trackContactCreated: vi.fn(noop),
  trackContactsImported: vi.fn(noop),
  trackWorkflowCreated: vi.fn(noop),
  trackTemplateCreated: vi.fn(noop),
  trackTemplatePublished: vi.fn(noop),
  trackBroadcastCreated: vi.fn(noop),
  trackApiKeyCreated: vi.fn(noop),
  trackTeammateInvited: vi.fn(noop),
  trackInvitationAccepted: vi.fn(noop),
  trackOnboardingPathChosen: vi.fn(noop),
  computeActivationScore: vi.fn(() =>
    Promise.resolve({ score: 0, milestones: {} })
  ),
  updateActivationScore: vi.fn(noop),
}));

// Test files run in parallel vitest workers against one shared database, and
// concurrent CI runs share that database too. Fixtures must therefore be
// unique per file AND per run — a fixed ID lets another worker's cleanup
// delete rows this file just created.
export function setupPermissionFixtures(filePrefix: string) {
  const prefix = `test-${filePrefix}-${crypto.randomUUID().slice(0, 8)}`;

  const testUser = {
    id: `${prefix}-user-1`,
    email: `${prefix}-1@example.com`,
    name: "Test User",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    twoFactorEnabled: false,
  };

  const testUser2 = {
    id: `${prefix}-user-2`,
    email: `${prefix}-2@example.com`,
    name: "Test User 2",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    twoFactorEnabled: false,
  };

  const testOrganization = {
    id: `${prefix}-org`,
    name: "Test Org",
    slug: `${prefix}-org`,
    createdAt: new Date(),
    logo: null,
    metadata: null,
  };

  const testAWSAccount = {
    id: `${prefix}-aws`,
    organizationId: testOrganization.id,
    name: "Production",
    accountId: "123456789012",
    region: "us-east-1",
    roleArn: "arn:aws:iam::123456789012:role/test",
    externalId: `${prefix}-external`,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "active" as const,
    verificationMethod: null,
  };

  const testMemberOwner = {
    id: `${prefix}-member-owner`,
    organizationId: testOrganization.id,
    userId: testUser.id,
    role: "owner" as const,
    createdAt: new Date(),
  };

  const testMemberRegular = {
    id: `${prefix}-member-regular`,
    organizationId: testOrganization.id,
    userId: testUser2.id,
    role: "member" as const,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    await db.insert(user).values([testUser, testUser2]);
    await db.insert(organization).values(testOrganization);
    await db.insert(awsAccount).values(testAWSAccount);
    await db.insert(member).values([testMemberOwner, testMemberRegular]);
  });

  afterAll(async () => {
    // Org first: cascades awsAccount -> awsAccountPermission, which must be
    // gone before deleting users (permission.grantedBy has no cascade).
    await db
      .delete(organization)
      .where(eq(organization.id, testOrganization.id));
    await db.delete(user).where(inArray(user.id, [testUser.id, testUser2.id]));
  });

  return { testUser, testUser2, testOrganization, testAWSAccount };
}
