import { db, eq } from "@wraps/db";
import * as schema from "@wraps/db/schema/auth";
import { getWrapsClient } from "@wraps/email";
import { createPlatformClient } from "@wraps.dev/client";
import { PostHog } from "posthog-node";
import type Stripe from "stripe";
import { stripeClient } from "./index";

const structuredLog = (msg: string, data?: Record<string, unknown>) =>
  console.info(JSON.stringify({ msg, ...data }));
const structuredError = (
  msg: string,
  error?: unknown,
  data?: Record<string, unknown>
) => console.error(JSON.stringify({ msg, error: String(error), ...data }));

// PostHog client for subscription tracking (lazy singleton)
let posthogClient: PostHog | null = null;

// Get PostHog host URL for server-side usage
// The NEXT_PUBLIC_POSTHOG_HOST may be set to "/ingest" for client-side proxy,
// but server-side needs the full URL
function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  // If host is a relative path (starts with /), use the full PostHog URL
  if (!host || host.startsWith("/")) {
    return "https://us.i.posthog.com";
  }
  return host;
}

function getPostHogClient(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null;
  }
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: getPostHogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/** Fire-and-forget PostHog capture for subscription events. Never throws. */
function capturePostHog(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>
) {
  try {
    const posthog = getPostHogClient();
    if (!posthog) {
      return;
    }
    posthog.capture({ distinctId, event, properties });
  } catch {
    // intentionally swallowed
  }
}

/**
 * Emit a subscription lifecycle event to the Platform API.
 * This allows workflows to be triggered for subscription changes.
 * Auto-creates the contact if it doesn't exist.
 */
export async function emitSubscriptionEvent(
  eventName: string,
  adminEmail: string,
  properties: Record<string, unknown>,
  adminName?: string | null
): Promise<boolean> {
  try {
    const apiKey = process.env.WRAPS_API_KEY;
    if (!apiKey) {
      console.warn("WRAPS_API_KEY not configured, skipping subscription event");
      return false;
    }

    const client = createPlatformClient({ apiKey });
    const normalizedEmail = adminEmail.toLowerCase().trim();

    // Emit the subscription event, auto-creating contact if missing
    const { data, error } = await client.POST("/v1/events/", {
      body: {
        name: eventName,
        contactEmail: normalizedEmail,
        contactName: adminName || undefined,
        createIfMissing: true,
        properties,
      },
    });

    if (error) {
      console.error(`Failed to emit ${eventName} event:`, error);
      return false;
    }

    const responseData = data as { contactCreated?: boolean } | undefined;
    if (responseData?.contactCreated) {
      structuredLog("Created contact", { email: normalizedEmail });
    }
    structuredLog("Emitted subscription event", {
      eventName,
      email: normalizedEmail,
    });
    return true;
  } catch (err) {
    console.error(`Error emitting ${eventName} event:`, err);
    return false;
  }
}

/**
 * Get organization admins for a subscription.
 * Returns the organization and list of admin/owner members.
 */
export async function getSubscriptionOrgAdmins(subscriptionQuery: {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}): Promise<{
  subscription: typeof schema.subscription.$inferSelect | null;
  organization: typeof schema.organization.$inferSelect | null;
  admins: Array<{
    user: typeof schema.user.$inferSelect | null;
    role: string;
  }>;
}> {
  // Find subscription
  let sub: typeof schema.subscription.$inferSelect | null = null;

  if (subscriptionQuery.stripeCustomerId) {
    sub =
      (await db.query.subscription.findFirst({
        where: eq(
          schema.subscription.stripeCustomerId,
          subscriptionQuery.stripeCustomerId
        ),
      })) ?? null;
  } else if (subscriptionQuery.stripeSubscriptionId) {
    sub =
      (await db.query.subscription.findFirst({
        where: eq(
          schema.subscription.stripeSubscriptionId,
          subscriptionQuery.stripeSubscriptionId
        ),
      })) ?? null;
  }

  if (!sub) {
    return { subscription: null, organization: null, admins: [] };
  }

  // Get organization
  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, sub.referenceId),
  });

  if (!org) {
    return { subscription: sub, organization: null, admins: [] };
  }

  // Get admin members
  const members = await db.query.member.findMany({
    where: eq(schema.member.organizationId, org.id),
    with: {
      user: true,
    },
  });

  const admins = members
    .filter((m) => m.role === "owner" || m.role === "admin")
    .map((m) => ({ user: m.user, role: m.role }));

  return { subscription: sub, organization: org, admins };
}

/**
 * Handle invoice.payment_failed webhook event.
 * Sends payment failure emails to organization admins.
 */
export async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<{ success: boolean; notifiedCount: number }> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) {
    structuredError("Payment failed webhook: no customer ID");
    return { success: false, notifiedCount: 0 };
  }

  const {
    subscription: sub,
    organization: org,
    admins,
  } = await getSubscriptionOrgAdmins({ stripeCustomerId: customerId });

  if (!sub) {
    structuredError("Payment failed webhook: no subscription", undefined, {
      customerId,
    });
    return { success: false, notifiedCount: 0 };
  }

  if (!org) {
    structuredError("Payment failed webhook: no organization", undefined, {
      referenceId: sub.referenceId,
    });
    return { success: false, notifiedCount: 0 };
  }

  if (admins.length === 0) {
    structuredError("Payment failed webhook: no admins", undefined, {
      orgId: org.id,
    });
    return { success: false, notifiedCount: 0 };
  }

  // Format amount
  const amount = (invoice.amount_due / 100).toFixed(2);
  const currency = invoice.currency.toUpperCase();

  // Build billing URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.wraps.dev";
  const billingUrl = `${appUrl}/${org.slug}/settings/billing`;

  // In-app notification: org fan-out to owners/admins (better-inbox).
  // Lazy import — this module is imported by ./index, so a static import
  // of `auth` would be circular.
  try {
    const { auth } = await import("./index");
    // `auth` is declared with the wide BetterAuthOptions generic (the
    // repo's TS2742 workaround), which erases plugin endpoint types —
    // cast the one better-inbox endpoint we call.
    const { notify } = auth.api as unknown as {
      notify: (input: {
        body: {
          organizationId: string;
          roles?: string[];
          type: string;
          title: string;
          body?: string;
          href?: string;
        };
      }) => Promise<{ count: number }>;
    };
    await notify({
      body: {
        organizationId: org.id,
        roles: ["owner", "admin"],
        type: "billing.payment_failed",
        title: `Payment failed — ${currency} ${amount} for ${org.name}`,
        body: "Update your payment method to keep sending.",
        href: `/${org.slug}/settings/billing`,
      },
    });
  } catch (notifyError) {
    structuredError(
      "Failed to create payment-failed notifications",
      notifyError,
      {
        orgId: org.id,
      }
    );
  }

  // Send payment failed email to all admins
  const wraps = await getWrapsClient();
  let notifiedCount = 0;

  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }

    try {
      await wraps.sendTemplate({
        from: "Wraps <billing@wraps.dev>",
        to: admin.user.email,
        template: "payment-failure",
        templateData: {
          name: admin.user.name || "there",
          amount: `${currency} ${amount}`,
          organizationName: org.name,
          billingUrl,
          invoiceUrl: invoice.hosted_invoice_url || undefined,
        },
      });
      notifiedCount++;
    } catch (emailError) {
      console.error(
        `Failed to send payment failed email to ${admin.user.email}:`,
        emailError
      );
      const posthog = getPostHogClient();
      posthog?.captureException(
        emailError instanceof Error
          ? emailError
          : new Error(String(emailError)),
        admin.user.email,
        {
          context: "payment_failed_notification",
          organizationId: org.id,
        }
      );
    }
  }

  structuredLog("Payment failed notification sent", {
    orgId: org.id,
    orgName: org.name,
  });
  return { success: true, notifiedCount };
}

/**
 * Handle checkout.session.completed webhook event.
 * Emits subscription.activated event for workflow triggers.
 * Also sets the annual billing flag if not already set.
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<{ success: boolean; eventsEmitted: number }> {
  // Only handle subscription checkouts
  if (session.mode !== "subscription") {
    return { success: true, eventsEmitted: 0 };
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!customerId) {
    structuredError("Checkout webhook: no customer ID");
    return { success: false, eventsEmitted: 0 };
  }

  const {
    subscription: sub,
    organization: org,
    admins,
  } = await getSubscriptionOrgAdmins({ stripeCustomerId: customerId });

  if (!sub) {
    console.error(
      `Checkout completed webhook: No subscription found for customer ${customerId}`
    );
    return { success: false, eventsEmitted: 0 };
  }

  if (!org) {
    console.error(
      `Checkout completed webhook: No organization found for ${sub.referenceId}`
    );
    return { success: false, eventsEmitted: 0 };
  }

  // Determine annual billing from the Stripe subscription interval
  // This is more reliable than metadata since better-auth doesn't set metadata
  let isAnnual = false;

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (stripeSubscriptionId && stripeClient) {
    try {
      const stripeSubscription =
        await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
      const interval =
        stripeSubscription.items.data[0]?.price.recurring?.interval;
      isAnnual = interval === "year";
    } catch (err) {
      console.error("Failed to fetch subscription from Stripe:", err);
      const posthog = getPostHogClient();
      posthog?.captureException(
        err instanceof Error ? err : new Error(String(err)),
        customerId,
        {
          context: "checkout_completed_stripe_fetch",
          stripeSubscriptionId,
        }
      );
      // Fallback to metadata if available
      isAnnual =
        session.metadata?.annual === "true" ||
        session.metadata?.billing_interval === "annual";
    }
  }

  // Always update the annual flag on checkout completion
  // This handles both new subscriptions and cases where subscription.created fired before DB record existed
  await db
    .update(schema.subscription)
    .set({ annual: isAnnual, updatedAt: new Date() })
    .where(eq(schema.subscription.id, sub.id));
  structuredLog("Subscription annual flag set", {
    subscriptionId: sub.id,
    isAnnual,
  });

  // Format amount
  const amount = session.amount_total
    ? (session.amount_total / 100).toFixed(2)
    : "0.00";
  const currency = (session.currency || "usd").toUpperCase();

  // Emit subscription.activated event for each admin
  let eventsEmitted = 0;
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }

    const emitted = await emitSubscriptionEvent(
      "subscription.activated",
      admin.user.email,
      {
        organizationId: org.id,
        organizationName: org.name,
        plan: sub.plan,
        amount: `${currency} ${amount}`,
        annual: isAnnual,
        activatedAt: new Date().toISOString(),
      },
      admin.user.name
    );
    if (emitted) {
      eventsEmitted++;
    }
  }

  // Track in PostHog for activation analytics
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }
    capturePostHog(admin.user.email, "subscription_activated", {
      organization_id: org.id,
      plan: sub.plan,
      annual: isAnnual,
    });
  }

  structuredLog("Subscription activated", {
    orgId: org.id,
    orgName: org.name,
    plan: sub.plan,
    isAnnual,
  });
  return { success: true, eventsEmitted };
}

/**
 * Handle customer.subscription.deleted webhook event.
 * Emits subscription.canceled event for workflow triggers.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<{ success: boolean; eventsEmitted: number }> {
  const {
    subscription: sub,
    organization: org,
    admins,
  } = await getSubscriptionOrgAdmins({
    stripeSubscriptionId: subscription.id,
  });

  if (!sub) {
    console.error(
      `Subscription deleted webhook: No subscription found for ${subscription.id}`
    );
    return { success: false, eventsEmitted: 0 };
  }

  if (!org) {
    console.error(
      `Subscription deleted webhook: No organization found for ${sub.referenceId}`
    );
    return { success: false, eventsEmitted: 0 };
  }

  // Determine cancellation reason
  const cancelReason = subscription.cancellation_details?.reason || "unknown";

  // Emit subscription.canceled event for each admin
  let eventsEmitted = 0;
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }

    const emitted = await emitSubscriptionEvent(
      "subscription.canceled",
      admin.user.email,
      {
        organizationId: org.id,
        organizationName: org.name,
        plan: sub.plan,
        cancelReason,
        canceledAt: new Date().toISOString(),
      },
      admin.user.name
    );
    if (emitted) {
      eventsEmitted++;
    }
  }

  // Track in PostHog for activation analytics
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }
    capturePostHog(admin.user.email, "subscription_canceled", {
      organization_id: org.id,
      plan: sub.plan,
      reason: cancelReason,
    });
  }

  structuredLog("Subscription canceled", {
    orgId: org.id,
    orgName: org.name,
    reason: cancelReason,
  });
  return { success: true, eventsEmitted };
}

/**
 * Handle customer.subscription.updated webhook event.
 * Emits subscription.upgraded or subscription.downgraded events for plan changes.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttributes: Partial<Stripe.Subscription> | undefined
): Promise<{
  success: boolean;
  eventsEmitted: number;
  changeType: string | null;
}> {
  // Check if the plan changed
  const currentPriceId = subscription.items.data[0]?.price.id;
  const previousPriceId = (previousAttributes?.items?.data as any)?.[0]?.price
    ?.id;

  // If no price change, skip
  if (!previousPriceId || currentPriceId === previousPriceId) {
    return { success: true, eventsEmitted: 0, changeType: null };
  }

  const {
    subscription: sub,
    organization: org,
    admins,
  } = await getSubscriptionOrgAdmins({
    stripeSubscriptionId: subscription.id,
  });

  if (!sub) {
    console.error(
      `Subscription updated webhook: No subscription found for ${subscription.id}`
    );
    return { success: false, eventsEmitted: 0, changeType: null };
  }

  if (!org) {
    console.error(
      `Subscription updated webhook: No organization found for ${sub.referenceId}`
    );
    return { success: false, eventsEmitted: 0, changeType: null };
  }

  // Determine if upgrade or downgrade based on price amount
  const currentAmount = subscription.items.data[0]?.price.unit_amount || 0;
  const previousItem = (previousAttributes?.items?.data as any)?.[0];
  const previousAmount = previousItem?.price?.unit_amount || 0;

  const isUpgrade = currentAmount > previousAmount;
  const eventName = isUpgrade
    ? "subscription.upgraded"
    : "subscription.downgraded";
  const changeType = isUpgrade ? "upgrade" : "downgrade";

  // Get previous plan name if available
  const previousPlan = sub.plan; // Current plan in DB might not be updated yet

  // Emit event for each admin
  let eventsEmitted = 0;
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }

    const emitted = await emitSubscriptionEvent(
      eventName,
      admin.user.email,
      {
        organizationId: org.id,
        organizationName: org.name,
        previousPlan,
        newPlan: sub.plan,
        changeType,
        changedAt: new Date().toISOString(),
      },
      admin.user.name
    );
    if (emitted) {
      eventsEmitted++;
    }
  }

  // Track in PostHog for activation analytics
  const posthogEvent = isUpgrade
    ? "subscription_upgraded"
    : "subscription_downgraded";
  for (const admin of admins) {
    if (!admin.user?.email) {
      continue;
    }
    capturePostHog(admin.user.email, posthogEvent, {
      organization_id: org.id,
      from_plan: previousPlan,
      to_plan: sub.plan,
    });
  }

  structuredLog("Subscription changed", {
    changeType,
    orgId: org.id,
    orgName: org.name,
    from: previousPlan,
    to: sub.plan,
  });
  return { success: true, eventsEmitted, changeType };
}

/**
 * Handle customer.subscription.created webhook event.
 * Sets the annual billing flag based on Stripe subscription interval.
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<{ success: boolean }> {
  // Get the billing interval from the price
  const interval = subscription.items.data[0]?.price.recurring?.interval;
  const isAnnual = interval === "year";

  // Find and update the subscription record
  const sub = await db.query.subscription.findFirst({
    where: eq(schema.subscription.stripeSubscriptionId, subscription.id),
  });

  if (!sub) {
    // Subscription might not be in our DB yet - better-auth creates it async
    // We'll also check in handleCheckoutCompleted as a fallback
    structuredLog("Subscription not yet in DB", {
      subscriptionId: subscription.id,
    });
    return { success: false };
  }

  // Update the annual field
  await db
    .update(schema.subscription)
    .set({ annual: isAnnual, updatedAt: new Date() })
    .where(eq(schema.subscription.id, sub.id));

  structuredLog("Subscription billing interval set", {
    subscriptionId: subscription.id,
    isAnnual,
  });
  return { success: true };
}

/**
 * Main webhook event handler for Stripe events.
 * Routes events to appropriate handlers.
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;

    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        event.data.previous_attributes as
          | Partial<Stripe.Subscription>
          | undefined
      );
      break;

    default:
      // Unhandled event type
      break;
  }
}

/**
 * Stripe onEvent callback for better-auth plugin.
 * Logs errors but re-throws so Stripe receives non-200 and retries.
 */
export async function onStripeEvent(event: Stripe.Event): Promise<void> {
  try {
    await handleStripeWebhook(event);
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    throw error;
  }
}
