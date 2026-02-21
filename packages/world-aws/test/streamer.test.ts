import { describe, it, expect, vi } from "vitest";
import { createStreamer } from "../src/streamer/index.js";
import { getTableNames } from "../src/dynamodb/tables.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";

const tables = getTableNames("test");
const STREAM_ARN = "arn:aws:dynamodb:us-east-1:123456789012:table/test-streams/stream/2024-01-01T00:00:00.000";

function mockDocClient(): { client: DynamoDBDocumentClient; sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn().mockResolvedValue({});
  return {
    client: { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient,
    sendMock,
  };
}

function mockDDBClient(): { client: DynamoDBClient; sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn().mockResolvedValue({
    Table: { LatestStreamArn: STREAM_ARN },
  });
  return {
    client: { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBClient,
    sendMock,
  };
}

function mockStreamsClient(): { client: DynamoDBStreamsClient; sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn().mockResolvedValue({});
  return {
    client: { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBStreamsClient,
    sendMock,
  };
}

function setupStreamMocks(streamsSendMock: ReturnType<typeof vi.fn>) {
  // DescribeStream → one active shard
  streamsSendMock.mockResolvedValueOnce({
    StreamDescription: {
      Shards: [{
        ShardId: "shard-001",
        SequenceNumberRange: { StartingSequenceNumber: "1" },
      }],
    },
  });
  // GetShardIterator → iterator
  streamsSendMock.mockResolvedValueOnce({
    ShardIterator: "iterator-1",
  });
}

describe("Streamer", () => {
  it("writeToStream() writes a chunk with ULID chunkId", async () => {
    const { client: docClient, sendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();
    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

    await streamer.writeToStream("stream-1", "run-1", "hello");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.input.Item.streamId).toBe("stream-1");
    expect(call.input.Item.runId).toBe("run-1");
    expect(call.input.Item.eof).toBe(false);
    expect(call.input.Item.chunkId).toBeTruthy();
    // Data should be Uint8Array (TextEncoder)
    expect(call.input.Item.data).toBeInstanceOf(Uint8Array);
  });

  it("writeToStream() passes Uint8Array directly", async () => {
    const { client: docClient, sendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();
    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

    const data = new Uint8Array([1, 2, 3]);
    await streamer.writeToStream("stream-1", "run-1", data);

    const call = sendMock.mock.calls[0][0];
    expect(call.input.Item.data).toBe(data);
  });

  it("writeToStreamMulti() batches writes in groups of 25", async () => {
    const { client: docClient, sendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();
    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

    // Write 30 chunks — should result in 2 BatchWrite calls
    const chunks = Array.from({ length: 30 }, (_, i) => `chunk-${i}`);
    await streamer.writeToStreamMulti!("stream-1", "run-1", chunks);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const firstBatch = sendMock.mock.calls[0][0];
    expect(firstBatch.input.RequestItems[tables.streams]).toHaveLength(25);
    const secondBatch = sendMock.mock.calls[1][0];
    expect(secondBatch.input.RequestItems[tables.streams]).toHaveLength(5);
  });

  it("writeToStreamMulti() preserves chunk ordering via ULID", async () => {
    const { client: docClient, sendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();
    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

    await streamer.writeToStreamMulti!("stream-1", "run-1", ["a", "b", "c"]);

    const items = sendMock.mock.calls[0][0].input.RequestItems[tables.streams];
    const chunkIds = items.map((i: { PutRequest: { Item: { chunkId: string } } }) => i.PutRequest.Item.chunkId);
    // ULIDs should be lexicographically sorted
    const sorted = [...chunkIds].sort();
    expect(chunkIds).toEqual(sorted);
  });

  it("closeStream() writes EOF sentinel", async () => {
    const { client: docClient, sendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();
    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);

    await streamer.closeStream("stream-1", "run-1");

    const call = sendMock.mock.calls[0][0];
    expect(call.input.Item.eof).toBe(true);
    expect(call.input.Item.data).toEqual(new Uint8Array(0));
  });

  it("readFromStream() catches up from table then consumes stream records", async () => {
    const { client: docClient, sendMock: docSendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient, sendMock: streamsSendMock } = mockStreamsClient();

    // DescribeStream + GetShardIterator
    setupStreamMocks(streamsSendMock);

    // Catch-up: Query returns existing chunk, then empty
    docSendMock
      .mockResolvedValueOnce({
        Items: [
          { streamId: "s1", chunkId: "001", runId: "r1", data: new TextEncoder().encode("existing"), eof: false },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    // Stream: GetRecords returns new chunk, then EOF
    streamsSendMock
      .mockResolvedValueOnce({
        Records: [{
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
        }],
        NextShardIterator: "iterator-2",
      })
      .mockResolvedValueOnce({
        Records: [{
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
        }],
        NextShardIterator: "iterator-3",
      });

    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);
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
    const { client: docClient, sendMock: docSendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient, sendMock: streamsSendMock } = mockStreamsClient();

    setupStreamMocks(streamsSendMock);

    // Catch-up includes EOF — stream phase never reached
    docSendMock.mockResolvedValueOnce({
      Items: [
        { streamId: "s1", chunkId: "001", runId: "r1", data: new TextEncoder().encode("hello"), eof: false },
        { streamId: "s1", chunkId: "002", runId: "r1", data: new TextEncoder().encode(" world"), eof: false },
        { streamId: "s1", chunkId: "003", runId: "r1", data: new Uint8Array(0), eof: true },
      ],
    });

    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);
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
    const { client: docClient, sendMock: docSendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient, sendMock: streamsSendMock } = mockStreamsClient();

    setupStreamMocks(streamsSendMock);

    // Catch-up: no existing data
    docSendMock.mockResolvedValueOnce({ Items: [] });

    // Stream: mixed records from different streams
    streamsSendMock.mockResolvedValueOnce({
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

    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("mine");

    const r2 = await reader.read();
    expect(r2.done).toBe(true);
  });

  it("readFromStream() deduplicates chunks seen during catch-up", async () => {
    const { client: docClient, sendMock: docSendMock } = mockDocClient();
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient, sendMock: streamsSendMock } = mockStreamsClient();

    setupStreamMocks(streamsSendMock);

    // Catch-up returns a chunk
    docSendMock
      .mockResolvedValueOnce({
        Items: [
          { streamId: "s1", chunkId: "001", runId: "r1", data: new TextEncoder().encode("first"), eof: false },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    // Stream returns the same chunk (overlap) plus a new one and EOF
    streamsSendMock.mockResolvedValueOnce({
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

    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const r1 = await reader.read();
    expect(new TextDecoder().decode(r1.value)).toBe("first");

    const r2 = await reader.read();
    expect(new TextDecoder().decode(r2.value)).toBe("second");

    const r3 = await reader.read();
    expect(r3.done).toBe(true);
  });

  it("listStreamsByRunId() returns distinct stream IDs", async () => {
    const docSendMock = vi.fn().mockResolvedValueOnce({
      Items: [
        { streamId: "stream-a" },
        { streamId: "stream-b" },
        { streamId: "stream-a" }, // duplicate
      ],
      LastEvaluatedKey: undefined,
    });
    const docClient = { send: docSendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;
    const { client: ddbClient } = mockDDBClient();
    const { client: streamsClient } = mockStreamsClient();

    const streamer = createStreamer(docClient, tables, ddbClient, streamsClient);
    const streams = await streamer.listStreamsByRunId("run-1");

    expect(streams).toHaveLength(2);
    expect(streams).toContain("stream-a");
    expect(streams).toContain("stream-b");

    // Should use the GSI
    const call = docSendMock.mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-run");
  });
});
