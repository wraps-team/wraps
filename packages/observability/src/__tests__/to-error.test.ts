import { describe, expect, it } from "vitest";
import { toError } from "../to-error";

describe("toError", () => {
  it("returns the identical Error object", () => {
    const error = new Error("x");

    expect(toError(error, "fallback")).toBe(error);
  });

  it("builds an Error from an error-shaped object", () => {
    const result = toError(
      { message: "m", name: "TypeError", stack: "s" },
      "fallback"
    );

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("m");
    expect(result.name).toBe("TypeError");
    expect(result.stack).toBe("s");
  });

  it("defaults the name to Error for an object without one", () => {
    expect(toError({ message: "m" }, "fallback").name).toBe("Error");
  });

  it.each([["just a string"], [undefined], [null], [42]])(
    "wraps %s in the fallback message with the value as cause",
    (value) => {
      const result = toError(value, "fallback");

      expect(result.message).toBe("fallback");
      expect(result.cause).toBe(value);
    }
  );
});
