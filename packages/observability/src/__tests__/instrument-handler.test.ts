import { describe, expect, it, vi } from "vitest";
import { createInstrumentHandler, type HandlerWrapper } from "../lambda";
import type { ErrorReporter } from "../types";

const makeReporter = (flush: ErrorReporter["flush"]): ErrorReporter => ({
  id: "test",
  capture: vi.fn(),
  flush,
});

const slowFlush = (done: { value: boolean }) => () =>
  new Promise<void>((resolve) => {
    setTimeout(() => {
      done.value = true;
      resolve();
    }, 0);
  });

describe("createInstrumentHandler", () => {
  it("awaits flush when the handler returns normally", async () => {
    const done = { value: false };
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(slowFlush(done)),
    })(async () => "ok");

    await expect(wrapped()).resolves.toBe("ok");
    expect(done.value).toBe(true);
  });

  it("awaits flush when the handler throws and still propagates the throw", async () => {
    const done = { value: false };
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(slowFlush(done)),
    })(async () => {
      throw new Error("boom");
    });

    await expect(wrapped()).rejects.toThrow("boom");
    expect(done.value).toBe(true);
  });

  it("works without decorate and passes arguments and return value through", async () => {
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(() => Promise.resolve()),
    })(async (a: number, b: number) => a + b);

    await expect(wrapped(2, 3)).resolves.toBe(5);
  });

  it("awaits every flushOthers entry", async () => {
    const first = { value: false };
    const second = { value: false };
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(() => Promise.resolve()),
      flushOthers: [slowFlush(first), slowFlush(second)],
    })(async () => "ok");

    await wrapped();
    expect(first.value).toBe(true);
    expect(second.value).toBe(true);
  });

  it("does not let rejecting flushes mask the handler's error", async () => {
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(() => Promise.reject(new Error("flush failed"))),
      flushOthers: [() => Promise.reject(new Error("other failed"))],
    })(async () => {
      throw new Error("boom");
    });

    await expect(wrapped()).rejects.toThrow("boom");
  });

  it("does not let rejecting flushes change the handler's return value", async () => {
    const wrapped = createInstrumentHandler({
      reporter: makeReporter(() => Promise.reject(new Error("flush failed"))),
      flushOthers: [() => Promise.reject(new Error("other failed"))],
    })(async () => 42);

    await expect(wrapped()).resolves.toBe(42);
  });

  it("passes flushTimeoutMs to the reporter, defaulting to 2000", async () => {
    const flush = vi.fn(() => Promise.resolve());
    await createInstrumentHandler({ reporter: makeReporter(flush) })(
      async () => 1
    )();
    await createInstrumentHandler({
      reporter: makeReporter(flush),
      flushTimeoutMs: 500,
    })(async () => 1)();

    expect(flush).toHaveBeenNthCalledWith(1, 2000);
    expect(flush).toHaveBeenNthCalledWith(2, 500);
  });

  it("lets decorate observe the throw after our flush has run", async () => {
    const order: string[] = [];
    const decorate: HandlerWrapper =
      (fn) =>
      async (...args) => {
        try {
          return await fn(...args);
        } catch (error) {
          order.push("decorate-saw-throw");
          throw error;
        }
      };
    const reporter = makeReporter(async () => {
      order.push("flush");
    });
    const wrapped = createInstrumentHandler({ reporter, decorate })(
      async () => {
        throw new Error("boom");
      }
    );

    await expect(wrapped()).rejects.toThrow("boom");
    expect(order).toEqual(["flush", "decorate-saw-throw"]);
  });
});
