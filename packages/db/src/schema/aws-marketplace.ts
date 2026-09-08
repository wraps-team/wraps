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

    // Null between the Marketplace POST and the buyer finishing registration.
    // A buyer can abandon the form, so this row has to stand on its own.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),

    // Captured on the registration form. Required by AWS: the registration page
    // must collect the buyer's email address.
    contactEmail: text("contact_email"),

    // pending | active | unsubscribe-pending | unsubscribed | failed
    //
    // Driven by EventBridge lifecycle events, NOT by the registration POST —
    // AWS is explicit that resources must not be provisioned before
    // subscribe-success arrives.
    status: text("status").notNull().default("pending"),

    // "free-trial" when AWS appends x-amzn-marketplace-offer-type.
    offerType: text("offer_type"),

    resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
    registeredAt: timestamp("registered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("aws_marketplace_subscription_organization_id_idx").on(
      table.organizationId
    ),
    // Lifecycle events arrive keyed by account + product, not by licenseArn.
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
