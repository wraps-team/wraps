import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Storage } from "@workflow/world";
import { decodeCursor, encodeCursor } from "../dynamodb/pagination.js";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { wrapAWSError } from "../errors.js";
import { marshalStep } from "./marshal.js";

function stripData(step: Record<string, unknown>) {
  return {
    ...step,
    input: undefined,
    output: undefined,
  };
}

export function createStepsStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames
): Storage["steps"] {
  const tableName = tables.steps;

  async function get(
    _runId: string | undefined,
    stepId: string,
    params?: { resolveData?: "none" | "all" }
  ) {
    const command = new GetCommand({
      TableName: tableName,
      Key: { stepId },
      ...(params?.resolveData === "none"
        ? {
            ProjectionExpression:
              "stepId, runId, stepName, #s, attempt, #err, retryAfter, startedAt, completedAt, createdAt, updatedAt, specVersion",
            ExpressionAttributeNames: { "#s": "status", "#err": "error" },
          }
        : {}),
    });

    let result;
    try {
      result = await docClient.send(command);
    } catch (e) {
      wrapAWSError(e, "steps.get");
    }
    if (!result.Item) {
      throw new Error(`Step not found: ${stepId}`);
    }

    const step = marshalStep(result.Item);
    if (params?.resolveData === "none") {
      return stripData(step) as any;
    }
    return step as any;
  }

  async function list(params: {
    runId: string;
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
      ? "stepId, runId, stepName, #s, attempt, #err, retryAfter, startedAt, completedAt, createdAt, updatedAt, specVersion"
      : undefined;
    const expressionAttributeNames = resolveNone
      ? { "#s": "status", "#err": "error" }
      : undefined;

    let result;
    try {
      result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI.steps.run,
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
                ExpressionAttributeNames: expressionAttributeNames,
              }
            : {}),
        })
      );
    } catch (e) {
      wrapAWSError(e, "steps.list");
    }

    const items = (result.Items ?? []).map((item) => {
      const step = marshalStep(item);
      return resolveNone ? stripData(step) : step;
    });

    return {
      data: items,
      cursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : null,
      hasMore: !!result.LastEvaluatedKey,
    } as any;
  }

  return { get, list } as Storage["steps"];
}
