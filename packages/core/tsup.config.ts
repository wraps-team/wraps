import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/ses-plans.ts", "src/config-set-name.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
