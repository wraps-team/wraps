import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AWS_REGION = undefined;
    process.env.AWS_DEFAULT_REGION = undefined;
    process.env.WORKFLOW_AWS_TABLE_PREFIX = undefined;
    process.env.WORKFLOW_AWS_QUEUE_PREFIX = undefined;
    process.env.WORKFLOW_AWS_ENDPOINT = undefined;
    process.env.WORKFLOW_AWS_DEPLOYMENT_ID = undefined;
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses defaults when no config or env vars", () => {
    const config = resolveConfig();

    expect(config.region).toBe("us-east-1");
    expect(config.tablePrefix).toBe("workflow");
    expect(config.queuePrefix).toBe("workflow");
    expect(config.endpoint).toBeUndefined();
    expect(config.deploymentId).toBe("aws-us-east-1");
  });

  it("explicit config takes precedence over env vars", () => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.WORKFLOW_AWS_TABLE_PREFIX = "env-tables";

    const config = resolveConfig({
      region: "ap-southeast-1",
      tablePrefix: "my-tables",
    });

    expect(config.region).toBe("ap-southeast-1");
    expect(config.tablePrefix).toBe("my-tables");
  });

  it("reads from env vars when config not provided", () => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.WORKFLOW_AWS_TABLE_PREFIX = "prod";
    process.env.WORKFLOW_AWS_QUEUE_PREFIX = "prod-q";
    process.env.WORKFLOW_AWS_ENDPOINT = "http://localhost:8000";
    process.env.WORKFLOW_AWS_DEPLOYMENT_ID = "prod-eu";

    const config = resolveConfig();

    expect(config.region).toBe("eu-west-1");
    expect(config.tablePrefix).toBe("prod");
    expect(config.queuePrefix).toBe("prod-q");
    expect(config.endpoint).toBe("http://localhost:8000");
    expect(config.deploymentId).toBe("prod-eu");
  });

  it("falls back to AWS_DEFAULT_REGION when AWS_REGION not set", () => {
    process.env.AWS_DEFAULT_REGION = "us-west-2";

    const config = resolveConfig();

    expect(config.region).toBe("us-west-2");
  });

  it("AWS_REGION takes precedence over AWS_DEFAULT_REGION", () => {
    process.env.AWS_REGION = "us-east-2";
    process.env.AWS_DEFAULT_REGION = "us-west-2";

    const config = resolveConfig();

    expect(config.region).toBe("us-east-2");
  });

  it("deploymentId defaults to aws-{region}", () => {
    const config = resolveConfig({ region: "ap-northeast-1" });

    expect(config.deploymentId).toBe("aws-ap-northeast-1");
  });

  it("handles empty config object", () => {
    const config = resolveConfig({});

    expect(config.region).toBe("us-east-1");
    expect(config.tablePrefix).toBe("workflow");
  });

  it("reads encryptionKey from config", () => {
    const config = resolveConfig({ encryptionKey: "my-key" });

    expect(config.encryptionKey).toBe("my-key");
  });

  it("reads encryptionKey from env var", () => {
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = "env-key";

    const config = resolveConfig();

    expect(config.encryptionKey).toBe("env-key");
  });

  it("config encryptionKey takes precedence over env var", () => {
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = "env-key";

    const config = resolveConfig({ encryptionKey: "config-key" });

    expect(config.encryptionKey).toBe("config-key");
  });

  it("encryptionKey is undefined when not set", () => {
    const config = resolveConfig();

    expect(config.encryptionKey).toBeUndefined();
  });
});
