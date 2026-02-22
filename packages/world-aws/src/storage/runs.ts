import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Storage } from "@workflow/world";
import { decodeCursor, encodeCursor } from "../dynamodb/pagination.js";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { wrapAWSError } from "../errors.js";
import { marshalRun } from "./marshal.js";

function stripData(run: Record<string, unknown>) {
  return {
    ...run,
    input: undefined,
    output: undefined,
  };
}

export function createRunsStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames
): Storage["runs"] {
  const tableName = tables.runs;

  async function get(id: string, params?: { resolveData?: "none" | "all" }) {
    const command = new GetCommand({
      TableName: tableName,
      Key: { runId: id },
      ...(params?.resolveData === "none"
        ? {
            ProjectionExpression:
              "runId, #s, deploymentId, workflowName, specVersion, executionContext, #err, expiredAt, startedAt, completedAt, createdAt, updatedAt",
            ExpressionAttributeNames: { "#s": "status", "#err": "error" },
          }
        : {}),
    });

    let result;
    try {
      result = await docClient.send(command);
    } catch (e) {
      wrapAWSError(e, "runs.get");
    }
    if (!result.Item) {
      throw new Error(`Run not found: ${id}`);
    }

    const run = marshalRun(result.Item);
    if (params?.resolveData === "none") {
      return stripData(run) as any;
    }
    return run as any;
  }

  async function list(params?: {
    workflowName?: string;
    status?: string;
    pagination?: {
      limit?: number;
      cursor?: string;
      sortOrder?: "asc" | "desc";
    };
    resolveData?: "none" | "all";
  }) {
    const limit = Math.min(params?.pagination?.limit ?? 100, 1000);
    const scanForward = params?.pagination?.sortOrder !== "desc";
    const exclusiveStartKey = params?.pagination?.cursor
      ? decodeCursor(params.pagination.cursor)
      : undefined;

    const resolveNone = params?.resolveData === "none";
    const projectionExpression = resolveNone
      ? "runId, #s, deploymentId, workflowName, specVersion, executionContext, #err, expiredAt, startedAt, completedAt, createdAt, updatedAt"
      : undefined;
    const expressionAttributeNames = resolveNone
      ? { "#s": "status", "#err": "error" }
      : undefined;

    let result;

    try {
      if (params?.workflowName) {
        result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: GSI.runs.workflowName,
            KeyConditionExpression: "workflowName = :wn",
            ExpressionAttributeValues: { ":wn": params.workflowName },
            Limit: limit,
            ScanIndexForward: scanForward,
            ...(exclusiveStartKey
              ? { ExclusiveStartKey: exclusiveStartKey }
              : {}),
            ...(projectionExpression
              ? {
                  ProjectionExpression: projectionExpression,
                  ExpressionAttributeNames: expressionAttributeNames,
                }
              : {}),
          })
        );
      } else if (params?.status) {
        result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: GSI.runs.status,
            KeyConditionExpression: "#s = :st",
            ExpressionAttributeValues: { ":st": params.status },
            ExpressionAttributeNames: {
              "#s": "status",
              ...(resolveNone ? { "#err": "error" } : {}),
            },
            Limit: limit,
            ScanIndexForward: scanForward,
            ...(exclusiveStartKey
              ? { ExclusiveStartKey: exclusiveStartKey }
              : {}),
            ...(projectionExpression
              ? { ProjectionExpression: projectionExpression }
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
                  ExpressionAttributeNames: expressionAttributeNames,
                }
              : {}),
          })
        );
      }
    } catch (e) {
      wrapAWSError(e, "runs.list");
    }

    const items = (result.Items ?? []).map((item) => {
      const run = marshalRun(item);
      return resolveNone ? stripData(run) : run;
    });

    return {
      data: items,
      cursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : null,
      hasMore: !!result.LastEvaluatedKey,
    } as any;
  }

  return { get, list } as Storage["runs"];
}
