/**
 * SST dev Lambda handler for world-aws e2e testing.
 *
 * Receives SQS messages and forwards them to the local dev server's
 * workflow/step HTTP endpoints. This tests the real SQS → Lambda path
 * while the dev server (with workflow definitions) handles execution.
 */
import type { Context, SQSBatchResponse, SQSEvent } from "aws-lambda";

const BASE_URL = process.env.WORKFLOW_LOCAL_BASE_URL ?? "http://localhost:3000";
const SQS_MAX_DELAY_SECONDS = 900;

export async function handler(
  event: SQSEvent,
  _context: Context
): Promise<SQSBatchResponse> {
  const settled = await Promise.allSettled(
    event.Records.map(async (record) => {
      const parsed = JSON.parse(record.body);
      const { queueName } = parsed;

      const isStep = queueName?.startsWith("__wkf_step_");
      const pathname = isStep ? "step" : "flow";
      const url = `${BASE_URL}/.well-known/workflow/v1/${pathname}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: record.body,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }

      // Handle workflow sleep (timeoutSeconds)
      const text = await response.text();
      if (text) {
        try {
          const result = JSON.parse(text);
          if (result.timeoutSeconds && result.timeoutSeconds > 0) {
            const { SQSClient, SendMessageCommand } = await import(
              "@aws-sdk/client-sqs"
            );
            const delaySeconds = Math.min(
              result.timeoutSeconds,
              SQS_MAX_DELAY_SECONDS
            );
            const parts = record.eventSourceARN.split(":");
            const region = parts[3];
            const accountId = parts[4];
            const queueName = parts[5];
            const queueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;

            await new SQSClient({ region }).send(
              new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: record.body,
                DelaySeconds: delaySeconds,
              })
            );
          }
        } catch {
          // Not JSON or no timeout, ignore
        }
      }
    })
  );

  return {
    batchItemFailures: settled
      .map((result, i) =>
        result.status === "rejected"
          ? { itemIdentifier: event.Records[i].messageId }
          : null
      )
      .filter((f): f is { itemIdentifier: string } => f !== null),
  };
}
