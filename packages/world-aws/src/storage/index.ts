import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { TableNames } from "../dynamodb/tables.js";
import { createRunsStorage } from "./runs.js";
import { createStepsStorage } from "./steps.js";
import { createHooksStorage } from "./hooks.js";
import { createEventsStorage } from "./events.js";

export function createStorage(docClient: DynamoDBDocumentClient, tables: TableNames) {
  return {
    runs: createRunsStorage(docClient, tables),
    steps: createStepsStorage(docClient, tables),
    hooks: createHooksStorage(docClient, tables),
    events: createEventsStorage(docClient, tables),
  };
}

export { createRunsStorage } from "./runs.js";
export { createStepsStorage } from "./steps.js";
export { createHooksStorage } from "./hooks.js";
export { createEventsStorage } from "./events.js";
