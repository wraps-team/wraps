import { defineConfig } from "tsup";

const awsSdkExternal = [
  "@workflow/world",
  "@aws-sdk/client-dynamodb",
  "@aws-sdk/client-dynamodb-streams",
  "@aws-sdk/lib-dynamodb",
  "@aws-sdk/client-sqs",
];

export default defineConfig([
  {
    entry: ["src/index.ts", "src/lambda/sqs-handler.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: awsSdkExternal,
  },
  {
    entry: ["src/bin/setup.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
    external: awsSdkExternal,
  },
]);
