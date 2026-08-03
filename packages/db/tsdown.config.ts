import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/**/*.ts",
  sourcemap: true,
  dts: true,
  // tsdown >=0.16 emits .mjs/.d.mts by default; these packages are
  // "type": "module" and their exports maps point at .js/.d.ts
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
