import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every worker here swallows its own failures on purpose: a DLQ consumer that
// throws has no DLQ-of-DLQ, one bad recipient must not abort a broadcast, and
// one drifted IAM role must not abort the account-health sweep. That makes
// Sentry the only place those failures ever surface — so an uninstrumented
// worker, or an instrumented one whose Lambda never receives SENTRY_DSN,
// reports nothing at all. Both halves are asserted from the infra source
// because there is no runtime that would notice either gap.
const REPO_ROOT = new URL("../../../../", import.meta.url);

const INFRA_FILES = [
  "infra/queues.ts",
  "infra/cron.ts",
  "infra/selfhost.config.ts",
];

/** Handler paths as SST declares them, e.g. apps/api/src/workers/x.handler */
function handlerRefs(source: string): string[] {
  return [...source.matchAll(/handler:\s*"([^"]+\.handler)"/g)].map(
    (match) => match[1]
  );
}

function workerSourcePath(handlerRef: string): string {
  return handlerRef.replace(/^(\.\.\/)+/, "").replace(/\.handler$/, ".ts");
}

const infra = INFRA_FILES.map((path) => ({
  path,
  source: readFileSync(new URL(path, REPO_ROOT), "utf-8"),
}));

const workerFiles = [
  ...new Set(infra.flatMap((f) => handlerRefs(f.source).map(workerSourcePath))),
];

describe("worker Sentry instrumentation", () => {
  it("finds the deployed handlers", () => {
    // Guards the parsing above, not the workers.
    expect(workerFiles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(workerFiles)("%s initializes Sentry", (path) => {
    const source = readFileSync(new URL(path, REPO_ROOT), "utf-8");
    expect(source).toMatch(/^import "(\.\.?\/)+lib\/sentry";$/m);
  });

  describe.each(infra)("$path", ({ source }) => {
    // Each function's environment block follows its own `handler:` key, so a
    // slice that runs to the next handler covers exactly one definition.
    const refs = handlerRefs(source);
    const blocks = refs.map((ref, idx) => {
      const start = source.indexOf(`"${ref}"`);
      const next =
        idx + 1 < refs.length
          ? source.indexOf(`"${refs[idx + 1]}"`)
          : source.length;
      return { ref, block: source.slice(start, next) };
    });

    it.each(blocks)(
      "passes SENTRY_DSN (directly or via sentryEnv) to $ref",
      ({ block }) => {
        expect(block).toMatch(/SENTRY_DSN|\.\.\.sentryEnv\b/);
      }
    );
  });

  it("sentryEnv itself carries SENTRY_DSN", () => {
    const source = readFileSync(
      new URL("infra/secrets.ts", REPO_ROOT),
      "utf-8"
    );
    const start = source.indexOf("export const sentryEnv");
    const end = source.indexOf("};", start) + 2;
    const sentryEnvLiteral = source.slice(start, end);

    expect(sentryEnvLiteral).toContain("SENTRY_DSN: sentryDsn.value");
  });
});
