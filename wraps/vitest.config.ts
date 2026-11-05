import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["templates/__tests__/*.test.tsx"],
    // The first lintComponent call warms the linter up and goes past 5s under turbo's parallel load.
    testTimeout: 30_000,
  },
});
