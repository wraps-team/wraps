import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { awsAccount } from "./app";
import { organization, user } from "./auth";
import { contact, topic } from "./contacts";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Magic field name for cascade engagement conditions */
export const CASCADE_ENGAGEMENT_FIELD = "engagement.status" as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (for JSONB columns)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automation step types available in the builder
 * Slice 1: trigger, send_email, send_sms, delay, exit
 * Slice 2: condition, webhook, update_contact
 * Slice 3: wait_for_event, subscribe_topic, unsubscribe_topic
 */
export type AutomationStepType =
  | "trigger"
  | "send_email"
  | "send_sms"
  | "delay"
  | "exit"
  // Slice 2
  | "condition"
  | "webhook"
  | "update_contact"
  // Slice 3
  | "wait_for_event"
  | "wait_for_email_engagement"
  | "subscribe_topic"
  | "unsubscribe_topic";

/**
 * Trigger types for automation entry points
 * Slice 1: event only
 * Slice 3: segment_entry, segment_exit, schedule, api
 */
export type AutomationTriggerType =
  | "event"
  | "contact_created"
  | "contact_updated"
  | "segment_entry"
  | "segment_exit"
  | "schedule"
  | "api"
  | "topic_subscribed"
  | "topic_unsubscribed";

/**
 * Trigger configuration based on trigger type
 */
export type TriggerConfig = {
  // For event trigger
  eventName?: string;

  // For segment triggers (Slice 3)
  segmentId?: string;

  // For schedule trigger (Slice 3)
  schedule?: string; // Cron expression
  timezone?: string;

  // For topic triggers
  topicId?: string;
};

/**
 * Configuration for each step type
 */
export type AutomationStepConfig =
  | ({ type: "trigger"; triggerType: AutomationTriggerType } & TriggerConfig)
  | {
      type: "send_email";
      templateId: string;
      from?: string;
      fromName?: string;
      replyTo?: string;
      subject?: string;
    }
  | { type: "send_sms"; templateId?: string; body?: string; senderId?: string }
  | {
      type: "delay";
      amount: number;
      unit: "minutes" | "hours" | "days" | "weeks";
    }
  | {
      type: "exit";
      reason?: string;
      markAs?: "completed" | "cancelled" | "failed";
    }
  // Slice 2+
  | { type: "condition"; field: string; operator: string; value: unknown }
  | {
      type: "webhook";
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    }
  | {
      type: "update_contact";
      updates: Array<{ field: string; operation: string; value?: unknown }>;
    }
  | { type: "wait_for_event"; eventName: string; timeoutSeconds?: number }
  | { type: "wait_for_email_engagement"; timeoutSeconds?: number }
  | { type: "subscribe_topic"; topicId: string; channel: "email" | "sms" }
  | { type: "unsubscribe_topic"; topicId: string; channel: "email" | "sms" };

/**
 * A channel in a cascade sequence (mirrors the code API's CascadeChannel)
 */
export type CascadeChannelConfig = {
  /** Stable ID for React key when reordering */
  id?: string;
  type: "email" | "sms";
  templateId?: string;
  body?: string;
  engagement?: "opened" | "clicked";
  waitDuration?: number; // seconds to wait for engagement
};

/**
 * A step in the automation (node on the canvas)
 */
export type AutomationStep = {
  id: string;
  type: AutomationStepType;
  name: string;
  position: { x: number; y: number };
  config: AutomationStepConfig;
  /** If this step belongs to a cascade group, the group's ID */
  cascadeGroupId?: string;
  /** Cascade reconstruction metadata - only set on first step of cascade group */
  cascadeChannels?: CascadeChannelConfig[];
};

/**
 * A transition between steps (edge on the canvas)
 */
export type AutomationTransition = {
  id: string;
  fromStepId: string;
  toStepId: string;
  condition?: {
    branch:
      | "yes"
      | "no"
      | "timeout"
      | "default"
      | "opened"
      | "clicked"
      | "bounced";
  };
};

/**
 * Snapshot of automation definition at execution creation time.
 * Ensures in-flight executions are not corrupted by subsequent edits.
 */
export type AutomationDefinitionSnapshot = {
  steps: AutomationStep[];
  transitions: AutomationTransition[];
  workflowVersion: number;
};

/**
 * Canvas viewport for React Flow
 */
export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automation status
 */
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "enabled",
  "paused",
  "archived",
]);

/**
 * Automation execution status
 */
export const workflowExecutionStatusEnum = pgEnum("workflow_execution_status", [
  "pending",
  "active",
  "paused", // Waiting for delay
  "waiting", // Waiting for event (Slice 3)
  "completed",
  "failed",
  "cancelled",
]);

/**
 * Step execution status
 */
export const workflowStepExecutionStatusEnum = pgEnum(
  "workflow_step_execution_status",
  ["pending", "executing", "completed", "failed", "skipped"]
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION TABLE
// SQL table name stays "workflow" — alias at Drizzle level only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automation
 *
 * Defines a no-code automation with trigger, steps, and transitions.
 * The automation definition (steps/transitions) is stored as JSONB for flexibility.
 */
export const automation = pgTable(
  "workflow",
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

    name: text("name").notNull(),
    description: text("description"),

    // Optional: associate automation with a topic for subscription checks
    topicId: text("topic_id").references(() => topic.id, {
      onDelete: "set null",
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // CANVAS STATE
    // ═══════════════════════════════════════════════════════════════════════
    canvasViewport: jsonb("canvas_viewport")
      .$type<CanvasViewport>()
      .default({ x: 0, y: 0, zoom: 1 }),

    // ═══════════════════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════════════════
    status: workflowStatusEnum("status").default("draft").notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // TRIGGER CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════
    triggerType: text("trigger_type").$type<AutomationTriggerType>(),
    triggerConfig: jsonb("trigger_config").$type<TriggerConfig>().default({}),

    // ═══════════════════════════════════════════════════════════════════════
    // AUTOMATION DEFINITION
    // ═══════════════════════════════════════════════════════════════════════
    steps: jsonb("steps").$type<AutomationStep[]>().default([]),
    transitions: jsonb("transitions")
      .$type<AutomationTransition[]>()
      .default([]),

    /** Monotonically increasing version counter, bumped on every definition edit */
    version: integer("version").default(1).notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // EXECUTION SETTINGS
    // ═══════════════════════════════════════════════════════════════════════
    allowReentry: boolean("allow_reentry").default(false).notNull(),
    reentryDelaySeconds: integer("reentry_delay_seconds"),
    maxConcurrentExecutions: integer("max_concurrent_executions").default(1000),
    contactCooldownSeconds: integer("contact_cooldown_seconds"),

    // ═══════════════════════════════════════════════════════════════════════
    // STATS (denormalized for performance)
    // ═══════════════════════════════════════════════════════════════════════
    totalExecutions: integer("total_executions").default(0).notNull(),
    activeExecutions: integer("active_executions").default(0).notNull(),
    completedExecutions: integer("completed_executions").default(0).notNull(),
    failedExecutions: integer("failed_executions").default(0).notNull(),
    droppedExecutions: integer("dropped_executions").default(0).notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // AI METADATA
    // ═══════════════════════════════════════════════════════════════════════
    aiGenerated: boolean("ai_generated").default(false),
    aiPrompt: text("ai_prompt"),

    // ═══════════════════════════════════════════════════════════════════════
    // CLI SYNC (automations-as-code)
    // ═══════════════════════════════════════════════════════════════════════
    /** Kebab-case identifier derived from filename (e.g., "onboarding" from onboarding.ts) */
    slug: text("slug"),
    /** Original TypeScript source code */
    sourceTs: text("source_ts"),
    /** SHA256 hash of source for change detection */
    sourceHash: text("source_hash"),
    /** Whether this automation was pushed from CLI */
    pushedFromCli: boolean("pushed_from_cli").default(false),
    /** When the automation was last pushed from CLI */
    lastPushedAt: timestamp("last_pushed_at"),
    /** Path to the automation file in the project (e.g., "automations/onboarding.ts") */
    cliProjectPath: text("cli_project_path"),
    /** Where the automation was last edited: "cli" | "dashboard" | null */
    lastEditedFrom: text("last_edited_from").$type<
      "cli" | "dashboard" | null
    >(),

    // ═══════════════════════════════════════════════════════════════════════
    // SENDER DEFAULTS (step config can override these)
    // ═══════════════════════════════════════════════════════════════════════
    defaultFrom: text("default_from"), // e.g., "hello@example.com"
    defaultFromName: text("default_from_name"), // e.g., "Acme Inc"
    defaultReplyTo: text("default_reply_to"), // e.g., "support@example.com"
    defaultSenderId: text("default_sender_id"), // SMS: phone number or alphanumeric ID

    // ═══════════════════════════════════════════════════════════════════════
    // TIMESTAMPS
    // ═══════════════════════════════════════════════════════════════════════
    lastTriggeredAt: timestamp("last_triggered_at"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_org_idx").on(table.organizationId),
    index("workflow_status_idx").on(table.organizationId, table.status),
    index("workflow_trigger_type_idx").on(
      table.organizationId,
      table.triggerType
    ),
    index("workflow_aws_account_idx").on(table.awsAccountId),
    // Unique slug per organization (for CLI sync)
    uniqueIndex("workflow_org_slug_idx").on(table.organizationId, table.slug),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION EXECUTION TABLE
// SQL table name stays "workflow_execution"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automation Execution
 *
 * Tracks a single execution of an automation for a contact.
 * Each time an automation is triggered for a contact, a new execution is created.
 */
export const automationExecution = pgTable(
  "workflow_execution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    workflowId: text("workflow_id")
      .references(() => automation.id, { onDelete: "cascade" })
      .notNull(),

    contactId: text("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    // Denormalized from automation for partial unique index constraint
    // This enables atomic INSERT with ON CONFLICT to prevent race conditions
    allowReentry: boolean("allow_reentry").default(false).notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // EXECUTION STATE
    // ═══════════════════════════════════════════════════════════════════════
    status: workflowExecutionStatusEnum("status").default("pending").notNull(),
    currentStepId: text("current_step_id"),

    /** Frozen copy of automation steps + transitions at execution creation time */
    definitionSnapshot: jsonb(
      "definition_snapshot"
    ).$type<AutomationDefinitionSnapshot>(),

    // Context data (persisted between steps)
    context: jsonb("context").$type<Record<string, unknown>>().default({}),

    // ═══════════════════════════════════════════════════════════════════════
    // TRIGGER INFO
    // ═══════════════════════════════════════════════════════════════════════
    triggerEventId: text("trigger_event_id"),
    triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),

    // ═══════════════════════════════════════════════════════════════════════
    // WAIT-FOR-EVENT TRACKING (Slice 3)
    // ═══════════════════════════════════════════════════════════════════════
    waitingForEvent: text("waiting_for_event"),
    waitingForConditions: jsonb("waiting_for_conditions").$type<
      Record<string, unknown>
    >(),
    waitTimeoutAt: timestamp("wait_timeout_at"),
    waitTimeoutSchedulerName: text("wait_timeout_scheduler_name"),

    // ═══════════════════════════════════════════════════════════════════════
    // DELAY SCHEDULING
    // ═══════════════════════════════════════════════════════════════════════
    nextStepScheduledAt: timestamp("next_step_scheduled_at"),
    delaySchedulerName: text("delay_scheduler_name"),

    // ═══════════════════════════════════════════════════════════════════════
    // ERROR TRACKING
    // ═══════════════════════════════════════════════════════════════════════
    error: text("error"),
    errorStepId: text("error_step_id"),
    retryCount: integer("retry_count").default(0),

    // ═══════════════════════════════════════════════════════════════════════
    // TIMESTAMPS
    // ═══════════════════════════════════════════════════════════════════════
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_execution_workflow_idx").on(table.workflowId),
    index("workflow_execution_contact_idx").on(table.contactId),
    index("workflow_execution_org_idx").on(table.organizationId),
    index("workflow_execution_status_idx").on(table.workflowId, table.status),
    index("workflow_execution_org_status_idx").on(
      table.organizationId,
      table.status
    ),
    index("workflow_execution_scheduled_idx").on(table.nextStepScheduledAt),
    // Critical index for wait-for-event matching (Slice 3)
    index("workflow_execution_waiting_event_idx").on(
      table.organizationId,
      table.waitingForEvent
    ),
    // Partial unique index for atomic reentry prevention
    // Prevents duplicate active executions when allowReentry=false
    uniqueIndex("workflow_execution_no_reentry_idx")
      .on(table.workflowId, table.contactId)
      .where(
        sql`${table.status} IN ('pending', 'active', 'paused', 'waiting') AND ${table.allowReentry} = false`
      ),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION STEP EXECUTION TABLE
// SQL table name stays "workflow_step_execution"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automation Step Execution
 *
 * Tracks the execution of each step within an automation execution.
 * Used for idempotency (prevent duplicate sends on retry) and audit trail.
 */
export const automationStepExecution = pgTable(
  "workflow_step_execution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    executionId: text("execution_id")
      .references(() => automationExecution.id, { onDelete: "cascade" })
      .notNull(),

    stepId: text("step_id").notNull(),
    stepType: text("step_type").$type<AutomationStepType>().notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════════════════
    status: workflowStepExecutionStatusEnum("status")
      .default("pending")
      .notNull(),

    // Idempotency key for retries (e.g., "exec_123-step_456")
    idempotencyKey: text("idempotency_key").notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    branch: text("branch"), // yes, no, timeout, default
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    skipReason: text("skip_reason"), // e.g., "contact_unsubscribed"

    // ═══════════════════════════════════════════════════════════════════════
    // TIMESTAMPS
    // ═══════════════════════════════════════════════════════════════════════
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_step_execution_execution_idx").on(table.executionId),
    uniqueIndex("workflow_step_execution_idempotency_idx").on(
      table.idempotencyKey
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const automationRelations = relations(automation, ({ one, many }) => ({
  organization: one(organization, {
    fields: [automation.organizationId],
    references: [organization.id],
  }),
  awsAccount: one(awsAccount, {
    fields: [automation.awsAccountId],
    references: [awsAccount.id],
  }),
  topic: one(topic, {
    fields: [automation.topicId],
    references: [topic.id],
  }),
  createdByUser: one(user, {
    fields: [automation.createdBy],
    references: [user.id],
  }),
  executions: many(automationExecution),
}));

export const automationExecutionRelations = relations(
  automationExecution,
  ({ one, many }) => ({
    automation: one(automation, {
      fields: [automationExecution.workflowId],
      references: [automation.id],
    }),
    contact: one(contact, {
      fields: [automationExecution.contactId],
      references: [contact.id],
    }),
    organization: one(organization, {
      fields: [automationExecution.organizationId],
      references: [organization.id],
    }),
    stepExecutions: many(automationStepExecution),
  })
);

export const automationStepExecutionRelations = relations(
  automationStepExecution,
  ({ one }) => ({
    execution: one(automationExecution, {
      fields: [automationStepExecution.executionId],
      references: [automationExecution.id],
    }),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Automation = typeof automation.$inferSelect;
export type NewAutomation = typeof automation.$inferInsert;
export type AutomationStatus = Automation["status"];

export type AutomationExecution = typeof automationExecution.$inferSelect;
export type NewAutomationExecution = typeof automationExecution.$inferInsert;
export type AutomationExecutionStatus = AutomationExecution["status"];

export type AutomationStepExecutionRecord =
  typeof automationStepExecution.$inferSelect;
export type NewAutomationStepExecution =
  typeof automationStepExecution.$inferInsert;
export type AutomationStepExecutionStatus =
  AutomationStepExecutionRecord["status"];

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT ALIASES
// These allow existing code to keep compiling while the rename propagates.
// Remove once all call sites are updated.
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use `automation` instead */
export const workflow = automation;
/** @deprecated Use `automationExecution` instead */
export const workflowExecution = automationExecution;
/** @deprecated Use `automationStepExecution` instead */
export const workflowStepExecution = automationStepExecution;

/** @deprecated Use `AutomationStepType` instead */
export type WorkflowStepType = AutomationStepType;
/** @deprecated Use `AutomationTriggerType` instead */
export type WorkflowTriggerType = AutomationTriggerType;
/** @deprecated Use `AutomationStepConfig` instead */
export type WorkflowStepConfig = AutomationStepConfig;
/** @deprecated Use `AutomationStep` instead */
export type WorkflowStep = AutomationStep;
/** @deprecated Use `AutomationTransition` instead */
export type WorkflowTransition = AutomationTransition;
/** @deprecated Use `AutomationDefinitionSnapshot` instead */
export type WorkflowDefinitionSnapshot = AutomationDefinitionSnapshot;
/** @deprecated Use `Automation` instead */
export type Workflow = Automation;
/** @deprecated Use `NewAutomation` instead */
export type NewWorkflow = NewAutomation;
/** @deprecated Use `AutomationStatus` instead */
export type WorkflowStatus = AutomationStatus;
/** @deprecated Use `AutomationExecution` instead */
export type WorkflowExecution = AutomationExecution;
/** @deprecated Use `NewAutomationExecution` instead */
export type NewWorkflowExecution = NewAutomationExecution;
/** @deprecated Use `AutomationExecutionStatus` instead */
export type WorkflowExecutionStatus = AutomationExecutionStatus;
/** @deprecated Use `AutomationStepExecutionRecord` instead */
export type WorkflowStepExecutionRecord = AutomationStepExecutionRecord;
/** @deprecated Use `NewAutomationStepExecution` instead */
export type NewWorkflowStepExecution = NewAutomationStepExecution;
/** @deprecated Use `AutomationStepExecutionStatus` instead */
export type WorkflowStepExecutionStatus = AutomationStepExecutionStatus;
