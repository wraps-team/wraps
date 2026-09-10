import { defineConfig } from "vitest/config";

// Scripts depend on packages installed in packages/cli — set root there so
// node_modules resolution matches how these tests previously ran.
export default defineConfig({
  root: "packages/cli",
  test: {
    globals: true,
    environment: "node",
    include: [
      "../../scripts/selfhost/__tests__/**/*.test.ts",
      "../../scripts/test-db/__tests__/**/*.test.ts",
      "../../scripts/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
