import { describe, expect, it } from "vitest";
import { deriveKeyForRun } from "../src/encryption.js";

// 32 random bytes, base64-encoded (64 hex chars = 32 bytes)
const BASE_KEY_A = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex"
).toString("base64");
const BASE_KEY_B = Buffer.from(
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  "hex"
).toString("base64");

describe("deriveKeyForRun", () => {
  it("returns a 32-byte Uint8Array", async () => {
    const key = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it("is deterministic (same inputs → same key)", async () => {
    const key1 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    const key2 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    expect(key1).toEqual(key2);
  });

  it("different runIds → different keys", async () => {
    const key1 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    const key2 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-2");
    expect(key1).not.toEqual(key2);
  });

  it("different deploymentIds → different keys", async () => {
    const key1 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    const key2 = await deriveKeyForRun(BASE_KEY_A, "deploy-2", "run-1");
    expect(key1).not.toEqual(key2);
  });

  it("different base keys → different keys", async () => {
    const key1 = await deriveKeyForRun(BASE_KEY_A, "deploy-1", "run-1");
    const key2 = await deriveKeyForRun(BASE_KEY_B, "deploy-1", "run-1");
    expect(key1).not.toEqual(key2);
  });

  it("throws if base key is not 32 bytes", async () => {
    const shortKey = Buffer.from("0123456789abcdef", "hex").toString("base64");
    await expect(
      deriveKeyForRun(shortKey, "deploy-1", "run-1")
    ).rejects.toThrow("must decode to exactly 32 bytes");
  });
});
