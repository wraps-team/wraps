import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/lambda/sqs-handler.ts", "src/bin/setup.ts", "src/bin/poll.ts"],
  format: ["esm", "cjs"],
  dts: { entry: ["src/index.ts", "src/lambda/sqs-handler.ts"] },
  sourcemap: true,
  clean: true,
  external: [
    "@workflow/world",
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-dynamodb-streams",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-sqs",
  ],
});
