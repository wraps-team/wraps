import { getEmailLogByMessageId, listEmailLogs } from "@wraps/db";
import { t } from "elysia";
import { parseCursorParam } from "../lib/cursor";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";

export const emailLogsRoutes = createAuthenticatedRoutes("/v1/email/logs")

  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { status, limit, cursor } = ctx.query;
      // Reject a malformed cursor here; listEmailLogs would silently list page one.
      parseCursorParam(cursor, ctx.set);

      const result = await listEmailLogs(authContext.organizationId, {
        status,
        limit,
        cursor,
      });

      return result;
    },
    {
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("sent"),
            t.Literal("delivered"),
            t.Literal("opened"),
            t.Literal("clicked"),
            t.Literal("bounced"),
            t.Literal("complained"),
            t.Literal("suppressed"),
            t.Literal("failed"),
            t.Literal("queued"),
            t.Literal("pending"),
            t.Literal("opted_out"),
          ])
        ),
        limit: t.Optional(t.Number({ default: 20, minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
      }),
      detail: {
        tags: ["email-logs"],
        summary: "List email delivery logs",
        description:
          "Returns paginated email delivery logs for the organization.",
      },
    }
  )

  .get(
    "/:messageId",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { messageId } = ctx.params;

      const log = await getEmailLogByMessageId(
        messageId,
        authContext.organizationId
      );

      if (!log) {
        ctx.set.status = 404;
        return { error: "Log entry not found" };
      }

      return log;
    },
    {
      params: t.Object({
        messageId: t.String({ description: "SES Message ID" }),
      }),
      detail: {
        tags: ["email-logs"],
        summary: "Get email log by message ID",
        description: "Returns full log detail for a specific SES message ID.",
      },
    }
  );
