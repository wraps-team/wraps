import { describe, expect, it } from "vitest";
import {
  describeParseFailure,
  describePayloadTooLarge,
  MAX_CSV_BYTES,
  MAX_IMPORT_PAYLOAD_BYTES,
  parseCSV,
  validateCSVFile,
} from "../csv-parse";

describe("parseCSV", () => {
  it("parses simple CSV", () => {
    const result = parseCSV(
      "Name,Email\nAlice,alice@example.com\nBob,bob@example.com"
    );
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
    expect(result.rows[1]).toEqual({ Name: "Bob", Email: "bob@example.com" });
    expect(result.totalRows).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("handles quoted fields with commas", () => {
    const result = parseCSV('Name,Company\nAlice,"Acme, Inc"\nBob,"Big Corp"');
    expect(result.rows[0]).toEqual({ Name: "Alice", Company: "Acme, Inc" });
  });

  it("handles escaped quotes in quoted fields", () => {
    const result = parseCSV('Name,Nickname\nAlice,"""Ali"""');
    expect(result.rows[0]).toEqual({ Name: "Alice", Nickname: '"Ali"' });
  });

  it("handles newlines in quoted fields", () => {
    const result = parseCSV('Name,Bio\nAlice,"Hello\nWorld"');
    expect(result.rows[0]).toEqual({ Name: "Alice", Bio: "Hello\nWorld" });
  });

  it("strips BOM", () => {
    const result = parseCSV("\uFEFFName,Email\nAlice,alice@example.com");
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows).toHaveLength(1);
  });

  it("auto-detects semicolon delimiter", () => {
    const result = parseCSV("Name;Email\nAlice;alice@example.com");
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
  });

  it("auto-detects tab delimiter", () => {
    const result = parseCSV("Name\tEmail\nAlice\talice@example.com");
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
  });

  it("respects explicit delimiter option", () => {
    const result = parseCSV("Name|Email\nAlice|alice@example.com", {
      delimiter: "|",
    });
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
  });

  it("truncates rows beyond maxRows", () => {
    const rows = Array.from(
      { length: 20 },
      (_, i) => `user${i},user${i}@example.com`
    ).join("\n");
    const result = parseCSV(`Name,Email\n${rows}`, { maxRows: 5 });
    expect(result.rows).toHaveLength(5);
    expect(result.totalRows).toBe(20);
    expect(result.truncated).toBe(true);
  });

  it("skips empty rows", () => {
    const result = parseCSV(
      "Name,Email\nAlice,alice@example.com\n\n\nBob,bob@example.com"
    );
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it("trims header whitespace", () => {
    const result = parseCSV("  Name , Email \nAlice,alice@example.com");
    expect(result.headers).toEqual(["Name", "Email"]);
  });

  it("trims cell whitespace", () => {
    const result = parseCSV("Name,Email\n  Alice  ,  alice@example.com  ");
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
  });

  it("returns empty result for empty input", () => {
    const result = parseCSV("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("handles Windows-style line endings", () => {
    const result = parseCSV(
      "Name,Email\r\nAlice,alice@example.com\r\nBob,bob@example.com"
    );
    expect(result.rows).toHaveLength(2);
  });

  it("handles rows with fewer fields than headers", () => {
    const result = parseCSV("Name,Email,Phone\nAlice,alice@example.com");
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
      Phone: "",
    });
  });

  it("drops extra fields beyond the header count instead of misaligning columns", () => {
    const result = parseCSV(
      "Name,Email\nAlice,alice@example.com,extra-unmapped-field"
    );
    expect(result.rows[0]).toEqual({
      Name: "Alice",
      Email: "alice@example.com",
    });
    expect(Object.keys(result.rows[0])).toHaveLength(2);
  });

  it("keeps the last column's value when a header name repeats", () => {
    // Two "Email" columns: a row object can only carry one value per key, so
    // the second column's value is what survives. Pinning this so a future
    // change to the assignment order doesn't silently start using the first
    // occurrence instead.
    const result = parseCSV(
      "Email,Email\nfirst@example.com,second@example.com"
    );
    expect(result.headers).toEqual(["Email", "Email"]);
    expect(result.rows[0]).toEqual({ Email: "second@example.com" });
  });
});

// ─── Import-file guards (audit finding F11) ────────────────────────────────
// The upload step used to `return` silently when a file was unreadable, so a
// bad pick left the dialog on step 1 with nothing said. These are the two pure
// checks that decide what it says.

describe("validateCSVFile", () => {
  it("accepts an ordinary csv", () => {
    expect(validateCSVFile({ name: "contacts.csv", size: 4096 })).toBeNull();
  });

  it("accepts an uppercase extension", () => {
    expect(validateCSVFile({ name: "CONTACTS.CSV", size: 4096 })).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateCSVFile({ name: "contacts.csv", size: 0 })).toMatch(
      /empty/i
    );
  });

  it("rejects a file over the byte ceiling and names both sizes", () => {
    // Twice the ceiling, so the file's size and the ceiling render as two
    // different numbers and the message is checked for carrying both.
    const message = validateCSVFile({
      name: "contacts.csv",
      size: MAX_CSV_BYTES * 2,
    });
    expect(message).toContain(`${(MAX_CSV_BYTES * 2) / (1024 * 1024)} MB`);
    expect(message).toContain(`${MAX_CSV_BYTES / (1024 * 1024)} MB`);
    expect(message).toMatch(/split/i);
  });

  it("rejects a file one byte over the ceiling", () => {
    expect(
      validateCSVFile({ name: "contacts.csv", size: MAX_CSV_BYTES + 1 })
    ).toMatch(/split/i);
  });

  it("accepts a file exactly at the ceiling", () => {
    expect(
      validateCSVFile({ name: "contacts.csv", size: MAX_CSV_BYTES })
    ).toBeNull();
  });

  it("rejects a non-csv and names the file", () => {
    const message = validateCSVFile({ name: "contacts.xlsx", size: 4096 });
    expect(message).toContain("contacts.xlsx");
  });
});

describe("describeParseFailure", () => {
  it("says nothing about a file with a header and rows", () => {
    expect(
      describeParseFailure(parseCSV("Email\nalice@example.com"))
    ).toBeNull();
  });

  it("explains an empty file instead of failing silently", () => {
    expect(describeParseFailure(parseCSV(""))).toMatch(/header row/i);
  });

  it("explains a header-only file", () => {
    const message = describeParseFailure(parseCSV("Email,Name"));
    expect(message).toMatch(/no contacts/i);
  });
});

describe("truncation reporting", () => {
  it("reports the real total so the notice can say how many are dropped", () => {
    const csv = `Email\n${Array.from(
      { length: 12 },
      (_, i) => `person${i}@example.com`
    ).join("\n")}`;
    const result = parseCSV(csv, { maxRows: 10 });
    expect(result.truncated).toBe(true);
    expect(result.totalRows).toBe(12);
    expect(result.rows).toHaveLength(10);
    expect(result.totalRows - result.rows.length).toBe(2);
  });
});

// ─── Payload ceiling (WEB-V) ───────────────────────────────────────────────
// validateCSVFile guards the file on disk; nothing guarded the JSON the mapped
// rows are actually posted as. A file well under MAX_CSV_BYTES serialized past
// the Server Action body cap and was rejected by the framework before the
// action ran, so the dialog had nothing to show.

describe("describePayloadTooLarge", () => {
  it("says nothing about a payload under the ceiling", () => {
    expect(describePayloadTooLarge(1024, 10)).toBeNull();
  });

  it("says nothing about a payload exactly at the ceiling", () => {
    expect(describePayloadTooLarge(MAX_IMPORT_PAYLOAD_BYTES, 10)).toBeNull();
  });

  it("explains a payload over the ceiling and names both sizes", () => {
    const message = describePayloadTooLarge(MAX_IMPORT_PAYLOAD_BYTES * 2, 1000);

    expect(message).toContain("1,000 rows");
    expect(message).toContain("16 MB");
    expect(message).toContain("8 MB");
  });

  it("suggests a batch size that would actually fit", () => {
    const message = describePayloadTooLarge(MAX_IMPORT_PAYLOAD_BYTES * 4, 1000);

    // A quarter of the rows is a quarter of the bytes.
    expect(message).toContain("250");
  });

  it("never suggests a batch of zero rows", () => {
    const message = describePayloadTooLarge(MAX_IMPORT_PAYLOAD_BYTES * 100, 1);

    expect(message).toContain("1 rows");
    expect(message).not.toContain("about 0 rows");
  });
});
