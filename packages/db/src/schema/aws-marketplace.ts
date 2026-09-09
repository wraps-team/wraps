import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * AWS Marketplace subscriptions.
 *
 * Kept out of the `subscription` table on purpose: that one is owned by
 * better-auth's Stripe plugin, and Marketplace billing never touches Stripe.
 * AWS Marketplace forbids collecting payment details for a listed product, so
 * a buyer who arrives this way has no Stripe customer at all.
 *
 * `licenseArn` is the identity key, not `customerIdentifier`. Concurrent
 * Agreements — mandatory for every SaaS product listed after 2026-06-01 — let a
 * single AWS account hold several live agreements for the same product, so the
 * account id is no longer unique and `customerIdentifier` is not populated for
 * new products at all. It is kept below only because ResolveCustomer still
 * returns it for older listings.
 */
export const awsMarketplaceSubscription = pgTable(
  "aws_marketplace_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // From ResolveCustomer, exchanged for the x-amzn-marketplace-token.
    licenseArn: text("license_arn").notNull().unique(),
    customerAwsAccountId: text("customer_aws_account_id").notNull(),
    productCode: text("product_code").notNull(),
    customerIdentifier: text("customer_identifier"),

    // Purchase Agreement lifecycle events (Created/Ended) carry NO licence ARN
    // — only `agreement.id`. Without this column a cancellation cannot be tied
    // back to a specific agreement, and under Concurrent Agreements one AWS
    // account can hold several at once, so account+product is ambiguous.
    // Populated from the first License event that names it.
    agreementId: text("agreement_id"),

    // EventBridge delivers at-least-once with no ordering guarantee. Events
    // older than this are ignored, so a redelivered "License Updated" cannot
    // resurrect a subscription that was already deprovisioned.
    lastEventAt: timestamp("last_event_at"),

    // DELIBERATE exception to the "every table has a NOT NULL organizationId
    // with onDelete: cascade" rule in packages/db/CLAUDE.md. Do not "fix" it.
    //
    // This row is created at ResolveCustomer time — when a buyer subscribes on
    // AWS Marketplace, which happens BEFORE they have a Wraps account. There is
    // no organization to scope to yet, and a buyer can abandon the form, so the
    // row has to stand on its own.
    //
    // `set null` rather than cascade for the same reason: deleting a Wraps org
    // does not end the agreement on AWS's side, and keeping the row is what
    // lets a later re-registration reconcile against it.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),

    // Captured on the registration form. Required by AWS: the registration page
    // must collect the buyer's email address.
    contactEmail: text("contact_email"),

    // pending | active | unsubscribed | failed
    //
    // Driven by EventBridge lifecycle events, NOT by the registration POST —
    // AWS is explicit that a subscription must not be activated until a
    // `License Updated` event arrives. (`subscribe-success` is the older SNS
    // name; new listings receive EventBridge notifications instead.)
    status: text("status").notNull().default("pending"),

    // "free-trial" when AWS appends x-amzn-marketplace-offer-type.
    offerType: text("offer_type"),

    resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
    registeredAt: timestamp("registered_at"),

    // Set the first time the confirmation email goes out. EventBridge delivers
    // at-least-once, so without this a redelivered activation emails the buyer
    // again every time.
    welcomeEmailSentAt: timestamp("welcome_email_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("aws_marketplace_subscription_organization_id_idx").on(
      table.organizationId
    ),
    // Agreement events correlate by agreement id.
    index("aws_marketplace_subscription_agreement_id_idx").on(
      table.agreementId
    ),
    // Last-resort correlation when an event carries neither licence nor a
    // known agreement id.
    index("aws_marketplace_subscription_account_product_idx").on(
      table.customerAwsAccountId,
      table.productCode
    ),
  ]
);

export type AwsMarketplaceSubscription =
  typeof awsMarketplaceSubscription.$inferSelect;
export type NewAwsMarketplaceSubscription =
  typeof awsMarketplaceSubscription.$inferInsert;
