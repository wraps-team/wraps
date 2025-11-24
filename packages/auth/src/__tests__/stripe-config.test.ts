import { describe, expect, it } from "vitest";
import { auth } from "../index";

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
  it("should have Pro plan configured", () => {
    // Access the stripe plugin config
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    if (!stripePlugin) {
      throw new Error("Stripe plugin not found");
    }

    const plans = (stripePlugin as any).plans;
    expect(plans).toBeDefined();
    expect(Array.isArray(plans)).toBe(true);

    const proPlan = plans.find((p: any) => p.name === "pro");
    expect(proPlan).toBeDefined();
    expect(proPlan.name).toBe("pro");
    expect(proPlan.limits).toBeDefined();
    expect(proPlan.freeTrial).toBeDefined();
    expect(proPlan.freeTrial.days).toBe(14);
  });

  it("should have Enterprise plan configured", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    const plans = (stripePlugin as any).plans;
    const enterprisePlan = plans.find((p: any) => p.name === "enterprise");

    expect(enterprisePlan).toBeDefined();
    expect(enterprisePlan.name).toBe("enterprise");
    expect(enterprisePlan.limits).toBeDefined();
  });

  it("should have Pro plan with correct limits", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    const plans = (stripePlugin as any).plans;
    const proPlan = plans.find((p: any) => p.name === "pro");

    expect(proPlan.limits.emails).toBe(100_000);
    expect(proPlan.limits.awsAccounts).toBe(3);
    expect(proPlan.limits.members).toBe(10);
  });

  it("should have Enterprise plan with unlimited limits", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    const plans = (stripePlugin as any).plans;
    const enterprisePlan = plans.find((p: any) => p.name === "enterprise");

    expect(enterprisePlan.limits.emails).toBe(-1); // Unlimited
    expect(enterprisePlan.limits.awsAccounts).toBe(-1); // Unlimited
    expect(enterprisePlan.limits.members).toBe(-1); // Unlimited
  });

  it("should have lifecycle hooks configured", () => {
    const stripePlugin = auth.options.plugins?.find(
      (plugin: any) => plugin?.id === "stripe" || plugin?.$id === "stripe"
    );

    expect(stripePlugin).toBeDefined();
    expect((stripePlugin as any).onSubscriptionComplete).toBeDefined();
    expect((stripePlugin as any).onSubscriptionUpdate).toBeDefined();
    expect((stripePlugin as any).onSubscriptionCancel).toBeDefined();
  });
});

describe("Better-Auth Environment Configuration", () => {
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

  it("should have Pro plan price IDs configured", () => {
    // Check that environment variables are expected to be set
    expect(
      process.env.STRIPE_PRO_PRICE_ID !== undefined ||
        process.env.STRIPE_PRO_PRICE_ID === ""
    ).toBe(true);
  });

  it("should have database adapter configured", () => {
    expect(auth.options.database).toBeDefined();
  });
});
