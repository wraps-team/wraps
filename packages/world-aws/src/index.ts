import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type { AWSWorldConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { createDynamoDBClient } from "./dynamodb/client.js";
import { createStreamsClient } from "./dynamodb/streams-client.js";
import { getTableNames } from "./dynamodb/tables.js";
import { deriveKeyForRun } from "./encryption.js";
import { createQueue } from "./queue/index.js";
import { createSQSClient } from "./queue/sqs-client.js";
import { createStorage } from "./storage/index.js";
import { createStreamer } from "./streamer/index.js";

export type { AWSWorldConfig } from "./config.js";
export { resolveConfig } from "./config.js";
export { Duration } from "./duration.js";
export { getTableNames } from "./dynamodb/tables.js";
export { isCredentialError, isThrottlingError, WorldError } from "./errors.js";
export { createSQSHandler } from "./lambda/sqs-handler.js";

/**
 * Creates an AWS-backed World for Vercel Workflow DevKit.
 *
 * Returns an object conforming to the `@workflow/world` interface backed by
 * DynamoDB (storage + streams) and SQS (queue). Call `close()` when done to
 * destroy SDK clients and abort any active stream reads.
 *
 * @param config - Optional configuration overrides; falls back to env vars then defaults.
 *
 * @example
 * ```ts
 * const world = createWorld({ region: "us-east-1" });
 * // ... use world.runs, world.events, world.queue, etc.
 * await world.close();
 * ```
 */
export function createWorld(config?: AWSWorldConfig) {
  const resolved = resolveConfig(config);
  const tables = getTableNames(resolved.tablePrefix);
  const docClient = createDynamoDBClient(resolved);
  const sqsClient = createSQSClient(resolved);
  const ddbClient = new DynamoDBClient({
    region: resolved.region,
    ...(resolved.endpoint ? { endpoint: resolved.endpoint } : {}),
  });
  const streamsClient = createStreamsClient(resolved);

  const shutdownController = new AbortController();

  const storage = createStorage(docClient, tables, resolved.ttlSeconds);
  const queue = createQueue(sqsClient, resolved);
  const streamer = createStreamer(
    docClient,
    tables,
    ddbClient,
    streamsClient,
    shutdownController.signal,
    resolved.ttlSeconds
  );

  return {
    ...storage,
    ...queue,
    ...streamer,

    async start() {
      // When PORT is set we're inside a local dev/test server — poll SQS and
      // forward messages to the local HTTP endpoints so workflows make progress.
      // In production, SQS is consumed by Lambda event source mappings.
      const baseUrl =
        process.env.WORKFLOW_LOCAL_BASE_URL ??
        (process.env.PORT ? `http://localhost:${process.env.PORT}` : undefined);
      if (!baseUrl) return;

      const signal = shutdownController.signal;
      const accountId = process.env.AWS_ACCOUNT_ID ?? "000000000000";

      function getQueueUrl(queueName: string): string {
        if (resolved.endpoint) {
          return `${resolved.endpoint}/000000000000/${queueName}`;
        }
        return `https://sqs.${resolved.region}.amazonaws.com/${accountId}/${queueName}`;
      }

      const workflowsUrl =
        process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL ??
        getQueueUrl(`${resolved.queuePrefix}-workflows`);
      const stepsUrl =
        process.env.WORKFLOW_AWS_STEPS_QUEUE_URL ??
        getQueueUrl(`${resolved.queuePrefix}-steps`);

      async function processMessage(
        queueUrl: string,
        receiptHandle: string,
        body: string
      ): Promise<void> {
        const parsed = JSON.parse(body);
        const { queueName, headers: msgHeaders } = parsed;

        const isStep = queueName?.startsWith("__wkf_step_");
        const pathname = isStep ? "step" : "flow";
        const url = `${baseUrl}/.well-known/workflow/v1/${pathname}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(msgHeaders ?? {}),
          },
          body: JSON.stringify(parsed),
        });

        if (response.ok) {
          const text = await response.text();
          if (text) {
            try {
              const result = JSON.parse(text);
              if (result.timeoutSeconds > 0) {
                const delay = Math.min(result.timeoutSeconds, 900);
                await sqsClient.send(
                  new SendMessageCommand({
                    QueueUrl: queueUrl,
                    MessageBody: body,
                    DelaySeconds: delay,
                  })
                );
              }
            } catch {}
          }
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: receiptHandle,
            })
          );
          return;
        }

        const errorText = await response.text();
        if (response.status === 503) {
          try {
            const result = JSON.parse(errorText);
            if (result.timeoutSeconds) {
              const delay = Math.min(result.timeoutSeconds, 900);
              await sqsClient.send(
                new SendMessageCommand({
                  QueueUrl: queueUrl,
                  MessageBody: body,
                  DelaySeconds: delay,
                })
              );
              await sqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: queueUrl,
                  ReceiptHandle: receiptHandle,
                })
              );
              return;
            }
          } catch {}
        }

        await sqsClient.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: 1,
          })
        );
      }

      async function poll(queueUrl: string): Promise<void> {
        while (!signal.aborted) {
          try {
            const res = await sqsClient.send(
              new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 1,
                VisibilityTimeout: 30,
              })
            );
            if (!res.Messages?.length) continue;
            await Promise.allSettled(
              res.Messages.map(async (msg) => {
                if (!(msg.Body && msg.ReceiptHandle)) return;
                await processMessage(queueUrl, msg.ReceiptHandle, msg.Body);
              })
            );
          } catch (e) {
            if (signal.aborted) break;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }

      // Fire-and-forget: poll both queues in parallel
      poll(workflowsUrl).catch(() => {});
      poll(stepsUrl).catch(() => {});
    },

    async close() {
      shutdownController.abort();
      docClient.destroy();
      sqsClient.destroy();
      ddbClient.destroy();
      streamsClient.destroy();
    },

    ...(resolved.encryptionKey
      ? {
          async getEncryptionKeyForRun(
            runOrRunId: { runId: string; deploymentId: string } | string,
            context?: Record<string, unknown>
          ): Promise<Uint8Array> {
            const runId =
              typeof runOrRunId === "string" ? runOrRunId : runOrRunId.runId;
            const deploymentId =
              typeof runOrRunId === "string"
                ? ((context?.deploymentId as string | undefined) ??
                  resolved.deploymentId)
                : runOrRunId.deploymentId;
            return deriveKeyForRun(
              resolved.encryptionKey!,
              deploymentId,
              runId
            );
          },
        }
      : {}),
  };
}

export default createWorld;
