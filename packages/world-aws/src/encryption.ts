const SALT = new Uint8Array(32);

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
