/**
 * The delivery sweep loops processDeliveries while hasMore, within a cap, and
 * reports every failure to Sentry. The auth instance and the database are
 * mocked: no connection is made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processDeliveries: vi.fn(),
  createNotificationsAuth: vi.fn(),
  closeDbConnection: vi.fn(async () => {}),
  captureException: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn(async () => {}),
}));

vi.mock("../../lib/sentry", () => ({}));
vi.mock("../../lib/logger", () => ({
  log: mocks.log,
  flushLogger: mocks.flushLogger,
}));
vi.mock("@sentry/aws-serverless", () => ({
  captureException: mocks.captureException,
  withMonitor: (_slug: string, fn: () => unknown) => fn(),
  wrapHandler: (fn: () => unknown) => fn,
}));
vi.mock("@wraps/db", () => ({ closeDbConnection: mocks.closeDbConnection }));
vi.mock("@wraps/auth/notifications", () => ({
  createNotificationsAuth: mocks.createNotificationsAuth,
}));

import { handler, MAX_SWEEPS_PER_RUN } from "../notification-deliveries";

const result = (overrides: Partial<Record<string, number | boolean>> = {}) => ({
  sent: 0,
  skipped: 0,
  retrying: 0,
  failed: 0,
  hasMore: false,
  ...overrides,
});

// biome-ignore lint/suspicious/noExplicitAny: the Lambda event and context are unused
const invoke = () => (handler as any)({}, {}, () => {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createNotificationsAuth.mockReturnValue({
    api: { processDeliveries: mocks.processDeliveries },
  });
});

describe("notification-deliveries handler", () => {
  it("runs one sweep when nothing is left over", async () => {
    mocks.processDeliveries.mockResolvedValueOnce(result({ sent: 2 }));

    await invoke();

    expect(mocks.processDeliveries).toHaveBeenCalledTimes(1);
    expect(mocks.processDeliveries).toHaveBeenCalledWith({ body: {} });
    expect(mocks.closeDbConnection).toHaveBeenCalledTimes(1);
    expect(mocks.log.info).toHaveBeenCalledWith(
      "[notification-deliveries] Sweep complete",
      expect.objectContaining({ sweeps: 1, sent: 2 })
    );
  });

  it("keeps sweeping while hasMore is true", async () => {
    mocks.processDeliveries
      .mockResolvedValueOnce(result({ sent: 100, hasMore: true }))
      .mockResolvedValueOnce(result({ sent: 100, hasMore: true }))
      .mockResolvedValueOnce(result({ sent: 7, hasMore: false }));

    await invoke();

    expect(mocks.processDeliveries).toHaveBeenCalledTimes(3);
    expect(mocks.log.info).toHaveBeenCalledWith(
      "[notification-deliveries] Sweep complete",
      expect.objectContaining({ sweeps: 3, sent: 207 })
    );
    expect(mocks.log.warn).not.toHaveBeenCalled();
  });

  it("stops at the cap and leaves the rest for the next run", async () => {
    mocks.processDeliveries.mockResolvedValue(
      result({ sent: 1, hasMore: true })
    );

    await invoke();

    expect(mocks.processDeliveries).toHaveBeenCalledTimes(MAX_SWEEPS_PER_RUN);
    expect(mocks.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("cap reached"),
      { maxSweeps: MAX_SWEEPS_PER_RUN }
    );
  });

  it("captures a failed sweep to Sentry, logs it, and closes the database without throwing", async () => {
    const boom = new Error("SES throttled");
    mocks.processDeliveries.mockRejectedValueOnce(boom);

    await expect(invoke()).resolves.toBeUndefined();

    expect(mocks.captureException).toHaveBeenCalledWith(boom, {
      tags: { worker: "notification-deliveries" },
    });
    expect(mocks.log.error).toHaveBeenCalledWith(
      "[notification-deliveries] Sweep failed",
      boom
    );
    expect(mocks.closeDbConnection).toHaveBeenCalledTimes(1);
    expect(mocks.flushLogger).toHaveBeenCalledTimes(1);
  });

  it("captures a failure to build the auth instance too", async () => {
    const boom = new Error("missing BETTER_AUTH_SECRET");
    mocks.createNotificationsAuth.mockImplementationOnce(() => {
      throw boom;
    });

    await expect(invoke()).resolves.toBeUndefined();

    expect(mocks.captureException).toHaveBeenCalledWith(boom, {
      tags: { worker: "notification-deliveries" },
    });
    expect(mocks.closeDbConnection).toHaveBeenCalledTimes(1);
  });
});
