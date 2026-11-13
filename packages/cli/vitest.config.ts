import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests must never read or write the developer's real ~/.wraps, ~/.pulumi or
// ~/.config. Each vitest run gets one temp home (created and removed by
// fake-home-global.ts) and every worker is a forked process whose environment
// points at it. A real fork's os.homedir() follows HOME, so this also covers
// node_modules code (conf, env-paths, Pulumi automation) and child processes,
// which a vi.mock of node:os cannot reach. Under pool "threads" os.homedir()
// ignores a HOME set in the worker, which is why the pool is "forks".
// All test files in a run share this one home, so a test that needs isolation (or
// needs the dir empty) makes its own temp dir.
process.env.WRAPS_CLI_TEST_HOME = join(
  tmpdir(),
  `wraps-cli-home-${process.pid}-${Math.random().toString(36).slice(2)}`
);
const fakeHome = process.env.WRAPS_CLI_TEST_HOME;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Fails any test that opens a real socket. See the file for why this is a
    // runtime guard rather than a lint rule.
    setupFiles: ["src/__tests__/setup/no-real-network.ts"],
    globalSetup: ["src/__tests__/setup/fake-home-global.ts"],
    env: {
      // Colour only: NO_COLOR beats FORCE_COLOR and CI in picocolors (and in
      // @clack/prompts, which uses it), so CI's env no longer turns colour on.
      // Node's own colour detection does the opposite, and CI still changes
      // isInteractive() and telemetry, so run with CI=true when touching those.
      NO_COLOR: "1",
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      XDG_CONFIG_HOME: join(fakeHome, ".config"),
      XDG_DATA_HOME: join(fakeHome, ".local", "share"),
      XDG_CACHE_HOME: join(fakeHome, ".cache"),
      XDG_STATE_HOME: join(fakeHome, ".local", "state"),
      PULUMI_HOME: join(fakeHome, ".pulumi"),
    },
    // Headroom for scheduler delay, not for slow tests: every test in this
    // package runs in single-digit milliseconds. Under `pnpm test` at the repo
    // root, apps/web and apps/api now run their files in parallel too, and the
    // machine is oversubscribed enough that a worker here can sit unscheduled
    // past the 5s default — `email-doctor.test.ts` timed out that way on ~2 of
    // 3 full-monorepo runs while passing in 4ms standalone. Nothing here can
    // hang on I/O; `no-real-network.ts` fails any test that opens a socket.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/__tests__/**",
        "lambda/",
        "templates/",
        // Infrastructure code (Pulumi) - tested through integration tests
        "src/infrastructure/**",
        // Express server code - will be tested later with integration tests
        "src/console/routes/**",
        "src/console/middleware/**",
        "src/console/services/**",
        "src/console/server.ts",
        // Interactive CLI commands - tested through integration tests
        "src/commands/email/upgrade.ts",
        "src/commands/email/destroy.ts",
        "src/commands/shared/destroy.ts",
        // Archive utility used primarily by console
        "src/utils/archive.ts",
        // CLI entry point
        "src/cli.ts",
        // Complex utilities - tested through integration tests
        "src/utils/shared/pulumi.ts",
        "src/utils/shared/output.ts",
        "src/utils/shared/prompts.ts",
        "src/utils/route53.ts",
        // DNS credentials - complex interactive prompts
        "src/utils/dns/credentials.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    // Suppress console output during tests for cleaner output
    silent: false,
    // Run tests in parallel for better performance
    pool: "forks",
  },
});
