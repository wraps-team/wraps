import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { TableNames } from "../dynamodb/tables.js";
import { createEventsStorage } from "./events.js";
import { createHooksStorage } from "./hooks.js";
import { createRunsStorage } from "./runs.js";
import { createStepsStorage } from "./steps.js";
import { createWaitsStorage } from "./waits.js";

export function createStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames,
  ttlSeconds?: number
) {
  return {
    runs: createRunsStorage(docClient, tables),
    steps: createStepsStorage(docClient, tables),
    hooks: createHooksStorage(docClient, tables),
    events: createEventsStorage(docClient, tables, ttlSeconds),
    waits: createWaitsStorage(docClient, tables),
  };
}

export { createEventsStorage } from "./events.js";
export { createHooksStorage } from "./hooks.js";
export { createRunsStorage } from "./runs.js";
export { createStepsStorage } from "./steps.js";
export { createWaitsStorage } from "./waits.js";
