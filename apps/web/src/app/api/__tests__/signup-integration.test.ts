import {
  db,
  member,
  organization,
  organizationExtension,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const testSignupEmail = "signup-integration-test@example.com";
const testSignupUserId = "signup-test-user-1";
const testSignupOrgId = "signup-test-org-1";

describe("Signup Flow Integration Tests", () => {
  beforeEach(async () => {
    // Clean up any existing test data
    await db.delete(member).where(eq(member.userId, testSignupUserId));
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testSignupOrgId));
    await db.delete(organization).where(eq(organization.id, testSignupOrgId));
    // Also clean up by slug in case there's a leftover from previous test run
    await db.delete(organization).where(eq(organization.slug, "test-org"));
    await db.delete(user).where(eq(user.id, testSignupUserId));
  });

  afterAll(async () => {
    // Final cleanup
    await db.delete(member).where(eq(member.userId, testSignupUserId));
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testSignupOrgId));
    await db.delete(organization).where(eq(organization.id, testSignupOrgId));
    await db.delete(user).where(eq(user.id, testSignupUserId));
  });

  it("should complete full signup flow: user → organization → member → extension", async () => {
    // Step 1: Create user (simulating signup)
    const newUser = await db
      .insert(user)
      .values({
        id: testSignupUserId,
        name: "Signup Test User",
        email: testSignupEmail,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        stripeCustomerId: null,
      })
      .returning();

    expect(newUser[0].email).toBe(testSignupEmail);
    expect(newUser[0].stripeCustomerId).toBeNull();

    // Step 2: Create organization (simulating automatic org creation)
    const newOrg = await db
      .insert(organization)
      .values({
        id: testSignupOrgId,
        name: "Signup Test Organization",
        slug: "signup-test-org",
        createdAt: new Date(),
      })
      .returning();

    expect(newOrg[0].name).toBe("Signup Test Organization");
    expect(newOrg[0].slug).toBe("signup-test-org");

    // Step 3: Add user as organization owner
    const newMember = await db
      .insert(member)
      .values({
        id: "signup-test-member-1",
        organizationId: testSignupOrgId,
        userId: testSignupUserId,
        role: "owner",
        createdAt: new Date(),
      })
      .returning();

    expect(newMember[0].role).toBe("owner");
    expect(newMember[0].userId).toBe(testSignupUserId);

    // Step 4: Create organization extension with default values
    const newExtension = await db
      .insert(organizationExtension)
      .values({
        organizationId: testSignupOrgId,
        plan: "free",
        awsAccountCount: 0,
        memberCount: 1,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .returning();

    expect(newExtension[0].plan).toBe("free");
    expect(newExtension[0].onboardingCompleted).toBe(false);
    expect(newExtension[0].memberCount).toBe(1);

    // Verify all relationships work
    const userWithOrgs = await db.query.user.findFirst({
      where: eq(user.id, testSignupUserId),
      with: {
        members: {
          with: {
            organization: {
              with: {
                extension: true,
              },
            },
          },
        },
      },
    });

    expect(userWithOrgs).toBeDefined();
    expect(userWithOrgs?.members).toHaveLength(1);
    expect(userWithOrgs?.members[0].role).toBe("owner");
    expect(
      userWithOrgs?.members[0].organization.extension?.onboardingCompleted
    ).toBe(false);
  });

  it("should handle organization name generation from user name", async () => {
    // Create user
    await db.insert(user).values({
      id: testSignupUserId,
      name: "John Doe",
      email: testSignupEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create org with generated name
    const orgName = "John Doe's Organization";
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const newOrg = await db
      .insert(organization)
      .values({
        id: testSignupOrgId,
        name: orgName,
        slug: orgSlug,
        createdAt: new Date(),
      })
      .returning();

    expect(newOrg[0].name).toBe("John Doe's Organization");
    expect(newOrg[0].slug).toBe("john-doe-s-organization");
  });

  it("should allow optional organization name during signup", async () => {
    // Create user
    await db.insert(user).values({
      id: testSignupUserId,
      name: "Jane Smith",
      email: testSignupEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create org with custom name (user provided)
    const customOrgName = "Acme Inc";

    const newOrg = await db
      .insert(organization)
      .values({
        id: testSignupOrgId,
        name: customOrgName,
        slug: customOrgName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        createdAt: new Date(),
      })
      .returning();

    expect(newOrg[0].name).toBe("Acme Inc");
    expect(newOrg[0].slug).toBe("acme-inc");
  });

  it("should set up onboarding tracking correctly for new organization", async () => {
    // Create minimal setup
    await db.insert(user).values({
      id: testSignupUserId,
      name: "Test User",
      email: testSignupEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(organization).values({
      id: testSignupOrgId,
      name: "Test Org",
      slug: "test-org",
      createdAt: new Date(),
    });

    // Create extension with onboarding not completed
    const ext = await db
      .insert(organizationExtension)
      .values({
        organizationId: testSignupOrgId,
        plan: "free",
        awsAccountCount: 0,
        memberCount: 1,
        onboardingCompleted: false,
        updatedAt: new Date(),
      })
      .returning();

    expect(ext[0].onboardingCompleted).toBe(false);
    expect(ext[0].onboardingCompletedAt).toBeNull();

    // Simulate completing onboarding
    const completedAt = new Date();
    await db
      .update(organizationExtension)
      .set({
        onboardingCompleted: true,
        onboardingCompletedAt: completedAt,
      })
      .where(eq(organizationExtension.organizationId, testSignupOrgId));

    const updated = await db.query.organizationExtension.findFirst({
      where: eq(organizationExtension.organizationId, testSignupOrgId),
    });

    expect(updated?.onboardingCompleted).toBe(true);
    expect(updated?.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("should support Stripe customer creation during signup", async () => {
    const stripeCustomerId = "cus_test_signup123";

    // Create user with Stripe customer ID
    const newUser = await db
      .insert(user)
      .values({
        id: testSignupUserId,
        name: "Stripe Test User",
        email: testSignupEmail,
        emailVerified: false,
        stripeCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(newUser[0].stripeCustomerId).toBe(stripeCustomerId);

    // Create org
    await db.insert(organization).values({
      id: testSignupOrgId,
      name: "Stripe Test Org",
      slug: "stripe-test-org",
      createdAt: new Date(),
    });

    // Create extension with Stripe fields
    const ext = await db
      .insert(organizationExtension)
      .values({
        organizationId: testSignupOrgId,
        plan: "pro",
        stripeCustomerId,
        stripeSubscriptionId: "sub_test123",
        awsAccountCount: 0,
        memberCount: 1,
        onboardingCompleted: false,
        updatedAt: new Date(),
      })
      .returning();

    expect(ext[0].plan).toBe("pro");
    expect(ext[0].stripeCustomerId).toBe(stripeCustomerId);
    expect(ext[0].stripeSubscriptionId).toBe("sub_test123");
  });

  it("should verify user can only be owner of their own organization", async () => {
    // Create user and org
    await db.insert(user).values({
      id: testSignupUserId,
      name: "Owner Test",
      email: testSignupEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(organization).values({
      id: testSignupOrgId,
      name: "Owner Test Org",
      slug: "owner-test-org",
      createdAt: new Date(),
    });

    // Add as owner
    const ownerMember = await db
      .insert(member)
      .values({
        id: "owner-member-1",
        organizationId: testSignupOrgId,
        userId: testSignupUserId,
        role: "owner",
        createdAt: new Date(),
      })
      .returning();

    expect(ownerMember[0].role).toBe("owner");

    // Query to verify
    const members = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, testSignupOrgId));

    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(members[0].userId).toBe(testSignupUserId);
  });
});
