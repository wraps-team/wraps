import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  invitation,
  member,
  organization,
  statement,
  subscription,
  user,
} from "./auth";
import { contact, topic } from "./contacts";

// Organization extension for usage tracking and onboarding
// Note: Subscription/plan info is in the `subscription` table (Better-Auth Stripe plugin)
export const organizationExtension = pgTable("organization_extension", {
  organizationId: text("organization_id")
    .references(() => organization.id, { onDelete: "cascade" })
    .primaryKey(),

  // Usage tracking
  awsAccountCount: integer("aws_account_count").default(0).notNull(),
  memberCount: integer("member_count").default(1).notNull(),

  // Onboarding tracking
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  onboardingPath: text("onboarding_path"), // "start_building" | "connect_aws" | null

  // Activation tracking
  activationScore: integer("activation_score").default(0).notNull(),
  // Set once, atomically, the first time we emit `activation_first_email_sent`
  // for this org. Gates the event so it fires exactly once per org regardless
  // of which path (web broadcast, workflow, or SDK delivery) observes it first.
  activationFirstEmailTrackedAt: timestamp("activation_first_email_tracked_at"),

  // Sender Defaults (pre-fill for new workflows/broadcasts)
  defaultAwsAccountId: text("default_aws_account_id").references(
    () => awsAccount.id,
    { onDelete: "set null" }
  ),
  defaultFrom: text("default_from"), // e.g., "hello@example.com"
  defaultFromName: text("default_from_name"), // e.g., "Acme Inc"
  defaultReplyTo: text("default_reply_to"), // e.g., "support@example.com"
  defaultSenderId: text("default_sender_id"), // SMS: phone number or alphanumeric ID

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AWS Account Connections
export const awsAccount = pgTable(
  "aws_account",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    accountId: text("account_id").notNull(),
    region: text("region").notNull(),

    // IAM Role for access (AssumeRole)
    roleArn: text("role_arn").notNull(),
    externalId: text("external_id").notNull().unique(),

    // Webhook for SES event delivery
    webhookSecret: text("webhook_secret"), // API key for webhook validation

    // Verification
    // NOTE: both are set at REGISTRATION, before the CLI creates the IAM role,
    // so neither is evidence the role was ever assumable — every connected
    // account carries isVerified=true regardless of whether it works.
    isVerified: boolean("is_verified").default(false).notNull(),
    lastVerifiedAt: timestamp("last_verified_at"),

    // Last time the account-health sweep actually assumed the console-access
    // role AND read SES with it — a real "known good", unlike isVerified above.
    //
    // NULL means no successful check has ever been observed, which covers both
    // the never-finished setup and any account already broken when this column
    // shipped. Those two are indistinguishable from here, so the role_unreachable
    // alert stays silent while NULL: an account that never worked has no
    // regression to report, and telling someone their role "broke" when they
    // never finished connecting it is noise they cannot act on.
    //
    // Self-backfilling: any account whose role does work is stamped on the next
    // hourly sweep and becomes alert-eligible from then on.
    roleLastReachableAt: timestamp("role_last_reachable_at"),

    // Liveness of the SES event feed: bumped (throttled) by the SES webhook
    // route every time an authenticated event arrives for this account.
    // NULL = no event ever received. Used for staleness detection/alerting.
    lastEventReceivedAt: timestamp("last_event_received_at"),

    // Set by the event-feed-staleness cron when the feed is detected stale;
    // cleared when events resume. Drives the dashboard warning banner.
    eventFeedStaleSince: timestamp("event_feed_stale_since"),
    // When the org owner was last emailed about this staleness episode.
    // Cleared together with eventFeedStaleSince so a NEW episode re-alerts.
    eventFeedAlertedAt: timestamp("event_feed_alerted_at"),

    // The verdict the hourly account-health sweep reaches, persisted so the
    // dashboard can answer "am I okay?" with zero AWS calls. Written only on a
    // sweep that successfully assumed the role AND read SES + CloudWatch — the
    // early-return paths (no org slug, role unreachable) deliberately leave the
    // previous verdict in place rather than overwriting it with a false
    // "healthy".
    //
    // NULL = no sweep has ever completed for this account. The UI renders that
    // as "unknown", never as healthy: an account nobody has been able to check
    // is exactly the account most likely to be in trouble.
    healthStatus: text("health_status").$type<
      "healthy" | "at_risk" | "in_danger"
    >(),
    healthCheckedAt: timestamp("health_checked_at"),
    // The numbers behind the verdict, so the UI — and the public API in plan
    // 218 — can explain it without re-reading AWS. Every field here is already
    // on the GetAccount response the sweep holds when it writes this row;
    // storing the raw numbers alongside the derived ratio costs nothing now and
    // saves a second migration later.
    //
    // Rates are DECIMALS (0–1), matching what CloudWatch returns and what the
    // worker compares against — not percentages.
    healthDetail: json("health_detail").$type<{
      bounceRate: number | null;
      complaintRate: number | null;
      quotaUsedRatio: number | null;
      sendingEnabled: boolean | null;
      enforcementStatus: string | null;
      /** SES production access — false means the account is in the sandbox. */
      productionAccessEnabled: boolean | null;
      /** Raw SendQuota figures, so a caller can compute its own headroom. */
      max24HourSend: number | null;
      sentLast24Hours: number | null;
      maxSendRate: number | null;
      /** Machine-readable reasons, worst first. Empty when healthy. */
      reasons: string[];
    }>(),

    // Quick product flags for navigation/menus
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    smsEnabled: boolean("sms_enabled").default(false).notNull(),

    // Emails per 24h held back for transactional traffic. Broadcasts refuse to
    // start (preflight) or pause mid-send (worker) once SES SentLast24Hours
    // would eat into this reserve. NULL/0 = no reserve.
    dailyQuotaReserve: integer("daily_quota_reserve"),

    // Detailed scanned features (populated by "Scan Features" button)
    features: json("features").$type<{
      email?: {
        configSetName?: string;
        sandbox?: boolean;
        archivingEnabled?: boolean;
        archiveArn?: string;
        eventHistoryEnabled?: boolean;
        eventTrackingEnabled?: boolean;
        trackedEvents?: string[];
        customTrackingDomain?: string;
        dedicatedIpCount?: number;
        inboundBucketName?: string;
        identities?: Array<{
          identity: string;
          type: "DOMAIN" | "EMAIL_ADDRESS";
          // The SES configuration set attached to this identity, if any. Used
          // to resolve the per-domain set at send time without deriving a name
          // that may not exist. Absent on rows scanned before this field.
          configSetName?: string;
        }>;
      };
      sms?: {
        enabled?: boolean;
        phoneNumbers?: Array<{
          phoneNumber: string;
          status: string;
          type: string;
          capabilities: string[];
        }>;
        eventHistoryEnabled?: boolean;
        identities?: Array<{
          identity: string;
          type: string;
        }>;
      };
    }>(),

    // Audit
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("aws_account_org_idx").on(table.organizationId),
    externalIdIdx: index("aws_account_external_id_idx").on(table.externalId),
  })
);

// AWS Account Permissions (custom permission system)
export const awsAccountPermission = pgTable(
  "aws_account_permission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),

    awsAccountId: text("aws_account_id")
      .references(() => awsAccount.id, { onDelete: "cascade" })
      .notNull(),

    // Array of permissions: ["view", "send", "manage"]
    permissions: json("permissions").$type<string[]>().notNull(),

    // Audit
    grantedBy: text("granted_by")
      .references(() => user.id)
      .notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("aws_account_permission_user_idx").on(table.userId),
    accountIdx: index("aws_account_permission_account_idx").on(
      table.awsAccountId
    ),
    uniqueUserAccount: uniqueIndex("aws_account_permission_unique_idx").on(
      table.userId,
      table.awsAccountId
    ),
  })
);

// Email Templates
export const emailTemplate = pgTable(
  "email_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    html: text("html"),
    variables: json("variables").default([]),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("email_template_org_idx").on(table.organizationId),
  })
);

// API Keys
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    permissions: json("permissions").default([]),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("api_key_org_idx").on(table.organizationId),
    prefixIdx: index("api_key_prefix_idx").on(table.prefix),
    keyHashIdx: uniqueIndex("api_key_key_hash_idx").on(table.keyHash),
  })
);

// Audit Logs (Enterprise)
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => user.id),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index("audit_log_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

// Drizzle Relations
export const organizationExtensionRelations = relations(
  organizationExtension,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationExtension.organizationId],
      references: [organization.id],
    }),
  })
);

export const organizationRelations = relations(
  organization,
  ({ one, many }) => ({
    // From auth.ts - base relations
    members: many(member),
    invitations: many(invitation),
    statements: many(statement),
    subscriptions: many(subscription),
    // App-specific relations
    extension: one(organizationExtension),
    awsAccounts: many(awsAccount),
    emailTemplates: many(emailTemplate),
    apiKeys: many(apiKey),
    auditLogs: many(auditLog),
    contacts: many(contact),
    topics: many(topic),
  })
);

export const awsAccountRelations = relations(awsAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [awsAccount.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [awsAccount.createdBy],
    references: [user.id],
  }),
  permissions: many(awsAccountPermission),
}));

export const awsAccountPermissionRelations = relations(
  awsAccountPermission,
  ({ one }) => ({
    user: one(user, {
      fields: [awsAccountPermission.userId],
      references: [user.id],
      relationName: "userPermissions",
    }),
    awsAccount: one(awsAccount, {
      fields: [awsAccountPermission.awsAccountId],
      references: [awsAccount.id],
    }),
    grantedByUser: one(user, {
      fields: [awsAccountPermission.grantedBy],
      references: [user.id],
      relationName: "grantedPermissions",
    }),
  })
);

export const emailTemplateRelations = relations(emailTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [emailTemplate.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [emailTemplate.createdBy],
    references: [user.id],
  }),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [apiKey.createdBy],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));
