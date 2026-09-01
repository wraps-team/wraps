import { describe, expect, it } from "vitest";
import {
  chunkForImport,
  IMPORT_CHUNK_ROWS,
  serializedBytes,
} from "../import-chunks";

describe("chunkForImport", () => {
  it("returns nothing for an empty list", () => {
    expect(chunkForImport([])).toEqual([]);
  });

  it("keeps a small import in a single call", () => {
    const items = [{ email: "a@example.com" }, { email: "b@example.com" }];

    expect(chunkForImport(items)).toEqual([items]);
  });

  it("splits on the row budget", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ i }));

    expect(chunkForImport(items, { maxRows: 2 })).toEqual([
      [{ i: 0 }, { i: 1 }],
      [{ i: 2 }, { i: 3 }],
      [{ i: 4 }],
    ]);
  });

  it("splits on the byte budget before the row budget is reached", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      email: `contact-${i}@example.com`,
    }));
    const perItem = serializedBytes(items[0]) + 1;

    const chunks = chunkForImport(items, {
      maxBytes: perItem * 3 + 2,
      maxRows: 1000,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(serializedBytes(chunk)).toBeLessThanOrEqual(perItem * 3 + 2);
    }
  });

  it("loses no rows and keeps their order when it splits", () => {
    const items = Array.from({ length: 47 }, (_, i) => ({ i }));

    const chunks = chunkForImport(items, { maxRows: 10 });

    expect(chunks.flat()).toEqual(items);
  });

  it("gives an item larger than the whole budget its own chunk rather than dropping it", () => {
    const huge = { properties: { blob: "x".repeat(5000) } };
    const items = [{ i: 1 }, huge, { i: 2 }];

    const chunks = chunkForImport(items, { maxBytes: 100, maxRows: 1000 });

    expect(chunks.flat()).toEqual(items);
    expect(chunks).toContainEqual([huge]);
  });

  it("splits by size, not by a fixed row count, when rows differ in width", () => {
    // Ten rows carrying custom properties serialize far wider than ten bare
    // emails, so the same row count must not produce the same request size.
    const narrow = Array.from({ length: 200 }, () => ({ email: "a@b.co" }));
    const wide = Array.from({ length: 200 }, () => ({
      email: "a@b.co",
      properties: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`field_${i}`, "value".repeat(20)])
      ),
    }));

    const budget = 8000;
    const narrowChunks = chunkForImport(narrow, { maxBytes: budget });
    const wideChunks = chunkForImport(wide, { maxBytes: budget });

    expect(wideChunks.length).toBeGreaterThan(narrowChunks.length);
    for (const chunk of [...narrowChunks, ...wideChunks]) {
      expect(serializedBytes(chunk)).toBeLessThanOrEqual(budget);
    }
  });

  it("defaults to a row ceiling that keeps a database batch bounded", () => {
    const items = Array.from({ length: IMPORT_CHUNK_ROWS + 1 }, (_, i) => ({
      i,
    }));

    const chunks = chunkForImport(items);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(IMPORT_CHUNK_ROWS);
  });
});
