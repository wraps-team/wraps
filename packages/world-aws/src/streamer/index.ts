import { PutCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { monotonicFactory } from "ulid";

const generateId = monotonicFactory();
const encoder = new TextEncoder();
const POLL_INTERVAL_MS = 200;
const BATCH_WRITE_LIMIT = 25;

function toBytes(chunk: string | Uint8Array): Uint8Array {
  return typeof chunk === "string" ? encoder.encode(chunk) : chunk;
}

export function createStreamer(docClient: DynamoDBDocumentClient, tables: TableNames) {
  const tableName = tables.streams;

  async function writeToStream(name: string, runId: string, chunk: string | Uint8Array): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          streamId: name,
          chunkId: generateId(),
          runId,
          data: toBytes(chunk),
          eof: false,
        },
      }),
    );
  }

  async function writeToStreamMulti(
    name: string,
    runId: string,
    chunks: (string | Uint8Array)[],
  ): Promise<void> {
    // Pre-generate all ULIDs to preserve ordering
    const items = chunks.map((chunk) => ({
      streamId: name,
      chunkId: generateId(),
      runId,
      data: toBytes(chunk),
      eof: false,
    }));

    // BatchWrite in groups of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += BATCH_WRITE_LIMIT) {
      const batch = items.slice(i, i + BATCH_WRITE_LIMIT);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }),
      );
    }
  }

  async function closeStream(name: string, runId: string): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          streamId: name,
          chunkId: generateId(),
          runId,
          data: new Uint8Array(0),
          eof: true,
        },
      }),
    );
  }

  async function readFromStream(name: string, startIndex?: number): Promise<ReadableStream<Uint8Array>> {
    // Poll-based approach: query chunks, poll for new ones until EOF.
    // Future optimization: use DynamoDB Streams + WebSocket for true push.
    let lastChunkId: string | undefined;
    let chunksSeen = 0;

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = await docClient.send(
            new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: lastChunkId
                ? "streamId = :sid AND chunkId > :last"
                : "streamId = :sid",
              ExpressionAttributeValues: {
                ":sid": name,
                ...(lastChunkId ? { ":last": lastChunkId } : {}),
              },
              ScanIndexForward: true,
            }),
          );

          const items = result.Items ?? [];

          for (const item of items) {
            lastChunkId = item.chunkId as string;

            if (item.eof) {
              controller.close();
              return;
            }

            chunksSeen++;
            if (startIndex !== undefined && chunksSeen <= startIndex) {
              continue;
            }

            const data = item.data as Uint8Array;
            if (data.length > 0) {
              controller.enqueue(data);
            }
          }

          if (items.length > 0) {
            // Got some data but no EOF, check if there's more immediately
            continue;
          }

          // No new items — wait and poll again
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      },
    });
  }

  async function listStreamsByRunId(runId: string): Promise<string[]> {
    const seen = new Set<string>();
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI.streams.run,
          KeyConditionExpression: "runId = :rid",
          ExpressionAttributeValues: { ":rid": runId },
          ProjectionExpression: "streamId",
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }),
      );

      for (const item of result.Items ?? []) {
        seen.add(item.streamId as string);
      }

      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return [...seen];
  }

  return {
    writeToStream,
    writeToStreamMulti,
    closeStream,
    readFromStream,
    listStreamsByRunId,
  };
}
