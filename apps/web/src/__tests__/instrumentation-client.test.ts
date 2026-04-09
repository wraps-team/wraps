import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSentryInit,
  mockReplayIntegration,
  mockCaptureRouterTransitionStart,
  mockPosthogInit,
} = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
  mockReplayIntegration: vi.fn(() => ({ name: "replay" })),
  mockCaptureRouterTransitionStart: vi.fn(),
  mockPosthogInit: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  init: mockSentryInit,
  replayIntegration: mockReplayIntegration,
  captureRouterTransitionStart: mockCaptureRouterTransitionStart,
}));

vi.mock("posthog-js", () => ({
  default: {
    init: mockPosthogInit,
  },
}));

const originalNextPublicSentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const originalNextPublicPosthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

async function importSrcInstrumentationClient() {
  vi.resetModules();
  return import("../instrumentation-client");
}

async function importRootInstrumentationClient() {
  vi.resetModules();
  return import("../../instrumentation-client");
}

describe("client instrumentation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test_key";
  });

  afterEach(() => {
    vi.clearAllMocks();

    if (originalNextPublicSentryDsn === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalNextPublicSentryDsn;
    }

    if (originalNextPublicPosthogKey === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = originalNextPublicPosthogKey;
    }
  });

  it("reads the src client Sentry DSN from NEXT_PUBLIC_SENTRY_DSN", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://src-public@example.ingest.sentry.io/123";

    const module = await importSrcInstrumentationClient();

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://src-public@example.ingest.sentry.io/123",
      })
    );
    expect(module.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);
  });

  it("leaves the src client Sentry DSN unset when NEXT_PUBLIC_SENTRY_DSN is missing", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    await importSrcInstrumentationClient();

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
      })
    );
  });

  it("reads the root client Sentry DSN from NEXT_PUBLIC_SENTRY_DSN", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://root-public@example.ingest.sentry.io/456";

    const module = await importRootInstrumentationClient();

    expect(mockReplayIntegration).toHaveBeenCalledTimes(1);
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://root-public@example.ingest.sentry.io/456",
        integrations: [{ name: "replay" }],
      })
    );
    expect(mockPosthogInit).toHaveBeenCalledWith(
      "ph_test_key",
      expect.objectContaining({
        api_host: "https://o11y.wraps.dev",
      })
    );
    expect(module.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);
  });

  it("leaves the root client Sentry DSN unset when NEXT_PUBLIC_SENTRY_DSN is missing", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    await importRootInstrumentationClient();

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
      })
    );
  });
});
