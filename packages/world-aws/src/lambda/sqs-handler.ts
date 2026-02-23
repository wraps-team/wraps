import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Context, SQSEvent, SQSRecord } from "aws-lambda";
import { wrapAWSError } from "../errors.js";

export type { Context, SQSEvent, SQSRecord } from "aws-lambda";

type QueueHandlerFn = (req: Request) => Promise<Response>;

const SQS_MAX_DELAY_SECONDS = 900;
const sqsClients = new Map<string, SQSClient>();

function getSQSClient(region: string): SQSClient {
  let client = sqsClients.get(region);
  if (!client) {
    client = new SQSClient({
      region,
      maxAttempts: 5,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 10_000 },
    });
    sqsClients.set(region, client);
  }
  return client;
}

export interface SQSHandlerOptions {
  /**
   * Called when the queue handler returns { timeoutSeconds }.
   * Re-queue the message for delayed re-delivery.
   *
   * If not provided, messages are re-queued via SQS with DelaySeconds
   * (max 900s). Sleeps longer than 15 minutes log a warning and
   * use the maximum 900s delay, relying on the runtime to re-check
   * and re-sleep on the next delivery.
   */
  onTimeout?: (params: {
    record: SQSRecord;
    timeoutSeconds: number;
  }) => Promise<void>;
}

/**
 * Creates an AWS Lambda handler that processes SQS events via a queue handler.
 *
 * Each SQS record is converted into a `Request` object and passed to the
 * provided `queueHandler`. Failed records are reported as partial batch
 * failures so SQS can retry only the failed messages.
 *
 * @param queueHandler - A function that accepts a `Request` and returns a `Response`.
 * @param options - Optional configuration for timeout handling.
 * @returns Lambda handler compatible with SQS event source mappings.
 */
export function createSQSHandler(
  queueHandler: QueueHandlerFn,
  options?: SQSHandlerOptions
) {
  return async function handler(event: SQSEvent, _context: Context) {
    const settled = await Promise.allSettled(
      event.Records.map((record) =>
        processRecord(record, queueHandler, options)
      )
    );

    const batchItemFailures = settled
      .map((result, i) =>
        result.status === "rejected"
          ? { itemIdentifier: event.Records[i].messageId }
          : null
      )
      .filter(
        (f): f is { itemIdentifier: string } => f !== null
      );

    return { batchItemFailures };
  };
}

function queueUrlFromArn(arn: string): string {
  const parts = arn.split(":");
  const region = parts[3];
  const accountId = parts[4];
  const queueName = parts[5];
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

async function processRecord(
  record: SQSRecord,
  queueHandler: QueueHandlerFn,
  options?: SQSHandlerOptions
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
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Queue handler returned ${response.status}: ${responseText}`
    );
  }

  // Check for timeoutSeconds in response body (workflow sleep)
  if (!responseText) return;

  let responseBody: { timeoutSeconds?: number };
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    return;
  }

  const { timeoutSeconds } = responseBody;
  if (!timeoutSeconds || timeoutSeconds <= 0) return;

  if (options?.onTimeout) {
    await options.onTimeout({ record, timeoutSeconds });
    return;
  }

  // Default: re-queue via SQS with DelaySeconds
  if (timeoutSeconds > SQS_MAX_DELAY_SECONDS) {
    console.warn(
      `[world-aws] sleep of ${timeoutSeconds}s exceeds SQS max delay (${SQS_MAX_DELAY_SECONDS}s). ` +
        `Using ${SQS_MAX_DELAY_SECONDS}s delay; the runtime will re-check and re-sleep on next delivery. ` +
        `For longer sleeps, provide an onTimeout callback (e.g. EventBridge Scheduler).`
    );
  }

  const delaySeconds = Math.min(timeoutSeconds, SQS_MAX_DELAY_SECONDS);
  const queueUrl = queueUrlFromArn(record.eventSourceARN);
  const client = getSQSClient(record.awsRegion);

  try {
    await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: record.body,
        DelaySeconds: delaySeconds,
      })
    );
  } catch (e) {
    wrapAWSError(e, "sqs-handler.requeue");
  }
}
