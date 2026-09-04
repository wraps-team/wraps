import { describe, expect, it } from "vitest";
import { resolveDefaultCodeBlockValue } from "@/components/ui/shadcn-io/code-block";

const data = [
  { language: "typescript", filename: "email.ts", code: "const a = 1;" },
  { language: "bash", filename: "install.sh", code: "npm install" },
];

describe("resolveDefaultCodeBlockValue", () => {
  it("returns the explicit defaultValue when one is given, even if it differs from the first item", () => {
    expect(resolveDefaultCodeBlockValue("bash", data)).toBe("bash");
  });

  it("falls back to the first item's language when defaultValue is undefined", () => {
    expect(resolveDefaultCodeBlockValue(undefined, data)).toBe("typescript");
  });

  it("returns an empty string and does not throw for an empty data array", () => {
    expect(() => resolveDefaultCodeBlockValue(undefined, [])).not.toThrow();
    expect(resolveDefaultCodeBlockValue(undefined, [])).toBe("");
  });

  it("with multiple items, picks the first, not a later one", () => {
    const threeItems = [
      { language: "json", filename: "a.json", code: "{}" },
      { language: "typescript", filename: "b.ts", code: "" },
      { language: "bash", filename: "c.sh", code: "" },
    ];
    expect(resolveDefaultCodeBlockValue(undefined, threeItems)).toBe("json");
  });
});
