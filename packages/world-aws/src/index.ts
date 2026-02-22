import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
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
export { getTableNames } from "./dynamodb/tables.js";

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

  const storage = createStorage(docClient, tables);
  const queue = createQueue(sqsClient, resolved);
  const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

  return {
    ...storage,
    ...queue,
    ...streamer,

    async start() {
      // No-op: SQS is consumed by Lambda event source mapping, not polling
    },

    async close() {
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
