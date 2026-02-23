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
    process.env.WORKFLOW_AWS_TTL = undefined;
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
    const validKey = Buffer.alloc(32, 0xaa).toString("base64");
    const config = resolveConfig({ encryptionKey: validKey });

    expect(config.encryptionKey).toBe(validKey);
  });

  it("reads encryptionKey from env var", () => {
    const validKey = Buffer.alloc(32, 0xbb).toString("base64");
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = validKey;

    const config = resolveConfig();

    expect(config.encryptionKey).toBe(validKey);
  });

  it("config encryptionKey takes precedence over env var", () => {
    const envKey = Buffer.alloc(32, 0xcc).toString("base64");
    const configKey = Buffer.alloc(32, 0xdd).toString("base64");
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = envKey;

    const config = resolveConfig({ encryptionKey: configKey });

    expect(config.encryptionKey).toBe(configKey);
  });

  it("encryptionKey is undefined when not set", () => {
    const config = resolveConfig();

    expect(config.encryptionKey).toBeUndefined();
  });

  it("validates encryptionKey is valid base64 of 32 bytes", () => {
    // Valid 32-byte key (base64-encoded)
    const validKey = Buffer.from(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "hex"
    ).toString("base64");

    const config = resolveConfig({ encryptionKey: validKey });
    expect(config.encryptionKey).toBe(validKey);
  });

  it("rejects encryptionKey that decodes to wrong length", () => {
    // 16 bytes instead of 32
    const shortKey = Buffer.from("0123456789abcdef", "hex").toString("base64");

    expect(() => resolveConfig({ encryptionKey: shortKey })).toThrow(
      "must decode to 32 bytes"
    );
  });

  it("rejects encryptionKey that is not valid base64", () => {
    expect(() => resolveConfig({ encryptionKey: "!!!not-base64!!!" })).toThrow(
      "not valid base64"
    );
  });

  it("validates encryptionKey from env var", () => {
    const shortKey = Buffer.from("0123456789abcdef", "hex").toString("base64");
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = shortKey;

    expect(() => resolveConfig()).toThrow("must decode to 32 bytes");
  });

  it("ttlSeconds defaults to undefined", () => {
    const config = resolveConfig();

    expect(config.ttlSeconds).toBeUndefined();
  });

  it("ttlSeconds reads from WORKFLOW_AWS_TTL env var", () => {
    process.env.WORKFLOW_AWS_TTL = "86400";

    const config = resolveConfig();

    expect(config.ttlSeconds).toBe(86_400);
  });

  it("explicit ttl config takes precedence over env var", () => {
    process.env.WORKFLOW_AWS_TTL = "86400";

    const config = resolveConfig({ ttl: { seconds: 3600 } });

    expect(config.ttlSeconds).toBe(3600);
  });

  it("ttlSeconds from Duration helper", () => {
    const config = resolveConfig({ ttl: { seconds: 7_776_000 } });

    expect(config.ttlSeconds).toBe(7_776_000);
  });
});
