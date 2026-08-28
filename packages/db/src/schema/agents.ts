import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Agent lifecycle status
export const agentStatusEnum = pgEnum("agent_status", ["ACTIVE", "KILLED"]);

// Approval-queue row status
export const agentApprovalStatusEnum = pgEnum("agent_approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SENT",
  "FAILED",
]);

// Send policy stored on the agent (mirrored into customer DynamoDB by the API)
export type AgentPolicy = {
  maxPerHour: number;
  maxPerDay: number;
  allowedRecipients: string[];
  allowedRecipientDomains: string[];
};

// Pending-send payload captured when an agent send is flagged for approval
export type AgentSendPayload = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
};

// Agents — an addressable, leashed sender scoped to an organization
export const agent = pgTable(
  "agent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    emailAddress: text("email_address").notNull(),
    domain: text("domain").notNull(),
    status: agentStatusEnum("status").default("ACTIVE").notNull(),
    policy: jsonb("policy").$type<AgentPolicy>().notNull(),
    credentialUserArn: text("credential_user_arn"),
    enforcerFunctionArn: text("enforcer_function_arn"),
    awsAccountId: text("aws_account_id"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("agent_org_idx").on(table.organizationId),
    orgNameIdx: uniqueIndex("agent_unique_org_name_idx").on(
      table.organizationId,
      table.name
    ),
    // Inbound routing looks up by (org, email); uniqueness also prevents two
    // agents claiming one address → ambiguous routing (PERF-3 + COR-11).
    orgEmailIdx: uniqueIndex("agent_unique_org_email_idx").on(
      table.organizationId,
      table.emailAddress
    ),
  })
);

// Approval queue — pending/flagged sends awaiting operator decision
export const agentApprovalQueue = pgTable(
  "agent_approval_queue",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    agentId: text("agent_id")
      .references(() => agent.id, { onDelete: "cascade" })
      .notNull(),
    payload: jsonb("payload").$type<AgentSendPayload>().notNull(),
    reason: text("reason"),
    status: agentApprovalStatusEnum("status").default("PENDING").notNull(),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    messageId: text("message_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("agent_approval_queue_org_idx").on(table.organizationId),
    orgStatusIdx: index("agent_approval_queue_org_status_idx").on(
      table.organizationId,
      table.status
    ),
    // Postgres does not auto-index FK columns; cascade-delete and
    // "approvals for agent" queries would otherwise seq-scan (PERF-2).
    agentIdx: index("agent_approval_queue_agent_idx").on(table.agentId),
  })
);

export const agentRelations = relations(agent, ({ one, many }) => ({
  organization: one(organization, {
    fields: [agent.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [agent.createdBy],
    references: [user.id],
  }),
  approvals: many(agentApprovalQueue),
}));

export const agentApprovalQueueRelations = relations(
  agentApprovalQueue,
  ({ one }) => ({
    organization: one(organization, {
      fields: [agentApprovalQueue.organizationId],
      references: [organization.id],
    }),
    agent: one(agent, {
      fields: [agentApprovalQueue.agentId],
      references: [agent.id],
    }),
    decidedByUser: one(user, {
      fields: [agentApprovalQueue.decidedBy],
      references: [user.id],
    }),
  })
);

export type AgentStatus = (typeof agentStatusEnum.enumValues)[number];
export type AgentApprovalStatus =
  (typeof agentApprovalStatusEnum.enumValues)[number];

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;
export type AgentApproval = typeof agentApprovalQueue.$inferSelect;
export type NewAgentApproval = typeof agentApprovalQueue.$inferInsert;
