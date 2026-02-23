import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { batchWriteWithRetry } from "../src/dynamodb/batch-write.js";

const docMock = mockClient(DynamoDBDocumentClient);

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" })
);

beforeEach(() => {
  docMock.reset();
});

describe("batchWriteWithRetry", () => {
  it("succeeds when no UnprocessedItems", async () => {
    docMock.on(BatchWriteCommand).resolves({});

    await batchWriteWithRetry(docClient, {
      "test-table": [
        { PutRequest: { Item: { id: "1" } } },
        { PutRequest: { Item: { id: "2" } } },
      ],
    });

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
  });

  it("retries UnprocessedItems until resolved", async () => {
    docMock
      .on(BatchWriteCommand)
      .resolvesOnce({
        UnprocessedItems: {
          "test-table": [{ PutRequest: { Item: { id: "2" } } }],
        },
      })
      .resolvesOnce({});

    await batchWriteWithRetry(docClient, {
      "test-table": [
        { PutRequest: { Item: { id: "1" } } },
        { PutRequest: { Item: { id: "2" } } },
      ],
    });

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(2);
    // Second call should only contain the unprocessed item
    expect(calls[1].args[0].input.RequestItems!["test-table"]).toHaveLength(1);
  });

  it("throws after max retries with remaining UnprocessedItems", async () => {
    docMock.on(BatchWriteCommand).resolves({
      UnprocessedItems: {
        "test-table": [{ PutRequest: { Item: { id: "stuck" } } }],
      },
    });

    await expect(
      batchWriteWithRetry(docClient, {
        "test-table": [{ PutRequest: { Item: { id: "stuck" } } }],
      })
    ).rejects.toThrow("unprocessed items after 3 retries");
  });

  it("handles DeleteRequest items", async () => {
    docMock.on(BatchWriteCommand).resolves({});

    await batchWriteWithRetry(docClient, {
      "test-table": [
        { DeleteRequest: { Key: { hookId: "h1" } } },
        { DeleteRequest: { Key: { hookId: "h2" } } },
      ],
    });

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
  });

  it("treats empty UnprocessedItems object as success", async () => {
    docMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} });

    await batchWriteWithRetry(docClient, {
      "test-table": [{ PutRequest: { Item: { id: "1" } } }],
    });

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
  });
});
