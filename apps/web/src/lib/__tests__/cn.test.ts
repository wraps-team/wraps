import { cn } from "@/lib/utils";

describe("cn", () => {
  it("lets a later class win a conflict", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("keeps non-conflicting classes from different groups", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
    expect(cn("size-4", "h-6")).toBe("size-4 h-6");
    expect(cn("text-sm", "text-red-500")).toBe("text-sm text-red-500");
  });

  it("scopes conflicts to the variant", () => {
    expect(cn("p-2", "hover:p-4")).toBe("p-2 hover:p-4");
    expect(cn("hover:p-2", "hover:p-4")).toBe("hover:p-4");
    expect(cn("bg-white", "dark:bg-black")).toBe("bg-white dark:bg-black");
  });

  it("handles arbitrary values and properties", () => {
    expect(cn("h-4", "h-[3.75rem]")).toBe("h-[3.75rem]");
    expect(cn("[mask-type:luminance]", "[mask-type:alpha]")).toBe(
      "[mask-type:alpha]"
    );
  });

  it("treats an important-prefixed class as its own group", () => {
    expect(cn("p-2", "!p-4")).toBe("p-2 !p-4");
  });

  it("accepts clsx input shapes", () => {
    expect(cn("p-2", { "p-4": true })).toBe("p-4");
    expect(cn("p-2", { "p-4": false })).toBe("p-2");
    expect(cn(["p-2", [null, "p-4"], false, undefined])).toBe("p-4");
    expect(cn("p-2", undefined)).toBe("p-2");
    expect(cn()).toBe("");
  });

  it("does not let a caller's sizing knock out a guard class", () => {
    // Guards the exact case asserted in components/__tests__/skeleton.test.tsx
    expect(cn("animate-pulse motion-reduce:animate-none", "h-4 w-32")).toBe(
      "animate-pulse motion-reduce:animate-none h-4 w-32"
    );
  });
});
