/**
 * One invocation must emit one command outcome.
 *
 * cli.ts routes a command and then reports the outcome itself, but most
 * handlers already report their own — `wraps email domains add` was emitting
 * `command:email:domains:add` from domains.ts and `command:email:domains` from
 * cli.ts 1ms apart, for a single run. That inflated the failure rate and split
 * one command across two names (cli.ts names the fallback from only two
 * positionals, so `add` was lost).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({
  getTelemetryClient: vi.fn(() => ({ track: vi.fn() })),
}));

/** Fresh module state per test — the "already reported" flag is module-level. */
async function loadEvents() {
  vi.resetModules();
  const { getTelemetryClient } = await import("../client.js");
  const track = vi.fn();
  vi.mocked(getTelemetryClient).mockReturnValue({ track } as never);
  const events = await import("../events.js");
  return { events, track };
}

const names = (track: ReturnType<typeof vi.fn>) =>
  track.mock.calls.map((c) => c[0] as string);

describe("trackCommandFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the outcome when no handler reported one", async () => {
    const { events, track } = await loadEvents();

    events.trackCommandFallback("email:domains", { success: true });

    expect(names(track)).toEqual(["command:email:domains"]);
  });

  it("does not re-report success a handler already reported", async () => {
    const { events, track } = await loadEvents();

    // domains.ts:887 — the handler reports the specific command.
    events.trackCommand("email:domains:add", { success: true });
    // cli.ts:1146 — the routing layer must now stay quiet.
    events.trackCommandFallback("email:domains", { success: true });

    expect(names(track)).toEqual(["command:email:domains:add"]);
  });

  it("does not re-report a failure a handler already reported", async () => {
    const { events, track } = await loadEvents();

    // domains.ts:923 — handler reports its own failure, then throws.
    events.trackCommand("email:domains:add", { success: false });
    // cli.ts:1708 — the catch must not add a second failure event.
    events.trackCommandFallback("email:domains", { success: false });

    expect(names(track)).toEqual(["command:email:domains:add"]);
  });

  it("still reports a failure after a handler reported success", async () => {
    const { events, track } = await loadEvents();

    // A handler reports success, then a later step throws. Losing this would
    // hide a real failure, so suppression must not apply here.
    events.trackCommand("email:domains:add", { success: true });
    events.trackCommandFallback("email:domains", { success: false });

    expect(names(track)).toEqual([
      "command:email:domains:add",
      "command:email:domains",
    ]);
  });

  it("reports the failure when the command never reached a handler", async () => {
    const { events, track } = await loadEvents();

    // `wraps email domains` with no subcommand throws from the switch default
    // before any handler runs — nothing has reported, so this is the only event.
    events.trackCommandFallback("email:domains", { success: false });

    expect(names(track)).toEqual(["command:email:domains"]);
  });

  it("leaves direct trackCommand calls untouched", async () => {
    const { events, track } = await loadEvents();

    // The interactive menu legitimately emits several events per session.
    events.trackCommand("interactive:menu", { success: true });
    events.trackCommand("interactive:email-init", { success: true });
    events.trackCommand("interactive:email-init:completed", { success: true });

    expect(names(track)).toEqual([
      "command:interactive:menu",
      "command:interactive:email-init",
      "command:interactive:email-init:completed",
    ]);
  });
});
