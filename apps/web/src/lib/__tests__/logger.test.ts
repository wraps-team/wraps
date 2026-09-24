const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import {
  createActionLogger,
  createRequestLogger,
  logger,
  serializeError,
} from "@/lib/logger";

describe("logger error forwarding", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("forwards a serializeError()-wrapped error (regression: the original bug)", () => {
    const log = createActionLogger("a", {});
    log.error({ err: serializeError(new Error("boom")) }, "msg");

    expect(captureException).toHaveBeenCalledTimes(1);
    const [forwarded] = captureException.mock.calls[0];
    expect(forwarded).toBeInstanceOf(Error);
    expect(forwarded.message).toBe("boom");
  });

  it("forwards the same Error object it was given (no dedupe-breaking copy)", () => {
    const realError = new Error("real");
    const log = createActionLogger("a", {});
    log.error({ err: realError }, "msg");

    expect(captureException).toHaveBeenCalledWith(realError, expect.anything());
  });

  it("forwards from createRequestLogger", () => {
    const log = createRequestLogger({ requestId: "r" });
    log.error({ err: new Error("x") }, "msg");

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("forwards from the bare logger", () => {
    logger.error({ err: new Error("x") }, "msg");

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("does not forward when reportToSentry is false", () => {
    const log = createActionLogger("a", {});
    log.error({ err: new Error("x"), reportToSentry: false }, "msg");

    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not forward and does not throw when there is no usable error", () => {
    const log = createActionLogger("a", {});

    expect(() => log.error("just a string")).not.toThrow();
    expect(() => log.error({ err: "oops" }, "m")).not.toThrow();
    expect(() => log.error({ other: 1 }, "m")).not.toThrow();

    expect(captureException).not.toHaveBeenCalled();
  });

  it("keeps the stack on serializeError() output in production", () => {
    const serialized = serializeError(new Error("x"));
    expect(typeof serialized.stack).toBe("string");
  });

  it("inherits the single wrapper on an ad-hoc logger.child() (no double-forward)", () => {
    const log = logger.child({ module: "m" });
    log.error({ err: new Error("x") }, "msg");

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
