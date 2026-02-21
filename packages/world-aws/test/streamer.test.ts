import { describe, it, expect, vi } from "vitest";
import { createStreamer } from "../src/streamer/index.js";
import { getTableNames } from "../src/dynamodb/tables.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const tables = getTableNames("test");

function mockDocClient(): { client: DynamoDBDocumentClient; sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn().mockResolvedValue({});
  return {
    client: { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient,
    sendMock,
  };
}

describe("Streamer", () => {
  it("writeToStream() writes a chunk with ULID chunkId", async () => {
    const { client, sendMock } = mockDocClient();
    const streamer = createStreamer(client, tables);

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
    const { client, sendMock } = mockDocClient();
    const streamer = createStreamer(client, tables);

    const data = new Uint8Array([1, 2, 3]);
    await streamer.writeToStream("stream-1", "run-1", data);

    const call = sendMock.mock.calls[0][0];
    expect(call.input.Item.data).toBe(data);
  });

  it("writeToStreamMulti() batches writes in groups of 25", async () => {
    const { client, sendMock } = mockDocClient();
    const streamer = createStreamer(client, tables);

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
    const { client, sendMock } = mockDocClient();
    const streamer = createStreamer(client, tables);

    await streamer.writeToStreamMulti!("stream-1", "run-1", ["a", "b", "c"]);

    const items = sendMock.mock.calls[0][0].input.RequestItems[tables.streams];
    const chunkIds = items.map((i: { PutRequest: { Item: { chunkId: string } } }) => i.PutRequest.Item.chunkId);
    // ULIDs should be lexicographically sorted
    const sorted = [...chunkIds].sort();
    expect(chunkIds).toEqual(sorted);
  });

  it("closeStream() writes EOF sentinel", async () => {
    const { client, sendMock } = mockDocClient();
    const streamer = createStreamer(client, tables);

    await streamer.closeStream("stream-1", "run-1");

    const call = sendMock.mock.calls[0][0];
    expect(call.input.Item.eof).toBe(true);
    expect(call.input.Item.data).toEqual(new Uint8Array(0));
  });

  it("readFromStream() returns a ReadableStream that yields chunks", async () => {
    const chunks = [
      { streamId: "s1", chunkId: "001", runId: "r1", data: new TextEncoder().encode("hello"), eof: false },
      { streamId: "s1", chunkId: "002", runId: "r1", data: new TextEncoder().encode(" world"), eof: false },
      { streamId: "s1", chunkId: "003", runId: "r1", data: new Uint8Array(0), eof: true },
    ];

    const sendMock = vi.fn()
      .mockResolvedValueOnce({ Items: chunks })
      .mockResolvedValue({ Items: [] });
    const client = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const streamer = createStreamer(client, tables);
    const stream = await streamer.readFromStream("s1");

    const reader = stream.getReader();
    const result1 = await reader.read();
    expect(new TextDecoder().decode(result1.value)).toBe("hello");

    const result2 = await reader.read();
    expect(new TextDecoder().decode(result2.value)).toBe(" world");

    const result3 = await reader.read();
    expect(result3.done).toBe(true);
  });

  it("listStreamsByRunId() returns distinct stream IDs", async () => {
    const sendMock = vi.fn().mockResolvedValueOnce({
      Items: [
        { streamId: "stream-a" },
        { streamId: "stream-b" },
        { streamId: "stream-a" }, // duplicate
      ],
      LastEvaluatedKey: undefined,
    });
    const client = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const streamer = createStreamer(client, tables);
    const streams = await streamer.listStreamsByRunId("run-1");

    expect(streams).toHaveLength(2);
    expect(streams).toContain("stream-a");
    expect(streams).toContain("stream-b");

    // Should use the GSI
    const call = sendMock.mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-run");
  });
});
