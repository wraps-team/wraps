import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorld } from "../src/index.js";

const TEST_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex"
).toString("base64");

describe("getEncryptionKeyForRun integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WORKFLOW_AWS_ENCRYPTION_KEY = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("not present when no encryption key configured", () => {
    const world = createWorld();
    expect(world).not.toHaveProperty("getEncryptionKeyForRun");
    world.close();
  });

  it("present when encryption key configured", () => {
    const world = createWorld({ encryptionKey: TEST_KEY });
    expect(world).toHaveProperty("getEncryptionKeyForRun");
    expect(typeof world.getEncryptionKeyForRun).toBe("function");
    world.close();
  });

  it("derives key from WorkflowRun object", async () => {
    const world = createWorld({ encryptionKey: TEST_KEY });
    const run = { runId: "run-123", deploymentId: "deploy-abc" };
    const key = await world.getEncryptionKeyForRun!(run as any);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key!.length).toBe(32);
    world.close();
  });

  it("derives key from runId string + context", async () => {
    const world = createWorld({ encryptionKey: TEST_KEY });
    const key = await world.getEncryptionKeyForRun!("run-123", {
      deploymentId: "deploy-abc",
    });
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key!.length).toBe(32);

    // Should match the object overload with same inputs
    const run = { runId: "run-123", deploymentId: "deploy-abc" };
    const keyFromObject = await world.getEncryptionKeyForRun!(run as any);
    expect(key).toEqual(keyFromObject);
    world.close();
  });

  it("string overload without context uses current deploymentId", async () => {
    const world = createWorld({
      encryptionKey: TEST_KEY,
      deploymentId: "my-deploy",
    });
    const key = await world.getEncryptionKeyForRun!("run-123");
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key!.length).toBe(32);

    // Should match object overload using the resolved deploymentId
    const run = { runId: "run-123", deploymentId: "my-deploy" };
    const keyFromObject = await world.getEncryptionKeyForRun!(run as any);
    expect(key).toEqual(keyFromObject);
    world.close();
  });
});
