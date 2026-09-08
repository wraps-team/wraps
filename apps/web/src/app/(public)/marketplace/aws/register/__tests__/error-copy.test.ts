import { describe, expect, it } from "vitest";

/**
 * Mirrors the guard in page.tsx. The bug this pins: `value in ERROR_COPY`
 * walks the prototype chain, so ?error=constructor passed the guard and the
 * page tried to render Object's constructor as a React child.
 */
const ERROR_COPY: Record<string, string> = {
  missing_token: "a",
  expired_token: "b",
};

function isRegistrationError(value: string): boolean {
  return Object.hasOwn(ERROR_COPY, value);
}

describe("registration error guard", () => {
  it("accepts real error codes", () => {
    expect(isRegistrationError("missing_token")).toBe(true);
  });

  it.each([
    "constructor",
    "toString",
    "valueOf",
    "__proto__",
    "hasOwnProperty",
  ])("rejects inherited property %s", (probe) => {
    expect(isRegistrationError(probe)).toBe(false);
  });

  it("rejects unknown codes", () => {
    expect(isRegistrationError("bogus")).toBe(false);
  });
});
