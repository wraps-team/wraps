import { describe, expect, it } from "vitest";
import { splitRepeats } from "../import-dedupe";

describe("splitRepeats", () => {
  it("keeps every row when the file repeats nothing", () => {
    const contacts = [
      { email: "a@example.com" },
      { email: "b@example.com" },
      { phone: "+15550000001" },
    ];

    const { kept, duplicates } = splitRepeats(contacts);

    expect(duplicates).toEqual([]);
    expect(kept.map((k) => k.row)).toEqual([1, 2, 3]);
    expect(kept.map((k) => k.contact)).toEqual(contacts);
  });

  it("keeps the first of a repeated email and reports the second", () => {
    const { kept, duplicates } = splitRepeats([
      { email: "dup@example.com", firstName: "First" },
      { email: "dup@example.com", firstName: "Second" },
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].contact.firstName).toBe("First");
    expect(duplicates).toEqual([
      { row: 2, firstRow: 1, field: "email", value: "dup@example.com" },
    ]);
  });

  it("reports a repeated phone against the row that claimed it", () => {
    const { kept, duplicates } = splitRepeats([
      { phone: "+15550000101" },
      { phone: "+15550000101" },
    ]);

    expect(kept).toHaveLength(1);
    expect(duplicates).toEqual([
      { row: 2, firstRow: 1, field: "phone", value: "+15550000101" },
    ]);
  });

  it("catches a repeat however far apart the two copies are", () => {
    // The whole point of doing this in the browser: the server sees one chunk
    // at a time and cannot relate rows 1 and 2101 to each other.
    const contacts = [
      { email: "straddle@example.com" },
      ...Array.from({ length: 2099 }, (_, i) => ({
        email: `filler-${i}@example.com`,
      })),
      { email: "straddle@example.com" },
    ];

    const { kept, duplicates } = splitRepeats(contacts);

    expect(kept).toHaveLength(2100);
    expect(duplicates).toEqual([
      {
        row: 2101,
        firstRow: 1,
        field: "email",
        value: "straddle@example.com",
      },
    ]);
  });

  it("points every copy at the original, not at the copy before it", () => {
    const { duplicates } = splitRepeats([
      { email: "thrice@example.com" },
      { email: "thrice@example.com" },
      { email: "thrice@example.com" },
    ]);

    expect(duplicates.map((d) => d.row)).toEqual([2, 3]);
    expect(duplicates.map((d) => d.firstRow)).toEqual([1, 1]);
  });

  it("matches emails the way the server does, ignoring case and padding", () => {
    const { kept, duplicates } = splitRepeats([
      { email: "Ada@Example.COM" },
      { email: "  ada@example.com  " },
    ]);

    expect(kept).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ row: 2, field: "email" });
  });

  it("reports a row once even when it repeats both fields", () => {
    const { duplicates } = splitRepeats([
      { email: "both@example.com", phone: "+15550000202" },
      { email: "both@example.com", phone: "+15550000202" },
    ]);

    expect(duplicates).toHaveLength(1);
  });

  it("does not treat a blank email or phone as a repeat of another blank", () => {
    const { kept, duplicates } = splitRepeats([
      { email: "", phone: "+15550000301" },
      { email: "", phone: "+15550000302" },
      { email: "  ", phone: "+15550000303" },
    ]);

    expect(duplicates).toEqual([]);
    expect(kept).toHaveLength(3);
  });

  it("keeps a row carrying neither an email nor a phone for the server to reject", () => {
    // One place decides what a valid row is, and it is not this function.
    const { kept, duplicates } = splitRepeats([
      { firstName: "No" },
      { firstName: "Identifier" },
    ]);

    expect(duplicates).toEqual([]);
    expect(kept).toHaveLength(2);
  });

  it("relates a row to an earlier one by phone even when their emails differ", () => {
    const { kept, duplicates } = splitRepeats([
      { email: "one@example.com", phone: "+15550000401" },
      { email: "two@example.com", phone: "+15550000401" },
    ]);

    expect(kept).toHaveLength(1);
    expect(duplicates).toEqual([
      { row: 2, firstRow: 1, field: "phone", value: "+15550000401" },
    ]);
  });

  it("numbers rows by their place in the file, not their place among survivors", () => {
    const { kept, duplicates } = splitRepeats([
      { email: "a@example.com" },
      { email: "a@example.com" },
      { email: "b@example.com" },
      { email: "c@example.com" },
    ]);

    // Rows 3 and 4 keep their file positions even though row 2 was removed.
    expect(kept.map((k) => k.row)).toEqual([1, 3, 4]);
    expect(duplicates[0].row).toBe(2);
  });
});
