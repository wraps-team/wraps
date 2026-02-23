import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/dynamodb/pagination.js";

describe("Pagination", () => {
  it("round-trips a simple key", () => {
    const key = { runId: "run-123" };
    const cursor = encodeCursor(key);
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual(key);
  });

  it("round-trips a composite key", () => {
    const key = { runId: "run-1", eventId: "evt-1" };
    const cursor = encodeCursor(key);
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual(key);
  });

  it("produces base64url-safe string (no +, /, =)", () => {
    // Use a key that would produce +/= in standard base64
    const key = { id: ">>>???<<<" };
    const cursor = encodeCursor(key);

    expect(cursor).not.toMatch(/[+/=]/);
  });

  it("decodes a known base64url value", () => {
    const key = { pk: "test" };
    const encoded = Buffer.from(JSON.stringify(key)).toString("base64url");
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(key);
  });

  it("handles keys with special characters", () => {
    const key = { runId: "run_2024-01-01T00:00:00.000Z", status: "running" };
    const cursor = encodeCursor(key);
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual(key);
  });

  it("throws on malformed cursor", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow("Invalid cursor");
  });

  it("throws on non-JSON base64 cursor", () => {
    const cursor = Buffer.from("not json").toString("base64url");
    expect(() => decodeCursor(cursor)).toThrow("Invalid cursor");
  });
});
