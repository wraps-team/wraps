import { sql } from "drizzle-orm";
import { db } from "../index";
import { messageSendDiagnostic } from "../schema/batch";
import type { DbClient } from "./subscriptions";

export type MessageSendDiagnosticInput = {
  organizationId: string;
  messageSendId: string;
  eventType: "bounce" | "complaint";
  enhancedStatus: string | null;
  diagnosticCode: string | null;
  reasonKey: string | null;
  feedbackType: string | null;
};

/**
 * Record the receiver diagnostic for one bounce or complaint.
 *
 * Idempotent by key. On a duplicate event each value column keeps the value
 * already stored and only fills a null with a later non-null, so a retry or a
 * repeated SES event can never replace good data with worse data. recorded_at
 * is not touched, so it keeps the time the first event was processed.
 *
 * The caller resolves messageSendId within its organization first. The row
 * carries organizationId itself, for the org index and for cascade deletes.
 */
export async function recordMessageSendDiagnostic(
  input: MessageSendDiagnosticInput,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .insert(messageSendDiagnostic)
    .values({
      messageSendId: input.messageSendId,
      organizationId: input.organizationId,
      eventType: input.eventType,
      enhancedStatus: input.enhancedStatus,
      diagnosticCode: input.diagnosticCode,
      reasonKey: input.reasonKey,
      feedbackType: input.feedbackType,
    })
    .onConflictDoUpdate({
      target: [
        messageSendDiagnostic.messageSendId,
        messageSendDiagnostic.eventType,
      ],
      set: {
        enhancedStatus: sql`coalesce(${messageSendDiagnostic.enhancedStatus}, excluded.enhanced_status)`,
        diagnosticCode: sql`coalesce(${messageSendDiagnostic.diagnosticCode}, excluded.diagnostic_code)`,
        reasonKey: sql`coalesce(${messageSendDiagnostic.reasonKey}, excluded.reason_key)`,
        feedbackType: sql`coalesce(${messageSendDiagnostic.feedbackType}, excluded.feedback_type)`,
      },
    });
}
