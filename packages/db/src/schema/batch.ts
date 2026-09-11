import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { awsAccount } from "./app";
import { organization, user } from "./auth";
import { contact } from "./contacts";
import { template } from "./templates";
import { workflowExecution } from "./workflows";

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Channel type - forward-compatible with SMS (Phase 3)
 */
export type Channel = "email" | "sms";

/**
 * Batch send status
 */
export const batchSendStatusEnum = pgEnum("batch_send_status", [
  "draft",
  "scheduled", // Waiting for scheduled time (EventBridge Scheduler)
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

/**
 * Message send status
 */
export const messageSendStatusEnum = pgEnum("message_send_status", [
  "pending",
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed", // SES suppression list
  "failed",
  "opted_out", // SMS specific
]);

// Statuses meaning SES has NOT accepted the message; every other status is a
// post-acceptance refinement of 'sent'. Shared by the broadcast report
// aggregation and the worker's completion-time counter reconciliation so the
// two can never disagree when a new status is added.
export const MESSAGE_SEND_UNACCEPTED_STATUSES = [
  "pending",
  "queued",
  "failed",
  "opted_out",
] as const;

/**
 * Message source type
 */
export const messageSourceTypeEnum = pgEnum("message_source_type", [
  "transactional",
  "batch",
  "campaign",
  "workflow",
]);

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SEND TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batch Send
 *
 * Tracks batch email/SMS jobs. Starter tier can send to ALL contacts.
 * Campaign targeting (segments, topics) is Pro+ feature.
 */
export const batchSend = pgTable(
  "batch_send",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    awsAccountId: text("aws_account_id").references(() => awsAccount.id, {
      onDelete: "set null",
    }),

    name: text("name"),

    // ═══════════════════════════════════════════════════════════════════════
    // CHANNEL SELECTION (explicit, forward-compatible with SMS)
    // ═══════════════════════════════════════════════════════════════════════
    channel: text("channel").$type<Channel>().default("email").notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // EMAIL-SPECIFIC FIELDS (Phase 1)
    // ═══════════════════════════════════════════════════════════════════════
    subject: text("subject"),
    previewText: text("preview_text"),
    from: text("from"),
    fromName: text("from_name"),
    replyTo: text("reply_to"),
    emailTemplateId: text("email_template_id").references(() => template.id, {
      onDelete: "set null",
    }),
    htmlContent: text("html_content"),
    textContent: text("text_content"),

    // Variable mappings for custom template variables
    variableMappings:
      json("variable_mappings").$type<
        Array<{
          variableName: string;
          source:
            | { type: "static"; value: string }
            | { type: "contact"; field: string };
        }>
      >(),

    // ═══════════════════════════════════════════════════════════════════════
    // SMS-SPECIFIC FIELDS (Phase 3 - nullable for now)
    // ═══════════════════════════════════════════════════════════════════════
    body: text("body"), // SMS body text
    senderId: text("sender_id"), // Phone number or alphanumeric sender ID
    // smsTemplateId will be added in Phase 3 when smsTemplate table exists

    // ═══════════════════════════════════════════════════════════════════════
    // RECIPIENT TARGETING
    // ═══════════════════════════════════════════════════════════════════════
    audienceType: text("audience_type")
      .$type<"all" | "topic" | "segment">()
      .default("all"),
    topicId: text("topic_id"), // For topic-based targeting
    segmentId: text("segment_id"), // For segment-based targeting

    // ═══════════════════════════════════════════════════════════════════════
    // STATUS & PROGRESS
    // ═══════════════════════════════════════════════════════════════════════
    status: batchSendStatusEnum("status").default("draft").notNull(),

    totalRecipients: integer("total_recipients").default(0).notNull(),
    processedRecipients: integer("processed_recipients").default(0).notNull(),
    sent: integer("sent").default(0).notNull(),
    delivered: integer("delivered").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),

    // Email-specific stats (Phase 1)
    opened: integer("opened").default(0).notNull(),
    clicked: integer("clicked").default(0).notNull(),
    bounced: integer("bounced").default(0).notNull(),
    complained: integer("complained").default(0).notNull(),
    suppressed: integer("suppressed").default(0).notNull(),

    // SMS-specific stats (Phase 3)
    smsSegments: integer("sms_segments").default(0).notNull(), // Total SMS segments
    smsOptedOut: integer("sms_opted_out").default(0).notNull(),

    // Error tracking
    errorMessage: text("error_message"),
    errorDetails: json("error_details").$type<Record<string, unknown>>(),

    // Why the worker is currently re-enqueueing this batch without sending.
    // NULL = not paused. Values: 'quota_reserve' | 'daily_quota'.
    // Deliberately not a status enum value — 163 excluded a `paused` status to
    // avoid an enum migration and downstream UI states.
    pausedReason: text("paused_reason"),

    // Liveness heartbeat for the pause loop, rewritten on EVERY paused cycle.
    //
    // A pause re-enqueues the same chunk on a 900s delay and returns before the
    // lastChunkAt write below, so lastChunkAt is stale by design while paused —
    // that staleness is what the quota-stuck alert keys off, which is why the
    // pause path must not touch it. But it also means a paused batch whose
    // re-enqueued message is LOST looks identical to one that is pausing
    // normally, and the broadcast stalls forever with nothing able to tell the
    // difference. This column is that difference: it advances every ~15 minutes
    // while the pause loop is alive, and goes stale only when the chain is dead.
    //
    // NULL on a paused batch means "paused by a build that predates this
    // column" — broadcast-reaper deliberately declines to revive those rather
    // than risk double-enqueueing a live chain.
    pausedAt: timestamp("paused_at"),

    // ═══════════════════════════════════════════════════════════════════════
    // RESUME / HEARTBEAT POINTER
    // Written by the worker after each successful chunk. Read by the DLQ
    // consumer and the manual resume endpoint to find where to pick up.
    // ═══════════════════════════════════════════════════════════════════════
    lastChunkAt: timestamp("last_chunk_at"),
    lastChunkIndex: integer("last_chunk_index"),
    lastCursor: json("last_cursor").$type<{ id: string } | null>(),

    // Set by the worker on chunk 0. Every recipient query is bounded by
    // `contact.created_at <= audienceSnapshotAt`, so a send spanning days
    // cannot sweep in contacts created after it started. NULL = legacy
    // behavior (unbounded), so batches in flight at deploy time are unaffected.
    audienceSnapshotAt: timestamp("audience_snapshot_at"),

    // ═══════════════════════════════════════════════════════════════════════
    // TIMING
    // ═══════════════════════════════════════════════════════════════════════
    scheduledFor: timestamp("scheduled_for"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),

    // ═══════════════════════════════════════════════════════════════════════
    // AUDIT
    // ═══════════════════════════════════════════════════════════════════════
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("batch_send_org_idx").on(table.organizationId),
    index("batch_send_channel_idx").on(table.channel),
    index("batch_send_status_idx").on(table.organizationId, table.status),
    index("batch_send_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE SEND TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Message Send
 *
 * Unified table for tracking individual email/SMS sends.
 * Records every message sent through the platform for analytics and history.
 */
export const messageSend = pgTable(
  "message_send",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),

    awsAccountId: text("aws_account_id").references(() => awsAccount.id, {
      onDelete: "set null",
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // CHANNEL
    // ═══════════════════════════════════════════════════════════════════════
    channel: text("channel").$type<Channel>().default("email").notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // SOURCE TRACKING
    // ═══════════════════════════════════════════════════════════════════════
    sourceType: messageSourceTypeEnum("source_type").notNull(),
    batchSendId: text("batch_send_id").references(() => batchSend.id, {
      onDelete: "set null",
    }),
    // campaignId and workflowId will be added when those features are implemented
    // campaignId: text("campaign_id").references(() => campaign.id),
    // workflowId: text("workflow_id").references(() => workflow.id),
    workflowExecutionId: text("workflow_execution_id").references(
      () => workflowExecution.id,
      { onDelete: "set null" }
    ),
    // Workflow step id (from WorkflowStep.id), NULL for non-workflow sends and
    // for every historical workflow row. Paired with workflowExecutionId as
    // the dedup key for workflow claim-before-send (plan 034) — a single
    // execution can run multiple send_email steps, so workflowExecutionId
    // alone is not a valid dedup key.
    stepId: text("step_id"),

    // ═══════════════════════════════════════════════════════════════════════
    // RECIPIENT (denormalized for history)
    // ═══════════════════════════════════════════════════════════════════════
    recipient: text("recipient").notNull(), // Email address or phone number

    // ═══════════════════════════════════════════════════════════════════════
    // EMAIL-SPECIFIC FIELDS
    // ═══════════════════════════════════════════════════════════════════════
    subject: text("subject"),
    from: text("from"),
    fromName: text("from_name"),
    emailTemplateId: text("email_template_id").references(() => template.id, {
      onDelete: "set null",
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // SMS-SPECIFIC FIELDS (Phase 3)
    // ═══════════════════════════════════════════════════════════════════════
    body: text("body"), // SMS body or inline email body
    senderId: text("sender_id"),
    // smsTemplateId will be added in Phase 3
    smsSegmentCount: integer("sms_segment_count"), // Number of SMS segments

    // ═══════════════════════════════════════════════════════════════════════
    // VARIABLES (template merge fields)
    // ═══════════════════════════════════════════════════════════════════════
    variables: json("variables").$type<Record<string, unknown>>().default({}),

    // ═══════════════════════════════════════════════════════════════════════
    // AWS CORRELATION
    // ═══════════════════════════════════════════════════════════════════════
    messageId: text("message_id"), // SES Message ID or EUM Message ID

    // ═══════════════════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════════════════
    status: messageSendStatusEnum("status").default("pending").notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // TIMESTAMPS
    // ═══════════════════════════════════════════════════════════════════════
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    // Email-specific
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    bouncedAt: timestamp("bounced_at"),
    complainedAt: timestamp("complained_at"),
    suppressedAt: timestamp("suppressed_at"),
    // SMS-specific
    optedOutAt: timestamp("opted_out_at"),

    // ═══════════════════════════════════════════════════════════════════════
    // ENGAGEMENT METADATA (from SES event callbacks)
    // User agent only — used to filter bot opens out of open-rate metrics.
    // SES also reports the recipient's IP; we deliberately don't store it.
    // ═══════════════════════════════════════════════════════════════════════
    openUserAgent: text("open_user_agent"),
    clickUserAgent: text("click_user_agent"),

    // ═══════════════════════════════════════════════════════════════════════
    // CLAIM TRACKING (idempotency — set on claim-insert and re-claim)
    // ═══════════════════════════════════════════════════════════════════════
    claimedAt: timestamp("claimed_at"), // set on claim-insert and on every re-claim; staleness gate for crash recovery

    // ═══════════════════════════════════════════════════════════════════════
    // ERROR TRACKING
    // ═══════════════════════════════════════════════════════════════════════
    error: text("error"),
    bounceType: text("bounce_type"), // Email: Permanent, Transient
    bounceSubType: text("bounce_sub_type"), // Email: detailed bounce reason
    clickedUrl: text("clicked_url"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("message_send_org_idx").on(table.organizationId),
    index("message_send_contact_idx").on(table.contactId),
    index("message_send_channel_idx").on(table.channel),
    index("message_send_batch_idx").on(table.batchSendId),
    index("message_send_workflow_execution_idx").on(table.workflowExecutionId),
    index("message_send_status_idx").on(table.batchSendId, table.status),
    uniqueIndex("message_send_message_id_idx").on(table.messageId),
    index("message_send_source_type_idx").on(table.sourceType),
    index("message_send_created_at_idx").on(table.createdAt),
    // Composite index for email log pagination queries (org-scoped, sorted by createdAt)
    // Created in production via packages/db/scripts/create-email-log-index.ts
    // (CONCURRENTLY) — schema declared here as source of truth.
    index("message_send_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    // Dedup guard for SQS retries and DLQ replays. Partial on contactId because
    // transactional sends (workflows, cold emails) have no contactId.
    // Created in production via packages/db/scripts/create-broadcast-resume-indexes.ts
    // (CONCURRENTLY) — schema declared here as source of truth.
    uniqueIndex("message_send_dedup_idx")
      .on(table.batchSendId, table.contactId)
      .where(sql`contact_id IS NOT NULL`),
    // Workflow-send dedup guard (plan 034), mirroring message_send_dedup_idx
    // above. Partial on both columns because historical workflow rows have
    // step_id IS NULL (added after the fact) and non-workflow rows have
    // workflow_execution_id IS NULL — neither should collide under this index.
    // Created in production via
    // packages/db/scripts/create-workflow-step-dedup-index.ts (CONCURRENTLY)
    // — schema declared here as source of truth.
    uniqueIndex("message_send_workflow_step_dedup_idx")
      .on(table.workflowExecutionId, table.stepId)
      .where(sql`workflow_execution_id IS NOT NULL AND step_id IS NOT NULL`),
    // Covers the /emails dashboard query: org + channel (email/sms) + time window + status filter.
    // message_send_org_created_idx uses created_at but the query filters on sent_at — wrong column.
    // Created in production via packages/db/scripts/create-email-sent-at-idx.ts
    // (CONCURRENTLY) — schema declared here as source of truth.
    index("message_send_org_channel_sent_at_idx").on(
      table.organizationId,
      table.channel,
      table.sentAt
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const batchSendRelations = relations(batchSend, ({ one, many }) => ({
  organization: one(organization, {
    fields: [batchSend.organizationId],
    references: [organization.id],
  }),
  awsAccount: one(awsAccount, {
    fields: [batchSend.awsAccountId],
    references: [awsAccount.id],
  }),
  emailTemplate: one(template, {
    fields: [batchSend.emailTemplateId],
    references: [template.id],
  }),
  createdByUser: one(user, {
    fields: [batchSend.createdBy],
    references: [user.id],
  }),
  messageSends: many(messageSend),
}));

export const messageSendRelations = relations(messageSend, ({ one }) => ({
  organization: one(organization, {
    fields: [messageSend.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [messageSend.contactId],
    references: [contact.id],
  }),
  awsAccount: one(awsAccount, {
    fields: [messageSend.awsAccountId],
    references: [awsAccount.id],
  }),
  batchSend: one(batchSend, {
    fields: [messageSend.batchSendId],
    references: [batchSend.id],
  }),
  workflowExecution: one(workflowExecution, {
    fields: [messageSend.workflowExecutionId],
    references: [workflowExecution.id],
  }),
  emailTemplate: one(template, {
    fields: [messageSend.emailTemplateId],
    references: [template.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BatchSend = typeof batchSend.$inferSelect;
export type NewBatchSend = typeof batchSend.$inferInsert;
export type BatchSendStatus = BatchSend["status"];

export type MessageSend = typeof messageSend.$inferSelect;
export type NewMessageSend = typeof messageSend.$inferInsert;
export type MessageSendStatus = MessageSend["status"];
export type MessageSourceType = MessageSend["sourceType"];
