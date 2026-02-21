import { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";
import type { ResolvedConfig } from "../config.js";

export function createStreamsClient(config: ResolvedConfig): DynamoDBStreamsClient {
  return new DynamoDBStreamsClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
}
