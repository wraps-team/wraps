import { describe, expect, it } from "vitest";
import {
  compact,
  fromISO,
  toBinaryOrUndefined,
  toDateOrUndefined,
  toISO,
} from "../src/util.js";

describe("compact", () => {
  it("removes null and undefined values", () => {
    const result = compact({ a: 1, b: null, c: undefined, d: "ok" });
    expect(result).toEqual({ a: 1, d: "ok" });
  });

  it("keeps falsy non-null values (0, empty string, false)", () => {
    const result = compact({ a: 0, b: "", c: false });
    expect(result).toEqual({ a: 0, b: "", c: false });
  });

  it("returns empty object when all values are null/undefined", () => {
    const result = compact({ a: null, b: undefined });
    expect(result).toEqual({});
  });

  it("returns same shape when nothing to compact", () => {
    const result = compact({ x: 1, y: 2 });
    expect(result).toEqual({ x: 1, y: 2 });
  });
});

describe("toISO / fromISO", () => {
  it("round-trips a date", () => {
    const date = new Date("2025-06-15T12:30:00.000Z");
    expect(fromISO(toISO(date)).getTime()).toBe(date.getTime());
  });

  it("toISO produces ISO 8601 string", () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    expect(toISO(date)).toBe("2025-01-01T00:00:00.000Z");
  });

  it("fromISO returns a Date instance", () => {
    const result = fromISO("2025-06-15T12:30:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
  });
});

describe("toDateOrUndefined", () => {
  it("converts ISO string to Date", () => {
    const result = toDateOrUndefined("2025-01-01T00:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("returns undefined for undefined", () => {
    expect(toDateOrUndefined(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(toDateOrUndefined(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(toDateOrUndefined("")).toBeUndefined();
  });
});

describe("toBinaryOrUndefined", () => {
  it("passes through Uint8Array", () => {
    const buf = new Uint8Array([1, 2, 3]);
    expect(toBinaryOrUndefined(buf)).toBe(buf);
  });

  it("returns undefined for undefined", () => {
    expect(toBinaryOrUndefined(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(toBinaryOrUndefined(null)).toBeUndefined();
  });
});
