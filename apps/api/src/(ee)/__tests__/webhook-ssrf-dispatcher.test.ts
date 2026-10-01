import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeWebhookHeaders } from "../workers/workflow-step-handlers";
import {
  assertResolvedIpAllowed,
  createSsrfSafeDispatcher,
} from "../workers/workflow-utils";

describe("createSsrfSafeDispatcher", () => {
  // A real loopback server, reached by the NAME "localhost" so the dispatcher's
  // connect-time lookup runs. No DNS mock: this proves the real socket path.
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end("internal"));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("control: the loopback server is reachable without the dispatcher", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(await res.text()).toBe("internal");
  });

  it("refuses to connect when the hostname resolves to loopback", async () => {
    const dispatcher = createSsrfSafeDispatcher();
    const err = await fetch(`http://localhost:${port}/`, {
      dispatcher,
    } as RequestInit & { dispatcher: unknown }).catch((e: unknown) => e);
    await dispatcher.destroy();

    expect(err).toBeInstanceOf(TypeError);
    expect((err as { cause?: Error }).cause?.message).toContain(
      "blocked address"
    );
  });
});

describe("assertResolvedIpAllowed", () => {
  it("throws for IMDS address", () => {
    expect(() => assertResolvedIpAllowed(["169.254.169.254"])).toThrow(
      "blocked address"
    );
  });

  it("throws for loopback address", () => {
    expect(() => assertResolvedIpAllowed(["127.0.0.1"])).toThrow(
      "blocked address"
    );
  });

  it("throws if any address in a list is blocked", () => {
    expect(() => assertResolvedIpAllowed(["8.8.8.8", "127.0.0.1"])).toThrow(
      "blocked address"
    );
  });

  it("does not throw for a public IP", () => {
    expect(() => assertResolvedIpAllowed(["8.8.8.8"])).not.toThrow();
  });

  it("does not throw for multiple public IPs", () => {
    expect(() => assertResolvedIpAllowed(["8.8.8.8", "1.1.1.1"])).not.toThrow();
  });

  it("throws for private range 10.x", () => {
    expect(() => assertResolvedIpAllowed(["10.0.0.1"])).toThrow(
      "blocked address"
    );
  });

  it("throws for IPv6 loopback", () => {
    expect(() => assertResolvedIpAllowed(["::1"])).toThrow("blocked address");
  });
});

describe("sanitizeWebhookHeaders", () => {
  it("always includes Content-Type: application/json", () => {
    expect(sanitizeWebhookHeaders(undefined)).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("passes through a normal Authorization header", () => {
    const result = sanitizeWebhookHeaders({
      Authorization: "Bearer token123",
    });
    expect(result["Authorization"]).toBe("Bearer token123");
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("drops Host header (case-insensitive)", () => {
    const result = sanitizeWebhookHeaders({ Host: "evil.internal" });
    expect(result["Host"]).toBeUndefined();
    expect(result["host"]).toBeUndefined();
  });

  it("drops Content-Length header (case-insensitive)", () => {
    const result = sanitizeWebhookHeaders({ "Content-Length": "999" });
    expect(result["Content-Length"]).toBeUndefined();
    expect(result["content-length"]).toBeUndefined();
  });

  it("drops Transfer-Encoding header (case-insensitive)", () => {
    const result = sanitizeWebhookHeaders({ "Transfer-Encoding": "chunked" });
    expect(result["Transfer-Encoding"]).toBeUndefined();
  });

  it("drops Connection header (case-insensitive)", () => {
    const result = sanitizeWebhookHeaders({ Connection: "keep-alive" });
    expect(result["Connection"]).toBeUndefined();
  });

  it("drops keys containing \\r", () => {
    const result = sanitizeWebhookHeaders({ "X-Injected\rHeader": "val" });
    expect(Object.keys(result)).not.toContain("X-Injected\rHeader");
  });

  it("drops keys containing \\n", () => {
    const result = sanitizeWebhookHeaders({ "X-Injected\nHeader": "val" });
    expect(Object.keys(result)).not.toContain("X-Injected\nHeader");
  });

  it("drops values containing \\0", () => {
    const result = sanitizeWebhookHeaders({ "X-Custom": "val\0ue" });
    expect(result["X-Custom"]).toBeUndefined();
  });

  it("passes through multiple safe headers alongside Content-Type", () => {
    const result = sanitizeWebhookHeaders({
      Authorization: "Bearer abc",
      "X-Custom-Header": "custom-value",
    });
    expect(result).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer abc",
      "X-Custom-Header": "custom-value",
    });
  });

  it("handles empty object without throwing", () => {
    expect(sanitizeWebhookHeaders({})).toEqual({
      "Content-Type": "application/json",
    });
  });
});
