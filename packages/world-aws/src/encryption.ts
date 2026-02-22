const SALT = new Uint8Array(32);

/**
 * Derives a per-run 32-byte encryption key from a base key using HKDF-SHA256.
 *
 * The info string is `"${deploymentId}|${runId}"`, ensuring each run gets a
 * unique derived key while remaining deterministic for the same inputs.
 *
 * @param baseKeyBase64 - Base64-encoded 32-byte master key.
 * @param deploymentId  - Deployment identifier (scopes keys per deployment).
 * @param runId         - Workflow run identifier.
 * @returns 32-byte derived key as `Uint8Array`.
 * @throws If the base key does not decode to exactly 32 bytes.
 */
export async function deriveKeyForRun(
  baseKeyBase64: string,
  deploymentId: string,
  runId: string
): Promise<Uint8Array> {
  const raw = Uint8Array.from(atob(baseKeyBase64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) {
    throw new Error(
      `WORKFLOW_AWS_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${raw.length}`
    );
  }

  const ikm = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveBits",
  ]);

  const info = new TextEncoder().encode(`${deploymentId}|${runId}`);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info },
    ikm,
    256
  );

  return new Uint8Array(bits);
}
