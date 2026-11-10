import { afterEach, describe, expect, it, vi } from "vitest";
import { trackCommand } from "../../telemetry/events.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));

// The real splitter, fed the real policy with its first statement repeated:
// the duplicate-Sid guard is what a broken statement list would trip.
vi.mock("../../utils/shared/iam-policy-split.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../utils/shared/iam-policy-split.js")
    >();
  return {
    ...actual,
    splitPolicy: (policy: { Version: string; Statement: { Sid: string }[] }) =>
      actual.splitPolicy({
        ...policy,
        Statement: [
          ...policy.Statement,
          policy.Statement[0] as { Sid: string },
        ],
      }),
  };
});

import { permissions } from "../permissions.js";

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
  vi.mocked(trackCommand).mockClear();
});

describe("permissions: a policy that can't be split fails with a code", () => {
  it.each([
    ["the plain summary", {}, false],
    ["--json", { json: true }, true],
  ] as const)(
    "%s throws POLICY_SPLIT_FAILED before printing anything",
    async (_label, options, json) => {
      setJsonMode(json);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const thrown = await permissions(options).then(
        () => null,
        (err: unknown) => err
      );

      expect(thrown).toBeInstanceOf(WrapsError);
      expect((thrown as WrapsError).code).toBe("POLICY_SPLIT_FAILED");
      expect((thrown as WrapsError).message).toBe(
        'Duplicate IAM statement Sid "STSGetCallerIdentity"'
      );
      expect((thrown as WrapsError).docsUrl).toBe(
        "https://wraps.dev/docs/reference/errors#iam-permissions"
      );
      expect(log).not.toHaveBeenCalled();
      expect(trackCommand).not.toHaveBeenCalled();
    }
  );
});
