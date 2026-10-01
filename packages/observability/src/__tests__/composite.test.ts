import { describe, expect, it, vi } from "vitest";
import { createCompositeReporter } from "../composite";
import type { ErrorReporter } from "../types";

const member = (id: string, overrides: Partial<ErrorReporter> = {}) =>
  ({
    id,
    capture: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    ...overrides,
  }) satisfies ErrorReporter;

describe("createCompositeReporter", () => {
  it("keeps firing the other reporters when one throws, without throwing", () => {
    const broken = member("a", {
      capture: vi.fn(() => {
        throw new Error("broken");
      }),
    });
    const healthy = member("b");
    const composite = createCompositeReporter([broken, healthy]);
    const event = { error: new Error("x") };

    expect(() => composite.capture(event)).not.toThrow();
    expect(healthy.capture).toHaveBeenCalledWith(event);
  });

  it("flush resolves even when one member rejects", async () => {
    const rejecting = member("a", {
      flush: vi.fn(() => Promise.reject(new Error("nope"))),
    });
    const healthy = member("b");
    const composite = createCompositeReporter([rejecting, healthy]);

    await expect(composite.flush(100)).resolves.toBeUndefined();
    expect(healthy.flush).toHaveBeenCalledWith(100);
  });

  it("returns the noop reporter for an empty list", () => {
    expect(createCompositeReporter([]).id).toBe("noop");
  });

  it("joins member ids with a comma", () => {
    expect(createCompositeReporter([member("a"), member("b")]).id).toBe("a,b");
  });
});
