import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

/**
 * Sends a BatchWriteCommand and retries UnprocessedItems with exponential backoff.
 * DynamoDB may return UnprocessedItems when provisioned throughput is exceeded or
 * internal limits are hit — these are not errors but require re-submission.
 */
export async function batchWriteWithRetry(
  docClient: DynamoDBDocumentClient,
  requestItems: Record<
    string,
    Array<{
      PutRequest?: { Item: Record<string, unknown> };
      DeleteRequest?: { Key: Record<string, unknown> };
    }>
  >
): Promise<void> {
  let unprocessed: typeof requestItems | undefined = requestItems;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await docClient.send(
      new BatchWriteCommand({ RequestItems: unprocessed })
    );

    unprocessed = result.UnprocessedItems as typeof requestItems | undefined;
    if (!unprocessed || Object.keys(unprocessed).length === 0) {
      return;
    }

    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `BatchWrite still has unprocessed items after ${MAX_RETRIES} retries`
  );
}
