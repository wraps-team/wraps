import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableNames } from "../src/dynamodb/tables.js";
import { createStreamer } from "../src/streamer/index.js";

const tables = getTableNames("test");
const STREAM_ARN =
  "arn:aws:dynamodb:us-east-1:123456789012:table/test-streams/stream/2024-01-01T00:00:00.000";

const docMock = mockClient(DynamoDBDocumentClient);
const ddbMock = mockClient(DynamoDBClient);
const streamsMock = mockClient(DynamoDBStreamsClient);

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" })
);
const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const streamsClient = new DynamoDBStreamsClient({ region: "us-east-1" });

beforeEach(() => {
  docMock.reset();
  ddbMock.reset();
  streamsMock.reset();

  // Default: DescribeTable returns stream ARN
  ddbMock.on(DescribeTableCommand).resolves({
    Table: { LatestStreamArn: STREAM_ARN },
  });
});

function setupStreamMocks() {
  streamsMock.on(DescribeStreamCommand).resolves({
    StreamDescription: {
      Shards: [
        {
          ShardId: "shard-001",
          SequenceNumberRange: { StartingSequenceNumber: "1" },
        },
      ],
    },
  });
  streamsMock.on(GetShardIteratorCommand).resolves({
    ShardIterator: "iterator-1",
  });
}

describe("Streamer", () => {
  it("writeToStream() writes a chunk with ULID chunkId", async () => {
    docMock.on(PutCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    await streamer.writeToStream("stream-1", "run-1", "hello");

    const calls = docMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    const item = calls[0].args[0].input.Item!;
    expect(item.streamId).toBe("stream-1");
    expect(item.runId).toBe("run-1");
    expect(item.eof).toBe(false);
    expect(item.chunkId).toBeTruthy();
    expect(item.data).toBeInstanceOf(Uint8Array);
  });

  it("writeToStream() passes Uint8Array directly", async () => {
    docMock.on(PutCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    const data = new Uint8Array([1, 2, 3]);
    await streamer.writeToStream("stream-1", "run-1", data);

    const calls = docMock.commandCalls(PutCommand);
    expect(calls[0].args[0].input.Item!.data).toBe(data);
  });

  it("writeToStreamMulti() batches writes in groups of 25", async () => {
    docMock.on(BatchWriteCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    const chunks = Array.from({ length: 30 }, (_, i) => `chunk-${i}`);
    await streamer.writeToStreamMulti!("stream-1", "run-1", chunks);

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[0].input.RequestItems![tables.streams]).toHaveLength(
      25
    );
    expect(calls[1].args[0].input.RequestItems![tables.streams]).toHaveLength(
      5
    );
  });

  it("writeToStreamMulti() preserves chunk ordering via ULID", async () => {
    docMock.on(BatchWriteCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    await streamer.writeToStreamMulti!("stream-1", "run-1", ["a", "b", "c"]);

    const calls = docMock.commandCalls(BatchWriteCommand);
    const items = calls[0].args[0].input.RequestItems![tables.streams]!;
    const chunkIds = items.map((i) => i.PutRequest!.Item!.chunkId as string);
    const sorted = [...chunkIds].sort();
    expect(chunkIds).toEqual(sorted);
  });

  it("closeStream() writes EOF sentinel", async () => {
    docMock.on(PutCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    await streamer.closeStream("stream-1", "run-1");

    const calls = docMock.commandCalls(PutCommand);
    expect(calls[0].args[0].input.Item!.eof).toBe(true);
    expect(calls[0].args[0].input.Item!.data).toEqual(new Uint8Array(0));
  });

  it("readFromStream() catches up from table then consumes stream records", async () => {
    setupStreamMocks();

    // Catch-up: Query returns existing chunk, then empty
    docMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          {
            streamId: "s1",
            chunkId: "001",
            runId: "r1",
            data: new TextEncoder().encode("existing"),
            eof: false,
          },
        ],
      })
      .resolvesOnce({ Items: [] });

    // Stream: GetRecords returns new chunk, then EOF
    streamsMock
      .on(GetRecordsCommand)
      .resolvesOnce({
        Records: [
          {
            eventName: "INSERT",
            dynamodb: {
              NewImage: {
                streamId: { S: "s1" },
                chunkId: { S: "002" },
                runId: { S: "r1" },
                data: { B: new TextEncoder().encode("streamed") },
                eof: { BOOL: false },
              },
            },
          },
        ],
        NextShardIterator: "iterator-2",
      })
      .resolvesOnce({
        Records: [
          {
            eventName: "INSERT",
            dynamodb: {
              NewImage: {
                streamId: { S: "s1" },
                chunkId: { S: "003" },
                runId: { S: "r1" },
                data: { B: new Uint8Array(0) },
                eof: { BOOL: true },
              },
            },
          },
        ],
        NextShardIterator: "iterator-3",
      });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const result1 = await reader.read();
    expect(new TextDecoder().decode(result1.value)).toBe("existing");

    const result2 = await reader.read();
    expect(new TextDecoder().decode(result2.value)).toBe("streamed");

    const result3 = await reader.read();
    expect(result3.done).toBe(true);
  });

  it("readFromStream() closes on EOF from table catch-up", async () => {
    setupStreamMocks();

    docMock.on(QueryCommand).resolves({
      Items: [
        {
          streamId: "s1",
          chunkId: "001",
          runId: "r1",
          data: new TextEncoder().encode("hello"),
          eof: false,
        },
        {
          streamId: "s1",
          chunkId: "002",
          runId: "r1",
          data: new TextEncoder().encode(" world"),
          eof: false,
        },
        {
          streamId: "s1",
          chunkId: "003",
          runId: "r1",
          data: new Uint8Array(0),
          eof: true,
        },
      ],
    });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("hello");

    const r2 = await reader.read();
    expect(new TextDecoder().decode(r2.value)).toBe(" world");

    const r3 = await reader.read();
    expect(r3.done).toBe(true);
  });

  it("readFromStream() filters out records for other streamIds", async () => {
    setupStreamMocks();

    docMock.on(QueryCommand).resolves({ Items: [] });

    streamsMock.on(GetRecordsCommand).resolves({
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "other-stream" },
              chunkId: { S: "001" },
              runId: { S: "r1" },
              data: { B: new TextEncoder().encode("not mine") },
              eof: { BOOL: false },
            },
          },
        },
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "s1" },
              chunkId: { S: "002" },
              runId: { S: "r1" },
              data: { B: new TextEncoder().encode("mine") },
              eof: { BOOL: false },
            },
          },
        },
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "s1" },
              chunkId: { S: "003" },
              runId: { S: "r1" },
              data: { B: new Uint8Array(0) },
              eof: { BOOL: true },
            },
          },
        },
      ],
      NextShardIterator: "iterator-2",
    });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("mine");

    const r2 = await reader.read();
    expect(r2.done).toBe(true);
  });

  it("readFromStream() deduplicates chunks seen during catch-up", async () => {
    setupStreamMocks();

    docMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          {
            streamId: "s1",
            chunkId: "001",
            runId: "r1",
            data: new TextEncoder().encode("first"),
            eof: false,
          },
        ],
      })
      .resolvesOnce({ Items: [] });

    streamsMock.on(GetRecordsCommand).resolves({
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "s1" },
              chunkId: { S: "001" }, // Already seen in catch-up
              runId: { S: "r1" },
              data: { B: new TextEncoder().encode("first") },
              eof: { BOOL: false },
            },
          },
        },
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "s1" },
              chunkId: { S: "002" },
              runId: { S: "r1" },
              data: { B: new TextEncoder().encode("second") },
              eof: { BOOL: false },
            },
          },
        },
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              streamId: { S: "s1" },
              chunkId: { S: "003" },
              runId: { S: "r1" },
              data: { B: new Uint8Array(0) },
              eof: { BOOL: true },
            },
          },
        },
      ],
      NextShardIterator: "iterator-2",
    });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("first");

    const r2 = await reader.read();
    expect(new TextDecoder().decode(r2.value)).toBe("second");

    const r3 = await reader.read();
    expect(r3.done).toBe(true);
  });

  it("readFromStream() skips chunks before startIndex", async () => {
    setupStreamMocks();

    docMock.on(QueryCommand).resolves({
      Items: [
        {
          streamId: "s1",
          chunkId: "001",
          runId: "r1",
          data: new TextEncoder().encode("first"),
          eof: false,
        },
        {
          streamId: "s1",
          chunkId: "002",
          runId: "r1",
          data: new TextEncoder().encode("second"),
          eof: false,
        },
        {
          streamId: "s1",
          chunkId: "003",
          runId: "r1",
          data: new TextEncoder().encode("third"),
          eof: false,
        },
        {
          streamId: "s1",
          chunkId: "004",
          runId: "r1",
          data: new Uint8Array(0),
          eof: true,
        },
      ],
    });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1", 2);

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("third");

    const r2 = await reader.read();
    expect(r2.done).toBe(true);
  });

  it("readFromStream() recovers from ExpiredIteratorException", async () => {
    setupStreamMocks();

    docMock.on(QueryCommand).resolves({ Items: [] });

    streamsMock
      .on(GetRecordsCommand)
      .rejectsOnce(
        Object.assign(new Error("Iterator expired"), {
          name: "ExpiredIteratorException",
        })
      )
      .resolvesOnce({
        Records: [
          {
            eventName: "INSERT",
            dynamodb: {
              NewImage: {
                streamId: { S: "s1" },
                chunkId: { S: "001" },
                runId: { S: "r1" },
                data: { B: new TextEncoder().encode("recovered") },
                eof: { BOOL: false },
              },
            },
          },
        ],
        NextShardIterator: "iterator-3",
      })
      .resolvesOnce({
        Records: [
          {
            eventName: "INSERT",
            dynamodb: {
              NewImage: {
                streamId: { S: "s1" },
                chunkId: { S: "002" },
                runId: { S: "r1" },
                data: { B: new Uint8Array(0) },
                eof: { BOOL: true },
              },
            },
          },
        ],
        NextShardIterator: "iterator-4",
      });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("recovered");

    const r2 = await reader.read();
    expect(r2.done).toBe(true);
  });

  it("readFromStream() respects AbortSignal", async () => {
    setupStreamMocks();

    docMock.on(QueryCommand).resolves({ Items: [] });

    streamsMock.on(GetRecordsCommand).resolves({
      Records: [],
      NextShardIterator: "iterator-2",
    });

    const ac = new AbortController();
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const stream = await streamer.readFromStream("s1", undefined, ac.signal);

    // Abort after a short delay (before poll interval completes)
    setTimeout(() => ac.abort(), 50);

    const reader = stream.getReader();
    const result = await reader.read();
    expect(result.done).toBe(true);
  });

  it("writeToStreamMulti() with 0 chunks is a no-op", async () => {
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    await streamer.writeToStreamMulti!("stream-1", "run-1", []);

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(0);
  });

  it("writeToStreamMulti() with exactly 25 chunks sends 1 batch", async () => {
    docMock.on(BatchWriteCommand).resolves({});
    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );

    const chunks = Array.from({ length: 25 }, (_, i) => `chunk-${i}`);
    await streamer.writeToStreamMulti!("stream-1", "run-1", chunks);

    const calls = docMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.RequestItems![tables.streams]).toHaveLength(
      25
    );
  });

  it("listStreamsByRunId() returns distinct stream IDs", async () => {
    docMock.on(QueryCommand).resolves({
      Items: [
        { streamId: "stream-a" },
        { streamId: "stream-b" },
        { streamId: "stream-a" }, // duplicate
      ],
    });

    const streamer = createStreamer(
      docClient,
      tables,
      ddbClient,
      streamsClient
    );
    const streams = await streamer.listStreamsByRunId("run-1");

    expect(streams).toHaveLength(2);
    expect(streams).toContain("stream-a");
    expect(streams).toContain("stream-b");

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-run");
  });
});
