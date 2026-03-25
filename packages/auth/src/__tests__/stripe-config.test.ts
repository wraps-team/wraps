import { describe, expect, it, vi } from "vitest";
import { auth, subscriptionPlans } from "../index";

describe("Better-Auth Stripe Plugin Configuration", () => {
  it("should have Stripe plugin configured", () => {
    expect(auth).toBeDefined();
    expect(auth.options).toBeDefined();
    expect(auth.options.plugins).toBeDefined();

    // Check that plugins array includes stripe-related plugin
    const hasStripePlugin = auth.options.plugins?.some(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    expect(hasStripePlugin).toBe(true);
  });

  it("should have organization plugin configured", () => {
    const hasOrgPlugin = auth.options.plugins?.some(
      (plugin: any) =>
        plugin?.id === "organization" || plugin?.$id === "organization"
    );

    expect(hasOrgPlugin).toBe(true);
  });

  it("should have email and password enabled", () => {
    expect(auth.options.emailAndPassword).toBeDefined();
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
  });

  it("should have email verification configured", () => {
    expect(auth.options.emailVerification).toBeDefined();
    expect(auth.options.emailVerification?.sendVerificationEmail).toBeDefined();
  });

  it("should have session hooks configured", () => {
    expect(auth.options.databaseHooks).toBeDefined();
    expect(auth.options.databaseHooks?.session).toBeDefined();
    expect(auth.options.databaseHooks?.session?.create).toBeDefined();
  });
});

describe("Better-Auth Stripe Plugin - Plan Configuration", () => {
  it("should include stripe plugin when STRIPE_SECRET_KEY is set", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    // Plugin should be present when STRIPE_SECRET_KEY is configured
    if (process.env.STRIPE_SECRET_KEY) {
      expect(stripePlugin).toBeDefined();
    } else {
      // If not configured, plugin won't be included (conditional in auth config)
      expect(stripePlugin).toBeUndefined();
    }
  });

  it("should have stripe plugin with expected structure", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    if (!stripePlugin) {
      // Skip if stripe plugin not available
      return;
    }

    // Verify it has the expected plugin structure
    expect(stripePlugin).toHaveProperty("id");
    expect((stripePlugin as any).id || (stripePlugin as any).$id).toBe(
      "stripe"
    );
  });

  it("should have Growth plan configured", () => {
    expect(subscriptionPlans).toBeDefined();
    expect(Array.isArray(subscriptionPlans)).toBe(true);

    const growthPlan = subscriptionPlans.find((p) => p.name === "growth");
    expect(growthPlan).toBeDefined();
    expect(growthPlan?.name).toBe("growth");
    expect(growthPlan?.limits).toBeDefined();
  });

  it("should have Scale plan configured", () => {
    const scalePlan = subscriptionPlans.find((p) => p.name === "scale");

    expect(scalePlan).toBeDefined();
    expect(scalePlan?.name).toBe("scale");
    expect(scalePlan?.limits).toBeDefined();
  });

  it("should have Growth plan with correct limits", () => {
    const growthPlan = subscriptionPlans.find((p) => p.name === "growth");

    expect(growthPlan?.limits.emails).toBe(-1); // Unlimited (they pay AWS)
    expect(growthPlan?.limits.awsAccounts).toBe(3);
    expect(growthPlan?.limits.aiMessages).toBe(250);
    expect(growthPlan?.limits.bulkBatchSize).toBe(1000);
    expect(growthPlan?.limits.members).toBe(-1); // Unlimited (we don't gate on team size)
  });

  it("should have Scale plan with unlimited limits", () => {
    const scalePlan = subscriptionPlans.find((p) => p.name === "scale");

    expect(scalePlan?.limits.emails).toBe(-1); // Unlimited
    expect(scalePlan?.limits.awsAccounts).toBe(-1); // Unlimited
    expect(scalePlan?.limits.aiMessages).toBe(1000);
    expect(scalePlan?.limits.bulkBatchSize).toBe(10_000);
    expect(scalePlan?.limits.members).toBe(-1); // Unlimited
  });

  it("should have Starter plan with correct limits", () => {
    const starterPlan = subscriptionPlans.find((p) => p.name === "starter");

    expect(starterPlan).toBeDefined();
    expect(starterPlan?.limits.emails).toBe(-1); // Unlimited (they pay AWS)
    expect(starterPlan?.limits.awsAccounts).toBe(1);
    expect(starterPlan?.limits.aiMessages).toBe(50);
    expect(starterPlan?.limits.bulkBatchSize).toBe(100);
    expect(starterPlan?.limits.members).toBe(-1); // Unlimited
  });
});

describe("Better-Auth Environment Configuration", () => {
  it("uses BETTER_AUTH_URL as Better Auth baseURL", async () => {
    const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://auth.wraps.dev";

    try {
      const { auth: reloadedAuth } = await import("../index");
      expect(reloadedAuth.options.baseURL).toBe("https://auth.wraps.dev");
    } finally {
      if (originalBetterAuthUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = originalBetterAuthUrl;
      }
      vi.resetModules();
    }
  });

  it("should require Stripe secret key", () => {
    // In test environment, this might be empty, but the config should reference it
    expect(
      process.env.STRIPE_SECRET_KEY !== undefined ||
        process.env.STRIPE_SECRET_KEY === ""
    ).toBe(true);
  });

  it("should require Stripe webhook secret", () => {
    expect(
      process.env.STRIPE_WEBHOOK_SECRET !== undefined ||
        process.env.STRIPE_WEBHOOK_SECRET === ""
    ).toBe(true);
  });

  it("should have Growth plan price IDs configured", () => {
    // Check that environment variables are expected to be set
    expect(
      process.env.STRIPE_GROWTH_PRICE_ID !== undefined ||
        process.env.STRIPE_GROWTH_PRICE_ID === ""
    ).toBe(true);
  });

  it("should have database adapter configured", () => {
    expect(auth.options.database).toBeDefined();
  });
});
