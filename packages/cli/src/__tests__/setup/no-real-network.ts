/**
 * Fail any unit test that opens a real outbound connection.
 *
 * The bug this exists to catch does not look like a bug. A test exercises a
 * failure path — `stack.destroy()` rejects, a lookup 404s — and the code under
 * test reaches for an AWS SDK client the test forgot to mock, usually through a
 * dynamic `await import("@aws-sdk/client-…")` inside a `catch {}`. The call goes
 * out, finds no credentials, retries on the SDK's own backoff, and the error is
 * swallowed by the very handler being tested. Nothing fails. The test just gets
 * slow.
 *
 * That is invisible until the suite runs under load, where the accumulated
 * latency crosses vitest's 5s timeout and one file goes red in `pnpm check:all`
 * while passing on its own — which reads as a flake and gets re-run rather than
 * fixed. `email-destroy.test.ts` sat in that state carrying ~740ms of real SQS
 * traffic on every run.
 *
 * WHY THIS RECORDS INSTEAD OF THROWING. Throwing at the call site does not work,
 * and failing to notice that is easy: the interceptor throws, the swallowing
 * `catch {}` in the code under test absorbs it exactly as it absorbed the real
 * error, and the test goes green — only faster, because the socket never opened.
 * The speed-up is the only visible symptom. So violations are recorded and
 * asserted in afterEach, where no application-level catch can reach them.
 *
 * A static "test files must mock the clients they can reach" rule was tried
 * first and rejected: module reachability is not execution, and it flagged 59 of
 * 100 files. This fires only when a socket is actually requested, so it has no
 * false positives — if it trips, a unit test really did try to talk to the
 * network.
 *
 * Legitimate integration tests do not belong under this config; give them their
 * own project rather than weakening this guard.
 */

import http from "node:http";
import https from "node:https";
import { afterEach, beforeEach, expect } from "vitest";

type RequestFn = typeof https.request;

/**
 * Offline, deterministic credentials.
 *
 * Without these the SDK's credential chain runs before any service call, and on
 * a machine configured with AWS SSO that means a live request to the SSO portal
 * for federated credentials — so the suite's behaviour depended on whose laptop
 * it ran on, and the first thing blocked was always the credential call rather
 * than the thing the test actually got wrong. Pinning fake static credentials
 * makes resolution instant and offline, so when the guard below does fire it
 * names the real service endpoint and therefore the client that needs mocking.
 */
process.env.AWS_ACCESS_KEY_ID ||= "test-access-key-id";
process.env.AWS_SECRET_ACCESS_KEY ||= "test-secret-access-key";
process.env.AWS_SESSION_TOKEN ||= "test-session-token";
// Deliberately NOT setting AWS_REGION / AWS_DEFAULT_REGION. Application code
// reads those (`getAWSRegion()`), so setting them here would change the
// behaviour under test rather than just its environment — it silently broke two
// region-resolution tests that assert on how the region was obtained.
process.env.AWS_EC2_METADATA_DISABLED = "true";
// biome-ignore lint/performance/noDelete: the SDK checks for presence, not value
delete process.env.AWS_PROFILE;

const attempts: string[] = [];

function describeTarget(first: unknown): string {
  if (typeof first === "string") {
    return first;
  }
  if (first instanceof URL) {
    return first.toString();
  }
  if (first && typeof first === "object") {
    const o = first as { hostname?: string; host?: string; path?: string };
    return `${o.hostname ?? o.host ?? "unknown host"}${o.path ?? ""}`;
  }
  return "unknown host";
}

function guard(moduleName: string): RequestFn {
  // biome-ignore lint/suspicious/noExplicitAny: matching node's overloaded request signature
  return ((...args: any[]) => {
    attempts.push(`${moduleName} → ${describeTarget(args[0])}`);
    // Still throw, so the call cannot proceed to a socket. The throw may well be
    // swallowed downstream — that is what `attempts` is for.
    throw new Error(
      "Blocked: unit tests must not touch the network (see src/__tests__/setup/no-real-network.ts)"
    );
  }) as RequestFn;
}

https.request = guard("https");
http.request = guard("http");

// Vitest reuses a worker thread across files, so this module — and `attempts`
// with it — is shared. Clearing before each test keeps a call made outside a
// test body (at import time, or in a hook of an earlier file) from being
// reported against whichever test happens to finish next.
beforeEach(() => {
  attempts.length = 0;
});

afterEach(() => {
  if (attempts.length === 0) {
    return;
  }
  const seen = [...new Set(attempts)];
  attempts.length = 0;

  const aws = seen.some((a) => a.includes("amazonaws.com"))
    ? "\n\nAn AWS endpoint means an unmocked SDK client. Add a vi.mock for the `@aws-sdk/client-…` this path constructs — check the dynamic `await import()` calls in the module under test, including the ones inside catch blocks."
    : "";

  expect.unreachable(
    `This test attempted ${seen.length} real network request(s):\n  ${seen.join("\n  ")}${aws}`
  );
});
