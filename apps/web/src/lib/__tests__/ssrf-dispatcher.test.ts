/**
 * Connect-time SSRF pinning (plan 379). Uses a real loopback server and the
 * name "localhost" (resolved from /etc/hosts, no network) to prove that
 * publicFetch() refuses to connect to a private address even when no
 * pre-check ran — the DNS-rebinding case.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicFetch, ssrfSafeLookup } from "../ssrf-guard";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((_req, res) => res.end("internal"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("publicFetch", () => {
  it("control: the loopback server is reachable without the guard", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(await res.text()).toBe("internal");
  });

  it("refuses to connect when the hostname resolves to loopback", async () => {
    const err = await publicFetch(`http://localhost:${port}/`).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(TypeError);
    expect((err as { cause?: { code?: string } }).cause?.code).toBe(
      "ESSRFBLOCKED"
    );
  });

  it("does not follow redirects", async () => {
    // A redirecting server on loopback, reached by IP literal (literals skip
    // lookup), so this isolates the redirect behaviour from the pinning.
    const redirector = createServer((_req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/" });
      res.end();
    });
    await new Promise<void>((r) => redirector.listen(0, "127.0.0.1", r));
    const rport = (redirector.address() as AddressInfo).port;
    const res = await publicFetch(`http://127.0.0.1:${rport}/`);
    expect(res.status).toBe(302);
    await new Promise<void>((r) => redirector.close(() => r()));
  });
});

describe("ssrfSafeLookup", () => {
  it("errors with ESSRFBLOCKED for localhost", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      ssrfSafeLookup("localhost", { all: true }, (e) => resolve(e))
    );
    expect(err?.code).toBe("ESSRFBLOCKED");
  });
});
