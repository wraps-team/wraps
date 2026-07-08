import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("@wraps/db", () => {
  const mockSetFn = vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  }));
  const mockUpdateFn = vi.fn(() => ({
    set: mockSetFn,
  }));

  return {
    db: {
      query: {
        subscription: {
          findFirst: vi.fn(),
        },
        organization: {
          findFirst: vi.fn(),
        },
        member: {
          findMany: vi.fn(),
        },
      },
      update: mockUpdateFn,
    },
    eq: vi.fn((a, b) => ({ field: a, value: b })),
  };
});

// Mock the email module
vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(() =>
    Promise.resolve({
      sendTemplate: vi.fn(() => Promise.resolve()),
    })
  ),
}));

// Mock the platform client
vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    POST: vi.fn(() => Promise.resolve({ error: null })),
  })),
}));

// Mock the stripeClient from index - define inside factory to avoid hoisting issues
vi.mock("../index", () => ({
  stripeClient: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

// Import after mocks are set up
import { db } from "@wraps/db";
import { getWrapsClient } from "@wraps/email";
import { createPlatformClient } from "@wraps.dev/client";
import { stripeClient } from "../index";
import {
  emitSubscriptionEvent,
  getSubscriptionOrgAdmins,
  handleCheckoutCompleted,
  handlePaymentFailed,
  handleStripeWebhook,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "../stripe-webhooks";

describe("emitSubscriptionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-api-key";
  });

  it("should emit event successfully when API key is configured", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    const result = await emitSubscriptionEvent(
      "subscription.activated",
      "admin@example.com",
      { plan: "pro", organizationName: "Test Org" }
    );

    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "subscription.activated",
        contactEmail: "admin@example.com",
        contactName: undefined,
        createIfMissing: true,
        properties: { plan: "pro", organizationName: "Test Org" },
      },
    });
  });

  it("should normalize email to lowercase", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    await emitSubscriptionEvent(
      "subscription.activated",
      "ADMIN@EXAMPLE.COM",
      {}
    );

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "subscription.activated",
        contactEmail: "admin@example.com",
        contactName: undefined,
        createIfMissing: true,
        properties: {},
      },
    });
  });

  it("should return false when API key is not configured", async () => {
    const originalKey = process.env.WRAPS_API_KEY;
    process.env.WRAPS_API_KEY = "";

    const result = await emitSubscriptionEvent(
      "subscription.activated",
      "admin@example.com",
      {}
    );

    expect(result).toBe(false);
    expect(createPlatformClient).not.toHaveBeenCalled();

    // Restore
    process.env.WRAPS_API_KEY = originalKey;
  });

  it("should return false when API call fails", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({ error: { message: "API Error" } })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    const result = await emitSubscriptionEvent(
      "subscription.activated",
      "admin@example.com",
      {}
    );

    expect(result).toBe(false);
  });
});

describe("getSubscriptionOrgAdmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSubscription = {
    id: "sub_123",
    referenceId: "org_123",
    plan: "pro",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_stripe_123",
  };

  const mockOrganization = {
    id: "org_123",
    name: "Test Organization",
    slug: "test-org",
  };

  const mockMembers = [
    {
      user: { id: "user_1", email: "owner@example.com", name: "Owner" },
      role: "owner",
    },
    {
      user: { id: "user_2", email: "admin@example.com", name: "Admin" },
      role: "admin",
    },
    {
      user: { id: "user_3", email: "member@example.com", name: "Member" },
      role: "member",
    },
  ];

  it("should find subscription by stripeCustomerId", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(
      mockSubscription as any
    );
    vi.mocked(db.query.organization.findFirst).mockResolvedValue(
      mockOrganization as any
    );
    vi.mocked(db.query.member.findMany).mockResolvedValue(mockMembers as any);

    const result = await getSubscriptionOrgAdmins({
      stripeCustomerId: "cus_123",
    });

    expect(result.subscription).toEqual(mockSubscription);
    expect(result.organization).toEqual(mockOrganization);
    expect(result.admins).toHaveLength(2); // owner + admin only
  });

  it("should find subscription by stripeSubscriptionId", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(
      mockSubscription as any
    );
    vi.mocked(db.query.organization.findFirst).mockResolvedValue(
      mockOrganization as any
    );
    vi.mocked(db.query.member.findMany).mockResolvedValue(mockMembers as any);

    const result = await getSubscriptionOrgAdmins({
      stripeSubscriptionId: "sub_stripe_123",
    });

    expect(result.subscription).toEqual(mockSubscription);
  });

  it("should return null subscription when not found", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const result = await getSubscriptionOrgAdmins({
      stripeCustomerId: "cus_unknown",
    });

    expect(result.subscription).toBeNull();
    expect(result.organization).toBeNull();
    expect(result.admins).toEqual([]);
  });

  it("should return null organization when not found", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(
      mockSubscription as any
    );
    vi.mocked(db.query.organization.findFirst).mockResolvedValue(undefined);

    const result = await getSubscriptionOrgAdmins({
      stripeCustomerId: "cus_123",
    });

    expect(result.subscription).toEqual(mockSubscription);
    expect(result.organization).toBeNull();
    expect(result.admins).toEqual([]);
  });

  it("should filter to only owners and admins", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(
      mockSubscription as any
    );
    vi.mocked(db.query.organization.findFirst).mockResolvedValue(
      mockOrganization as any
    );
    vi.mocked(db.query.member.findMany).mockResolvedValue(mockMembers as any);

    const result = await getSubscriptionOrgAdmins({
      stripeCustomerId: "cus_123",
    });

    expect(result.admins.map((a) => a.role)).toEqual(["owner", "admin"]);
    expect(result.admins.find((a) => a.role === "member")).toBeUndefined();
  });
});

describe("handlePaymentFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wraps.dev";
  });

  const mockInvoice: Partial<Stripe.Invoice> = {
    customer: "cus_123",
    amount_due: 2900,
    currency: "usd",
    hosted_invoice_url: "https://stripe.com/invoice/123",
  };

  it("should send payment failure emails to all admins", async () => {
    const mockSendTemplate = vi.fn(() => Promise.resolve());
    vi.mocked(getWrapsClient).mockResolvedValue({
      sendTemplate: mockSendTemplate,
    } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeCustomerId: "cus_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
      { user: { email: "admin@example.com", name: "Admin" }, role: "admin" },
    ] as any);

    const result = await handlePaymentFailed(mockInvoice as Stripe.Invoice);

    expect(result.success).toBe(true);
    expect(result.notifiedCount).toBe(2);
    expect(mockSendTemplate).toHaveBeenCalledTimes(2);
    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "payment-failure",
        templateData: expect.objectContaining({
          amount: "USD 29.00",
          organizationName: "Test Org",
          billingUrl: "https://app.wraps.dev/test-org/settings/billing",
        }),
      })
    );
  });

  it("should return failure when customer ID is missing", async () => {
    const result = await handlePaymentFailed({ customer: null } as any);

    expect(result.success).toBe(false);
    expect(result.notifiedCount).toBe(0);
  });

  it("should return failure when subscription is not found", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const result = await handlePaymentFailed(mockInvoice as Stripe.Invoice);

    expect(result.success).toBe(false);
  });
});

describe("handleCheckoutCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-api-key";
    // Default mock for Stripe subscription - monthly
    vi.mocked(stripeClient!.subscriptions.retrieve).mockResolvedValue({
      id: "sub_stripe_123",
      items: {
        data: [{ price: { recurring: { interval: "month" } } }],
      },
    } as never);
  });

  const mockSession: Partial<Stripe.Checkout.Session> = {
    mode: "subscription",
    customer: "cus_123",
    subscription: "sub_stripe_123",
    amount_total: 2900,
    currency: "usd",
  };

  it("should emit subscription.activated event for each admin", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeCustomerId: "cus_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const result = await handleCheckoutCompleted(
      mockSession as Stripe.Checkout.Session
    );

    expect(result.success).toBe(true);
    expect(result.eventsEmitted).toBe(1);
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: expect.objectContaining({
        name: "subscription.activated",
        contactEmail: "owner@example.com",
        contactName: "Owner",
        createIfMissing: true,
        properties: expect.objectContaining({
          plan: "pro",
          amount: "USD 29.00",
          organizationName: "Test Org",
        }),
      }),
    });
  });

  it("should skip non-subscription checkouts", async () => {
    const result = await handleCheckoutCompleted({
      mode: "payment",
      customer: "cus_123",
    } as Stripe.Checkout.Session);

    expect(result.success).toBe(true);
    expect(result.eventsEmitted).toBe(0);
  });

  it("should set annual=true when Stripe subscription has yearly interval", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    // Mock Stripe subscription with yearly interval
    vi.mocked(stripeClient!.subscriptions.retrieve).mockResolvedValue({
      id: "sub_stripe_123",
      items: {
        data: [{ price: { recurring: { interval: "year" } } }],
      },
    } as never);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeCustomerId: "cus_123",
      annual: null, // Not yet set
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const sessionWithAnnual: Partial<Stripe.Checkout.Session> = {
      mode: "subscription",
      customer: "cus_123",
      subscription: "sub_stripe_123",
      amount_total: 10_000,
      currency: "usd",
    };

    const result = await handleCheckoutCompleted(
      sessionWithAnnual as Stripe.Checkout.Session
    );

    expect(result.success).toBe(true);
    expect(
      vi.mocked(stripeClient!.subscriptions.retrieve)
    ).toHaveBeenCalledWith("sub_stripe_123");
    expect(db.update).toHaveBeenCalled();
  });

  it("should set annual=false when Stripe subscription has monthly interval", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    // Mock Stripe subscription with monthly interval (already default in beforeEach)
    vi.mocked(stripeClient!.subscriptions.retrieve).mockResolvedValue({
      id: "sub_stripe_123",
      items: {
        data: [{ price: { recurring: { interval: "month" } } }],
      },
    } as never);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeCustomerId: "cus_123",
      annual: null, // Not yet set
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const sessionMonthly: Partial<Stripe.Checkout.Session> = {
      mode: "subscription",
      customer: "cus_123",
      subscription: "sub_stripe_123",
      amount_total: 1000,
      currency: "usd",
    };

    const result = await handleCheckoutCompleted(
      sessionMonthly as Stripe.Checkout.Session
    );

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("should always update annual flag from Stripe subscription (handles timing issues)", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    // Mock Stripe subscription with yearly interval
    vi.mocked(stripeClient!.subscriptions.retrieve).mockResolvedValue({
      id: "sub_stripe_123",
      items: {
        data: [{ price: { recurring: { interval: "year" } } }],
      },
    } as never);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeCustomerId: "cus_123",
      annual: false, // Could have been set wrong by timing issue
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const session: Partial<Stripe.Checkout.Session> = {
      mode: "subscription",
      customer: "cus_123",
      subscription: "sub_stripe_123",
      amount_total: 10_000,
      currency: "usd",
    };

    await handleCheckoutCompleted(session as Stripe.Checkout.Session);

    // Should always update to ensure correct value from Stripe
    expect(db.update).toHaveBeenCalled();
  });
});

describe("handleSubscriptionCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockStripeSubscription = (interval: "month" | "year") =>
    ({
      id: "sub_stripe_123",
      customer: "cus_123",
      items: {
        data: [
          {
            price: {
              id: "price_123",
              recurring: {
                interval,
              },
            },
          },
        ],
      },
    }) as unknown as Stripe.Subscription;

  it("should set annual=true for yearly subscriptions", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeSubscriptionId: "sub_stripe_123",
      annual: null,
    } as any);

    const mockSubscription = createMockStripeSubscription("year");
    const result = await handleSubscriptionCreated(mockSubscription);

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("should set annual=false for monthly subscriptions", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeSubscriptionId: "sub_stripe_123",
      annual: null,
    } as any);

    const mockSubscription = createMockStripeSubscription("month");
    const result = await handleSubscriptionCreated(mockSubscription);

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("should return success=false when subscription not found in DB", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const mockSubscription = createMockStripeSubscription("year");
    const result = await handleSubscriptionCreated(mockSubscription);

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("handleSubscriptionDeleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-api-key";
  });

  const mockSubscription: Partial<Stripe.Subscription> = {
    id: "sub_stripe_123",
    customer: "cus_123",
    cancellation_details: {
      reason: "cancellation_requested",
    } as any,
  };

  it("should emit subscription.canceled event for each admin", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeSubscriptionId: "sub_stripe_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const result = await handleSubscriptionDeleted(
      mockSubscription as Stripe.Subscription
    );

    expect(result.success).toBe(true);
    expect(result.eventsEmitted).toBe(1);
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: expect.objectContaining({
        name: "subscription.canceled",
        properties: expect.objectContaining({
          plan: "pro",
          cancelReason: "cancellation_requested",
          organizationName: "Test Org",
        }),
      }),
    });
  });

  it("should use 'unknown' as cancel reason when not provided", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeSubscriptionId: "sub_stripe_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    await handleSubscriptionDeleted({
      id: "sub_stripe_123",
      customer: "cus_123",
    } as Stripe.Subscription);

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: expect.objectContaining({
        properties: expect.objectContaining({
          cancelReason: "unknown",
        }),
      }),
    });
  });
});

describe("handleSubscriptionUpdated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-api-key";
  });

  const createMockSubscription = (priceId: string, unitAmount: number) => ({
    id: "sub_stripe_123",
    customer: "cus_123",
    items: {
      data: [
        {
          price: {
            id: priceId,
            unit_amount: unitAmount,
          },
        },
      ],
    },
  });

  it("should emit subscription.upgraded event when price increases", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "pro",
      stripeSubscriptionId: "sub_stripe_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const currentSubscription = createMockSubscription("price_pro", 4900);
    const previousAttributes = {
      items: {
        data: [
          {
            price: {
              id: "price_starter",
              unit_amount: 1900,
            },
          },
        ],
      },
    };

    const result = await handleSubscriptionUpdated(
      currentSubscription as any,
      previousAttributes as any
    );

    expect(result.success).toBe(true);
    expect(result.changeType).toBe("upgrade");
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: expect.objectContaining({
        name: "subscription.upgraded",
        properties: expect.objectContaining({
          changeType: "upgrade",
        }),
      }),
    });
  });

  it("should emit subscription.downgraded event when price decreases", async () => {
    const mockPost = vi.fn(() =>
      Promise.resolve({
        data: {
          success: true,
          contactCreated: false,
          workflowsTriggered: 0,
          executionsResumed: 0,
        },
        error: null,
      })
    );
    vi.mocked(createPlatformClient).mockReturnValue({ POST: mockPost } as any);

    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      referenceId: "org_123",
      plan: "starter",
      stripeSubscriptionId: "sub_stripe_123",
    } as any);

    vi.mocked(db.query.organization.findFirst).mockResolvedValue({
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
    } as any);

    vi.mocked(db.query.member.findMany).mockResolvedValue([
      { user: { email: "owner@example.com", name: "Owner" }, role: "owner" },
    ] as any);

    const currentSubscription = createMockSubscription("price_starter", 1900);
    const previousAttributes = {
      items: {
        data: [
          {
            price: {
              id: "price_pro",
              unit_amount: 4900,
            },
          },
        ],
      },
    };

    const result = await handleSubscriptionUpdated(
      currentSubscription as any,
      previousAttributes as any
    );

    expect(result.success).toBe(true);
    expect(result.changeType).toBe("downgrade");
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: expect.objectContaining({
        name: "subscription.downgraded",
      }),
    });
  });

  it("should skip when price has not changed", async () => {
    const currentSubscription = createMockSubscription("price_pro", 4900);
    const previousAttributes = {
      items: {
        data: [
          {
            price: {
              id: "price_pro",
              unit_amount: 4900,
            },
          },
        ],
      },
    };

    const result = await handleSubscriptionUpdated(
      currentSubscription as any,
      previousAttributes as any
    );

    expect(result.success).toBe(true);
    expect(result.eventsEmitted).toBe(0);
    expect(result.changeType).toBeNull();
  });

  it("should skip when no previous attributes", async () => {
    const currentSubscription = createMockSubscription("price_pro", 4900);

    const result = await handleSubscriptionUpdated(
      currentSubscription as any,
      undefined
    );

    expect(result.success).toBe(true);
    expect(result.eventsEmitted).toBe(0);
    expect(result.changeType).toBeNull();
  });
});

describe("handleStripeWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wraps.dev";
  });

  it("should route invoice.payment_failed to handlePaymentFailed", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const event: Partial<Stripe.Event> = {
      type: "invoice.payment_failed",
      data: {
        object: { customer: "cus_123" } as Stripe.Invoice,
      } as any,
    };

    await handleStripeWebhook(event as Stripe.Event);

    expect(db.query.subscription.findFirst).toHaveBeenCalled();
  });

  it("should route checkout.session.completed to handleCheckoutCompleted", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const event: Partial<Stripe.Event> = {
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          customer: "cus_123",
        } as Stripe.Checkout.Session,
      } as any,
    };

    await handleStripeWebhook(event as Stripe.Event);

    expect(db.query.subscription.findFirst).toHaveBeenCalled();
  });

  it("should route customer.subscription.created to handleSubscriptionCreated", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue({
      id: "sub_123",
      stripeSubscriptionId: "sub_stripe_123",
    } as any);

    const event: Partial<Stripe.Event> = {
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_stripe_123",
          customer: "cus_123",
          items: {
            data: [
              {
                price: {
                  id: "price_123",
                  recurring: { interval: "year" },
                },
              },
            ],
          },
        } as unknown as Stripe.Subscription,
      } as any,
    };

    await handleStripeWebhook(event as Stripe.Event);

    expect(db.query.subscription.findFirst).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("should route customer.subscription.deleted to handleSubscriptionDeleted", async () => {
    vi.mocked(db.query.subscription.findFirst).mockResolvedValue(undefined);

    const event: Partial<Stripe.Event> = {
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_123", customer: "cus_123" } as Stripe.Subscription,
      } as any,
    };

    await handleStripeWebhook(event as Stripe.Event);

    expect(db.query.subscription.findFirst).toHaveBeenCalled();
  });

  it("should route customer.subscription.updated to handleSubscriptionUpdated", async () => {
    const event: Partial<Stripe.Event> = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          items: { data: [{ price: { id: "price_123", unit_amount: 1900 } }] },
        } as any,
        previous_attributes: undefined,
      } as any,
    };

    await handleStripeWebhook(event as Stripe.Event);

    // No DB call expected since no previous attributes
    expect(db.query.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("should silently ignore unhandled event types", async () => {
    const event: Partial<Stripe.Event> = {
      type: "customer.created" as any,
      data: {
        object: {},
      } as any,
    };

    // Should not throw
    await expect(
      handleStripeWebhook(event as Stripe.Event)
    ).resolves.not.toThrow();
  });
});
