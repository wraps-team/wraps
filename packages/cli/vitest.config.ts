import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Fails any test that opens a real socket. See the file for why this is a
    // runtime guard rather than a lint rule.
    setupFiles: ["src/__tests__/setup/no-real-network.ts"],
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
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
