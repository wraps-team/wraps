import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, captureMessage } = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@sentry/aws-serverless", () => ({ captureException, captureMessage }));

import { log } from "../logger";

describe("log.error error forwarding", () => {
  beforeEach(() => {
    captureException.mockClear();
    captureMessage.mockClear();
  });

  it("forwards a real Error, the same object, with extra.message", () => {
    const err = new Error("boom");

    log.error("m", err);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({ message: "m" }),
      })
    );
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("forwards a message-only log via captureMessage with data in extra", () => {
    log.error("m", undefined, { batchId: "b" });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      "m",
      expect.objectContaining({
        level: "error",
        extra: expect.objectContaining({ batchId: "b" }),
      })
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not forward when reportToSentry is false", () => {
    const err = new Error("boom");

    log.error("m", err, { reportToSentry: false });

    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("log.warn and log.info never forward", () => {
    log.warn("m");
    log.info("m");

    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("forwards a non-Error failure via captureMessage with extra.error", () => {
    log.error("m", "string failure");

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      "m",
      expect.objectContaining({
        extra: expect.objectContaining({ error: "string failure" }),
      })
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});
