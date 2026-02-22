import type { Context, SQSEvent, SQSRecord } from "aws-lambda";

export type { Context, SQSEvent, SQSRecord } from "aws-lambda";

type QueueHandlerFn = (req: Request) => Promise<Response>;

/**
 * Creates an AWS Lambda handler that processes SQS events via a queue handler.
 *
 * Each SQS record is converted into a `Request` object and passed to the
 * provided `queueHandler`. Failed records are reported as partial batch
 * failures so SQS can retry only the failed messages.
 *
 * @param queueHandler - A function that accepts a `Request` and returns a `Response`.
 * @returns Lambda handler compatible with SQS event source mappings.
 */
export function createSQSHandler(queueHandler: QueueHandlerFn) {
  return async function handler(event: SQSEvent, _context: Context) {
    const results: { recordId: string; success: boolean; error?: string }[] =
      [];

    for (const record of event.Records) {
      try {
        await processRecord(record, queueHandler);
        results.push({ recordId: record.messageId, success: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          recordId: record.messageId,
          success: false,
          error: message,
        });
      }
    }

    // Return failed message IDs for SQS partial batch failure reporting
    const failedIds = results
      .filter((r) => !r.success)
      .map((r) => ({ itemIdentifier: r.recordId }));

    return {
      batchItemFailures: failedIds,
    };
  };
}

async function processRecord(
  record: SQSRecord,
  queueHandler: QueueHandlerFn
): Promise<void> {
  const body = JSON.parse(record.body);

  // Increment attempt count from SQS attributes
  const approximateReceiveCount = Number(
    record.attributes?.ApproximateReceiveCount ?? 1
  );
  if (body.attempt !== undefined) {
    body.attempt = approximateReceiveCount;
  }

  const request = new Request("https://localhost/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const response = await queueHandler(request);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Queue handler returned ${response.status}: ${text}`);
  }
}
