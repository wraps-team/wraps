import { SQSClient } from "@aws-sdk/client-sqs";
import type { ResolvedConfig } from "../config.js";

export function createSQSClient(config: ResolvedConfig): SQSClient {
  return new SQSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
}
