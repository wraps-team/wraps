import { describe, expect, it } from "vitest";
import { db } from "../index";
import { recordMessageSendDiagnostic } from "../repositories/message-send-diagnostics";
import type { DbClient } from "../repositories/subscriptions";
import { messageSendDiagnostic } from "../schema/batch";

// Builds the real drizzle upsert and captures its SQL instead of executing it,
// so the idempotency rule is checked without a database connection.
function capturingClient() {
  const captured: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    insert: () => ({
      values: (row: typeof messageSendDiagnostic.$inferInsert) => ({
        onConflictDoUpdate: (config: unknown) => {
          const query = db
            .insert(messageSendDiagnostic)
            .values(row)
            .onConflictDoUpdate(config as never);
          captured.push(query.toSQL());
          return Promise.resolve();
        },
      }),
    }),
  };
  return { client: client as unknown as DbClient, captured };
}

const BASE_INPUT = {
  organizationId: "org-diag-unit",
  messageSendId: "send-diag-unit",
  eventType: "bounce" as const,
  enhancedStatus: "5.1.1",
  diagnosticCode: "smtp; 550 5.1.1 user unknown",
  reasonKey: "|5.1.1|Bad destination mailbox address",
  feedbackType: null,
};

describe("recordMessageSendDiagnostic upsert", () => {
  it("is keyed on (message_send_id, event_type)", async () => {
    const { client, captured } = capturingClient();
    await recordMessageSendDiagnostic(BASE_INPUT, client);

    expect(captured).toHaveLength(1);
    expect(captured[0].sql).toMatch(
      /on conflict \("message_send_id",\s*"event_type"\) do update set/
    );
  });

  it("keeps a stored value with COALESCE on each of the four value columns", async () => {
    const { client, captured } = capturingClient();
    await recordMessageSendDiagnostic(BASE_INPUT, client);

    const sqlText = captured[0].sql;
    for (const column of [
      "enhanced_status",
      "diagnostic_code",
      "reason_key",
      "feedback_type",
    ]) {
      expect(sqlText).toContain(
        `coalesce("message_send_diagnostic"."${column}", excluded.${column})`
      );
    }
  });

  it("never updates recorded_at on conflict", async () => {
    const { client, captured } = capturingClient();
    await recordMessageSendDiagnostic(BASE_INPUT, client);

    const setClause = captured[0].sql.slice(
      captured[0].sql.indexOf("do update set")
    );
    expect(setClause).not.toContain("recorded_at");
  });

  it("writes the organization and the send id into the row", async () => {
    const { client, captured } = capturingClient();
    await recordMessageSendDiagnostic(BASE_INPUT, client);

    expect(captured[0].params).toEqual(
      expect.arrayContaining([
        "org-diag-unit",
        "send-diag-unit",
        "bounce",
        "5.1.1",
      ])
    );
  });
});
