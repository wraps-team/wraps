import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      subscription: { findFirst: vi.fn() },
      organization: { findFirst: vi.fn() },
      member: { findMany: vi.fn() },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
  eq: vi.fn(),
}));

vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(() =>
    Promise.resolve({ sendTemplate: vi.fn(() => Promise.resolve()) })
  ),
}));

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    POST: vi.fn(() => Promise.resolve({ error: null })),
  })),
}));

vi.mock("../index", () => ({
  stripeClient: {
    subscriptions: { retrieve: vi.fn() },
  },
}));

import { onStripeEvent } from "../stripe-webhooks";

describe("onStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("must propagate errors so Stripe retries on failure", async () => {
    // If the handler throws, the onEvent wrapper must NOT swallow the error.
    // Swallowing causes Stripe to see 200 and skip retry — customer pays but plan never activates.
    const event = {
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_explode" } },
    } as unknown as Stripe.Event;

    // Mock the DB call inside handlePaymentFailed to throw
    const { db } = await import("@wraps/db");
    vi.mocked(db.query.subscription.findFirst).mockRejectedValue(
      new Error("DB connection lost")
    );

    await expect(onStripeEvent(event)).rejects.toThrow("DB connection lost");
  });

  it("should log errors before re-throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const event = {
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_explode" } },
    } as unknown as Stripe.Event;

    const { db } = await import("@wraps/db");
    vi.mocked(db.query.subscription.findFirst).mockRejectedValue(
      new Error("DB connection lost")
    );

    await expect(onStripeEvent(event)).rejects.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Stripe webhook")
    );

    consoleSpy.mockRestore();
  });
});
