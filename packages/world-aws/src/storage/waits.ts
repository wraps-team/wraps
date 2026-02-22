import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { decodeCursor, encodeCursor } from "../dynamodb/pagination.js";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { wrapAWSError } from "../errors.js";
import { marshalWait } from "./marshal.js";

export function createWaitsStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames
) {
  const tableName = tables.waits;

  async function get(waitId: string) {
    let result;
    try {
      result = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { waitId },
        })
      );
    } catch (e) {
      wrapAWSError(e, "waits.get");
    }

    if (!result.Item) {
      throw new Error(`Wait not found: ${waitId}`);
    }

    return marshalWait(result.Item);
  }

  async function list(params?: {
    runId?: string;
    pagination?: {
      limit?: number;
      cursor?: string;
      sortOrder?: "asc" | "desc";
    };
  }) {
    const limit = Math.min(params?.pagination?.limit ?? 100, 1000);
    const scanForward = params?.pagination?.sortOrder !== "desc";
    const exclusiveStartKey = params?.pagination?.cursor
      ? decodeCursor(params.pagination.cursor)
      : undefined;

    let result;

    try {
      if (params?.runId) {
        result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: GSI.waits.run,
            KeyConditionExpression: "runId = :rid",
            ExpressionAttributeValues: { ":rid": params.runId },
            Limit: limit,
            ScanIndexForward: scanForward,
            ...(exclusiveStartKey
              ? { ExclusiveStartKey: exclusiveStartKey }
              : {}),
          })
        );
      } else {
        result = await docClient.send(
          new ScanCommand({
            TableName: tableName,
            Limit: limit,
            ...(exclusiveStartKey
              ? { ExclusiveStartKey: exclusiveStartKey }
              : {}),
          })
        );
      }
    } catch (e) {
      wrapAWSError(e, "waits.list");
    }

    const items = (result.Items ?? []).map((item) => marshalWait(item));

    return {
      data: items,
      cursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : null,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  return { get, list };
}
