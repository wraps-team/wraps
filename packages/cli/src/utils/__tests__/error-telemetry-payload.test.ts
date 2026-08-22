import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * `handleCLIError`'s two UNHANDLED_ERROR branches are the only telemetry call
 * sites that hand a free-form error *message* to `trackError`. `trackError`
 * spreads its metadata straight into the `error:occurred` event (unlike
 * `trackCommand`, it blanks nothing), and `TelemetryClient.track` spreads the
 * properties straight into the JSON body it POSTs — so whatever lands in that
 * metadata leaves the machine verbatim.
 *
 * That payload used to be dead-lettered: `handleCLIError` called
 * `process.exit(1)` before the client's 100ms flush timer could fire. Now it
 * sets `process.exitCode` and returns so `run()`'s `finally { await
 * telemetry.shutdown() }` drains the queue, which makes the payload live.
 *
 * Observation point is the client's debug mode, which serializes the exact
 * event it would send. That is the real chain — errors.ts -> events.ts ->
 * client.ts -> JSON body — with the socket swapped for a console.log, so this
 * asserts on what would actually be transmitted rather than on a stub.
 */

const HOME_PATH_ERROR = new Error(
  "EACCES: permission denied, open '/Users/alice/Projects/northstar-acquisition/.wraps/templates/welcome.tsx'"
);

const holder = vi.hoisted(() => ({
  client: undefined as { track: (e: string, p?: unknown) => void } | undefined,
}));

vi.mock("../../telemetry/client.js", () => ({
  getTelemetryClient: () => holder.client,
}));

import * as clack from "@clack/prompts";
import { handleCLIError } from "../shared/errors.js";
import { setJsonMode } from "../shared/json-output.js";

type ClientModule = typeof import("../../telemetry/client.js");
let TelemetryClient: ClientModule["TelemetryClient"];

beforeAll(async () => {
  const actual = await vi.importActual<ClientModule>(
    "../../telemetry/client.js"
  );
  TelemetryClient = actual.TelemetryClient;
});

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

/**
 * The debug lines the client emitted, parsed back into events. Debug mode is
 * checked before the enabled check, so this works regardless of the machine's
 * telemetry config or CI detection.
 */
function capturedEvents(): Array<{
  event: string;
  properties: Record<string, unknown>;
}> {
  return consoleLogSpy.mock.calls
    .filter((call) => call[0] === "[Telemetry Debug] Event:")
    .map((call) => JSON.parse(call[1] as string));
}

beforeEach(() => {
  holder.client = new TelemetryClient({ debug: true });
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
    // captured, not printed
  });
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
    // captured, not printed
  });
  vi.spyOn(clack.log, "error").mockImplementation(() => {
    // captured, not printed
  });
});

afterEach(() => {
  setJsonMode(false);
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("unhandled-error telemetry never carries the raw error message", () => {
  it("emits an error:occurred event at all (guards the assertions below)", () => {
    handleCLIError(HOME_PATH_ERROR, "email:templates:push");

    const events = capturedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("error:occurred");
    expect(events[0].properties.error_code).toBe("UNHANDLED_ERROR");
  });

  it("keeps the developer's home path and project name out of the human-mode payload", () => {
    handleCLIError(HOME_PATH_ERROR, "email:templates:push");

    const [sent] = capturedEvents();
    expect(sent.properties).not.toHaveProperty("message");
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain("/Users/alice");
    expect(wire).not.toContain("northstar-acquisition");
    expect(wire).not.toContain("EACCES");
  });

  it("keeps them out of the JSON-mode payload too", () => {
    setJsonMode(true);

    handleCLIError(HOME_PATH_ERROR, "email:templates:push");

    const [sent] = capturedEvents();
    expect(sent.event).toBe("error:occurred");
    expect(sent.properties.error_code).toBe("UNHANDLED_ERROR");
    expect(sent.properties).not.toHaveProperty("message");
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain("/Users/alice");
    expect(wire).not.toContain("northstar-acquisition");
    expect(wire).not.toContain("EACCES");
  });

  it("still reports the error type, so unhandled failures stay buckettable", () => {
    handleCLIError(HOME_PATH_ERROR, "email:templates:push");

    const [sent] = capturedEvents();
    expect(sent.properties.errorType).toBe("Error");
    expect(sent.properties.command).toBe("email:templates:push");
  });
});
