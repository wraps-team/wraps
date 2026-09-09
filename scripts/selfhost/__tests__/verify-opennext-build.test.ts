import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOpenNextCommand } from "../verify-opennext-build.mjs";

// This helper picks which OpenNext the canary build runs. If it silently
// returns the wrong version the job still passes — it just stops testing the
// thing a customer's deploy actually does — so the failure mode is a green
// build against an OpenNext SST would never invoke.
const platformSource = readFileSync(
  new URL(
    "../../../infra/.sst/platform/src/components/aws/nextjs.ts",
    import.meta.url
  ),
  "utf-8"
);

const configSource = readFileSync(
  new URL("../../../infra/selfhost.config.ts", import.meta.url),
  "utf-8"
);

const stubPlatform = `
const DEFAULT_OPEN_NEXT_VERSION = "3.9.14";
const DEFAULT_OPEN_NEXT_VERSION_NEXT14 = "3.6.6";
`;

describe("resolveOpenNextCommand", () => {
  it("reads the real platform's default rather than a version pinned here", () => {
    const resolved = resolveOpenNextCommand({
      platformSource,
      nextSpecifier: "16.2.12",
      configSource,
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(platformSource).toContain(
      `const DEFAULT_OPEN_NEXT_VERSION = "${resolved.version}"`
    );
  });

  // The whole point of deriving instead of pinning: an sst bump has to move
  // the canary with it, with nobody remembering to edit this repo.
  it("follows the platform when SST changes its default", () => {
    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform.replace("3.9.14", "3.9.99"),
        nextSpecifier: "16.2.12",
        configSource,
      }).command
    ).toBe("@opennextjs/aws@3.9.99");
  });

  it("fails loudly when SST renames the constant, instead of guessing", () => {
    const resolved = resolveOpenNextCommand({
      platformSource: 'const OPEN_NEXT_PIN = "3.9.14";',
      nextSpecifier: "16.2.12",
      configSource,
    });

    expect(resolved.version).toBeUndefined();
    expect(resolved.error).toContain("DEFAULT_OPEN_NEXT_VERSION");
  });

  // Mirrors SST's own branches so the canary can never build with a different
  // adapter than the deploy: the Next 14 default, and the 3.1.4 rename from
  // open-next to @opennextjs/aws.
  it("uses the Next 14 default below Next 15, and the old package name below 3.1.4", () => {
    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform,
        nextSpecifier: "14.2.35",
        configSource,
      }).command
    ).toBe("@opennextjs/aws@3.6.6");

    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform.replace("3.9.14", "3.1.3"),
        nextSpecifier: "16.2.12",
        configSource,
      }).command
    ).toBe("open-next@3.1.3");
  });

  // The config does not pin one today. If someone ever does — the documented
  // escape hatch when SST's default lags Next — the canary must switch to it,
  // or CI would keep vouching for a version the deploy no longer uses.
  it("prefers an openNextVersion pinned in selfhost.config.ts", () => {
    const resolved = resolveOpenNextCommand({
      platformSource: stubPlatform,
      nextSpecifier: "16.2.12",
      configSource:
        'new sst.aws.Nextjs("SelfhostWeb", { openNextVersion: "3.10.4" })',
    });

    expect(resolved.command).toBe("@opennextjs/aws@3.10.4");
    expect(resolved.pinned).toBe(true);
  });
});
