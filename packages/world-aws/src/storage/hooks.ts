import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Storage } from "@workflow/world";
import { decodeCursor, encodeCursor } from "../dynamodb/pagination.js";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { marshalHook } from "./marshal.js";

function stripData(hook: Record<string, unknown>) {
  return {
    ...hook,
    metadata: undefined,
  };
}

export function createHooksStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames
): Storage["hooks"] {
  const tableName = tables.hooks;

  async function get(
    hookId: string,
    params?: { resolveData?: "none" | "all" }
  ) {
    const resolveNone = params?.resolveData === "none";

    const command = new GetCommand({
      TableName: tableName,
      Key: { hookId },
      ...(resolveNone
        ? {
            ProjectionExpression:
              "hookId, runId, #tok, ownerId, projectId, environment, createdAt, specVersion",
            ExpressionAttributeNames: { "#tok": "token" },
          }
        : {}),
    });

    const result = await docClient.send(command);
    if (!result.Item) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const hook = marshalHook(result.Item);
    return resolveNone ? (stripData(hook) as any) : (hook as any);
  }

  async function getByToken(
    token: string,
    params?: { resolveData?: "none" | "all" }
  ) {
    const resolveNone = params?.resolveData === "none";

    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: GSI.hooks.token,
        KeyConditionExpression: "#tok = :t",
        ExpressionAttributeNames: { "#tok": "token" },
        ExpressionAttributeValues: { ":t": token },
        Limit: 1,
        ...(resolveNone
          ? {
              ProjectionExpression:
                "hookId, runId, #tok, ownerId, projectId, environment, createdAt, specVersion",
            }
          : {}),
      })
    );

    const item = result.Items?.[0];
    if (!item) {
      throw new Error("Hook not found for token");
    }

    const hook = marshalHook(item);
    return resolveNone ? (stripData(hook) as any) : (hook as any);
  }

  async function list(params: {
    runId?: string;
    pagination?: {
      limit?: number;
      cursor?: string;
      sortOrder?: "asc" | "desc";
    };
    resolveData?: "none" | "all";
  }) {
    const limit = Math.min(params.pagination?.limit ?? 100, 1000);
    const scanForward = params.pagination?.sortOrder !== "desc";
    const exclusiveStartKey = params.pagination?.cursor
      ? decodeCursor(params.pagination.cursor)
      : undefined;

    const resolveNone = params.resolveData === "none";
    const projectionExpression = resolveNone
      ? "hookId, runId, #tok, ownerId, projectId, environment, createdAt, specVersion"
      : undefined;

    let result;

    if (params.runId) {
      result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI.hooks.run,
          KeyConditionExpression: "runId = :rid",
          ExpressionAttributeValues: { ":rid": params.runId },
          Limit: limit,
          ScanIndexForward: scanForward,
          ...(exclusiveStartKey
            ? { ExclusiveStartKey: exclusiveStartKey }
            : {}),
          ...(projectionExpression
            ? {
                ProjectionExpression: projectionExpression,
                ExpressionAttributeNames: { "#tok": "token" },
              }
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
          ...(projectionExpression
            ? {
                ProjectionExpression: projectionExpression,
                ExpressionAttributeNames: { "#tok": "token" },
              }
            : {}),
        })
      );
    }

    const items = (result.Items ?? []).map((item) => {
      const hook = marshalHook(item);
      return resolveNone ? stripData(hook) : hook;
    });

    return {
      data: items,
      cursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : null,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  return { get, getByToken, list } as Storage["hooks"];
}
