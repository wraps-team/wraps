import type { AWSWorldConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { createDynamoDBClient } from "./dynamodb/client.js";
import { getTableNames } from "./dynamodb/tables.js";
import { createStorage } from "./storage/index.js";
import { createQueue } from "./queue/index.js";
import { createSQSClient } from "./queue/sqs-client.js";
import { createStreamer } from "./streamer/index.js";

export type { AWSWorldConfig } from "./config.js";
export { resolveConfig } from "./config.js";
export { getTableNames } from "./dynamodb/tables.js";

export function createWorld(config?: AWSWorldConfig) {
  const resolved = resolveConfig(config);
  const tables = getTableNames(resolved.tablePrefix);
  const docClient = createDynamoDBClient(resolved);
  const sqsClient = createSQSClient(resolved);

  const storage = createStorage(docClient, tables);
  const queue = createQueue(sqsClient, resolved);
  const streamer = createStreamer(docClient, tables);

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
    },
  };
}

export default createWorld;
