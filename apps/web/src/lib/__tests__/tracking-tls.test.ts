/**
 * Unit tests for the tracking-domain TLS probe (plan 302). Mocks
 * `node:dns/promises` and `node:tls` — no real socket is ever opened. See
 * `packages/cli/src/__tests__/setup/no-real-network.ts` for why that
 * matters: a test that reaches the real network is slow and its failure
 * mode is silence, not a red test.
 */

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLookup = vi.fn();
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

const mockConnect = vi.fn();
vi.mock("node:tls", () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
}));

import { probeTrackingTls } from "../tracking-tls";

type FakeSocket = EventEmitter & { destroy: ReturnType<typeof vi.fn> };

function fakeSocket(): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.destroy = vi.fn();
  return socket;
}

/** Connects successfully — invokes tls.connect's success callback. */
function connectSucceeds() {
  mockConnect.mockImplementation(
    (_options: Record<string, unknown>, callback: () => void): FakeSocket => {
      const socket = fakeSocket();
      setTimeout(() => callback(), 0);
      return socket;
    }
  );
}

/** Connects, then emits a socket error — e.g. a TLS/certificate failure. */
function connectErrors(error: Error) {
  mockConnect.mockImplementation((): FakeSocket => {
    const socket = fakeSocket();
    setTimeout(() => socket.emit("error", error), 0);
    return socket;
  });
}

/** Connects, then times out (socket 'timeout' event, no error, no success). */
function connectTimesOut() {
  mockConnect.mockImplementation((): FakeSocket => {
    const socket = fakeSocket();
    setTimeout(() => socket.emit("timeout"), 0);
    return socket;
  });
}

beforeEach(() => {
  mockLookup.mockReset();
  mockConnect.mockReset();
});

describe("SSRF guard — blocked addresses never reach tls.connect", () => {
  it("resolves to unknown for 127.0.0.1 (loopback), without ever calling tls.connect", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await probeTrackingTls("evil.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("resolves to unknown for 169.254.169.254 (link-local / cloud metadata), without connecting", async () => {
    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    const result = await probeTrackingTls("evil.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("resolves to unknown for 10.0.0.5 (private v4), without connecting", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const result = await probeTrackingTls("evil.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("resolves to unknown for an IPv6 ULA address (fd00::1), without connecting", async () => {
    mockLookup.mockResolvedValue([{ address: "fd00::1", family: 6 }]);

    const result = await probeTrackingTls("evil.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("blocks on ANY blocked address among several resolved — not just the first", async () => {
    mockLookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.5", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]);

    const result = await probeTrackingTls("mixed.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("TLS handshake outcomes", () => {
  it("resolves to serving on a successful, authorized handshake", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    connectSucceeds();

    const result = await probeTrackingTls("track.example.com");

    expect(result).toEqual({ status: "serving" });
  });

  it("resolves to not-serving on ERR_TLS_CERT_ALTNAME_INVALID, reason mentions the certificate", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const error = new Error(
      "Hostname/IP does not match certificate's altnames: Host: track.example.com. is not in the cert's altnames"
    ) as NodeJS.ErrnoException;
    error.code = "ERR_TLS_CERT_ALTNAME_INVALID";
    connectErrors(error);

    const result = await probeTrackingTls("track.example.com");

    expect(result.status).toBe("not-serving");
    expect(result).toMatchObject({
      reason: expect.stringContaining("certificate"),
    });
  });

  it("resolves to not-serving on ECONNREFUSED", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const error = new Error("connect ECONNREFUSED") as NodeJS.ErrnoException;
    error.code = "ECONNREFUSED";
    connectErrors(error);

    const result = await probeTrackingTls("track.example.com");

    expect(result.status).toBe("not-serving");
  });

  it("resolves to unknown on a handshake timeout — distinct from ECONNREFUSED's not-serving", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    connectTimesOut();

    const result = await probeTrackingTls("track.example.com");

    expect(result.status).toBe("unknown");
  });

  it("calls tls.connect with servername set to the hostname and host set to the validated IP", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    connectSucceeds();

    await probeTrackingTls("track.example.com");

    expect(mockConnect).toHaveBeenCalledTimes(1);
    const options = mockConnect.mock.calls[0][0] as Record<string, unknown>;
    expect(options.servername).toBe("track.example.com");
    expect(options.host).toBe("93.184.216.34");
    expect(options.rejectUnauthorized).toBe(true);
  });
});

describe("DNS failures", () => {
  it("resolves to not-serving on ENOTFOUND — the domain does not exist, so nothing serves it", async () => {
    const error = new Error(
      "getaddrinfo ENOTFOUND ghost.example.com"
    ) as NodeJS.ErrnoException;
    error.code = "ENOTFOUND";
    mockLookup.mockRejectedValue(error);

    const result = await probeTrackingTls("ghost.example.com");

    expect(result.status).toBe("not-serving");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("resolves to unknown on a non-ENOTFOUND DNS failure (e.g. a resolver timeout)", async () => {
    const error = new Error(
      "queryA ETIMEOUT flaky.example.com"
    ) as NodeJS.ErrnoException;
    error.code = "ETIMEOUT";
    mockLookup.mockRejectedValue(error);

    const result = await probeTrackingTls("flaky.example.com");

    expect(result.status).toBe("unknown");
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("probeTrackingTls never throws", () => {
  it("rejects nothing — every branch above resolves a TrackingTlsResult, not a rejected promise", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(probeTrackingTls("evil.example.com")).resolves.toBeDefined();
  });
});
