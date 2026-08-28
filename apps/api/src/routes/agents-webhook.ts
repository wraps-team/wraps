/**
 * Agent Enforcer Webhook — POST /v1/agents/webhook
 *
 * Machine callback from a customer's agent-enforcer Lambda when a send is
 * flagged (`pending_approval`) or refused (`blocked`). Unauthenticated by
 * API key: the enforcer proves itself with its account's 32-byte
 * `webhookSecret` in the `X-Wraps-Agent-Key` header, compared in constant time
 * against every registered account (secrets are unique, collisions impossible).
 *
 * The organization is resolved from the MATCHED awsAccount — never from the
 * request body — so a forged body cannot inject into another org.
 *
 * Pattern: apps/api/src/routes/webhooks.ts:199-227 (timingSafeEqual gate).
 */

import { timingSafeEqual } from "node:crypto";
import {
  awsAccount,
  db,
  findAgentForOrg,
  insertApprovalRequest,
  notifyOrg,
} from "@wraps/db";
import { isNotNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { log } from "../lib/logger";

const webhookBodySchema = t.Object({
  agentId: t.String({ maxLength: 255 }),
  event: t.Union([t.Literal("pending_approval"), t.Literal("blocked")]),
  payload: t.Object({
    from: t.String(),
    to: t.String(),
    subject: t.String(),
    html: t.Optional(t.String()),
    text: t.Optional(t.String()),
    replyTo: t.Optional(t.String()),
    inReplyTo: t.Optional(t.String()),
    references: t.Optional(t.String()),
  }),
  reason: t.Optional(t.String()),
});

export const agentsWebhookRoutes = new Elysia({ prefix: "/v1/agents" }).post(
  "/webhook",
  async ({ body, headers, set }) => {
    const key = headers["x-wraps-agent-key"];
    if (!key) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Match the presented key against every account's webhookSecret in constant
    // time. account_id is not in the callback, so we cannot pre-narrow; secrets
    // are 32 random bytes so exactly one account matches.
    const candidates = await db
      .select({
        webhookSecret: awsAccount.webhookSecret,
        organizationId: awsAccount.organizationId,
      })
      .from(awsAccount)
      .where(isNotNull(awsAccount.webhookSecret));

    const keyBuffer = Buffer.from(key);
    const matched = candidates.find((candidate) => {
      if (!candidate.webhookSecret) {
        return false;
      }
      const secretBuffer = Buffer.from(candidate.webhookSecret);
      return (
        secretBuffer.length === keyBuffer.length &&
        timingSafeEqual(secretBuffer, keyBuffer)
      );
    });

    if (!matched) {
      log.warn("Agent webhook: authentication failed");
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const organizationId = matched.organizationId;

    // The agent must belong to the matched (secret-proven) org. This also
    // rejects a valid key paired with another org's agentId.
    const agentRow = await findAgentForOrg(body.agentId, organizationId);
    if (!agentRow) {
      set.status = 404;
      return { error: "Agent not found" };
    }

    if (body.event === "blocked") {
      // Nothing to approve — record an operator notification for the audit trail.
      try {
        await notifyOrg({
          organizationId,
          type: "agent.send_blocked",
          title: `Agent ${agentRow.name} blocked a send`,
          body: body.reason ?? "A send was blocked by policy.",
          href: "/emails/agents/approvals",
          data: { agentId: agentRow.id },
        });
      } catch (error) {
        log.error("Agent webhook: blocked notify failed", error, {
          agentId: agentRow.id,
        });
      }
      return { approvalId: null };
    }

    // pending_approval → queue a PENDING row and notify the org.
    const approval = await insertApprovalRequest({
      organizationId,
      agentId: agentRow.id,
      payload: body.payload,
      reason: body.reason ?? null,
      status: "PENDING",
    });

    if (!approval) {
      set.status = 500;
      return { error: "Failed to queue approval" };
    }

    try {
      await notifyOrg({
        organizationId,
        type: "agent.send_pending",
        title: `Agent ${agentRow.name} needs approval`,
        body: body.reason ?? "A send is awaiting your approval.",
        href: "/emails/agents/approvals",
        data: { agentId: agentRow.id, approvalId: approval.id },
      });
    } catch (error) {
      log.error("Agent webhook: pending notify failed", error, {
        agentId: agentRow.id,
        approvalId: approval.id,
      });
    }

    return { approvalId: approval.id };
  },
  {
    body: webhookBodySchema,
    detail: { tags: ["agents"], summary: "Agent enforcer callback" },
  }
);
