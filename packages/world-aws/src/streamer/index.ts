import {
  DescribeTableCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  type DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  BatchWriteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { monotonicFactory } from "ulid";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";

const generateId = monotonicFactory();
const encoder = new TextEncoder();
const POLL_INTERVAL_MS = 200;
const BATCH_WRITE_LIMIT = 25;

function toBytes(chunk: string | Uint8Array): Uint8Array {
  return typeof chunk === "string" ? encoder.encode(chunk) : chunk;
}

export function createStreamer(
  docClient: DynamoDBDocumentClient,
  tables: TableNames,
  ddbClient: DynamoDBClient,
  streamsClient: DynamoDBStreamsClient
) {
  const tableName = tables.streams;
  let cachedStreamArn: string | undefined;

  async function writeToStream(
    name: string,
    runId: string,
    chunk: string | Uint8Array
  ): Promise<void> {
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
      })
    );
  }

  async function writeToStreamMulti(
    name: string,
    runId: string,
    chunks: (string | Uint8Array)[]
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
        })
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
      })
    );
  }

  async function getStreamArn(): Promise<string> {
    if (cachedStreamArn) return cachedStreamArn;
    const result = await ddbClient.send(
      new DescribeTableCommand({ TableName: tableName })
    );
    const arn = result.Table?.LatestStreamArn;
    if (!arn) throw new Error(`No stream ARN found for table ${tableName}`);
    cachedStreamArn = arn;
    return arn;
  }

  async function getShardIterators(streamArn: string): Promise<string[]> {
    const shards: Array<{
      ShardId?: string;
      SequenceNumberRange?: { EndingSequenceNumber?: string };
    }> = [];
    let exclusiveStartShardId: string | undefined;

    do {
      const result = await streamsClient.send(
        new DescribeStreamCommand({
          StreamArn: streamArn,
          ...(exclusiveStartShardId
            ? { ExclusiveStartShardId: exclusiveStartShardId }
            : {}),
        })
      );
      shards.push(...(result.StreamDescription?.Shards ?? []));
      exclusiveStartShardId =
        result.StreamDescription?.LastEvaluatedShardId ?? undefined;
    } while (exclusiveStartShardId);

    // Active shards have no EndingSequenceNumber
    const activeShards = shards.filter(
      (s) => !s.SequenceNumberRange?.EndingSequenceNumber
    );

    const iterators: string[] = [];
    for (const shard of activeShards) {
      const result = await streamsClient.send(
        new GetShardIteratorCommand({
          StreamArn: streamArn,
          ShardId: shard.ShardId!,
          ShardIteratorType: "LATEST",
        })
      );
      if (result.ShardIterator) {
        iterators.push(result.ShardIterator);
      }
    }

    return iterators;
  }

  async function readFromStream(
    name: string,
    startIndex?: number,
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    let lastChunkId: string | undefined;
    let chunksSeen = 0;

    // Acquire shard iterators BEFORE catch-up to avoid missing records in the gap
    const streamArn = await getStreamArn();
    let shardIterators = await getShardIterators(streamArn);

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Phase 1: Catch up from existing table data
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
              ConsistentRead: true,
            })
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

          if (items.length === 0) break; // Caught up with existing data
        }

        // Phase 2: Consume new records from DynamoDB Streams
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (signal?.aborted) {
            controller.close();
            return;
          }
          for (let i = 0; i < shardIterators.length; i++) {
            const iterator = shardIterators[i];
            if (!iterator) continue;

            try {
              const response = await streamsClient.send(
                new GetRecordsCommand({ ShardIterator: iterator })
              );

              shardIterators[i] = response.NextShardIterator ?? "";

              for (const record of response.Records ?? []) {
                if (record.eventName !== "INSERT") continue;
                const image = record.dynamodb?.NewImage;
                if (!image) continue;

                const recordStreamId = image.streamId?.S;
                if (recordStreamId !== name) continue;

                const recordChunkId = image.chunkId?.S;
                // Skip chunks already seen during catch-up
                if (
                  lastChunkId &&
                  recordChunkId &&
                  recordChunkId <= lastChunkId
                )
                  continue;

                if (recordChunkId) lastChunkId = recordChunkId;

                if (image.eof?.BOOL) {
                  controller.close();
                  return;
                }

                chunksSeen++;
                if (startIndex !== undefined && chunksSeen <= startIndex)
                  continue;

                const data = image.data?.B;
                if (data && data.length > 0) {
                  controller.enqueue(new Uint8Array(data));
                }
              }
            } catch (e) {
              if (e instanceof Error && e.name === "ExpiredIteratorException") {
                shardIterators = await getShardIterators(streamArn);
                break; // Restart the shard polling loop
              }
              throw e;
            }
          }

          // Remove exhausted shards (empty iterator string)
          shardIterators = shardIterators.filter(Boolean);

          if (shardIterators.length === 0) {
            // All shards exhausted — re-discover
            shardIterators = await getShardIterators(streamArn);
          }

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
          ...(exclusiveStartKey
            ? { ExclusiveStartKey: exclusiveStartKey }
            : {}),
        })
      );

      for (const item of result.Items ?? []) {
        seen.add(item.streamId as string);
      }

      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
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
