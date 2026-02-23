import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { ResolvedConfig } from "../config.js";

export function createDynamoDBClient(
  config: ResolvedConfig
): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    maxAttempts: 5,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 10_000 },
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });
}
