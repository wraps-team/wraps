import { sign } from "node:crypto";

const VALID_TIERS = ["pro", "business", "starter", "growth", "scale"] as const;

export function generateLicenseKey(tier: string, expires: string): string {
  if (!(VALID_TIERS as readonly string[]).includes(tier)) {
    throw new Error(
      `Invalid tier "${tier}". Valid tiers: ${VALID_TIERS.join(", ")}`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (expires <= today) {
    throw new Error(
      `Expiry date must be in the future (got "${expires}", today is "${today}")`
    );
  }

  const privateKeyPem = process.env.WRAPS_LICENSE_PRIVATE_KEY;
  if (!privateKeyPem) {
    throw new Error("WRAPS_LICENSE_PRIVATE_KEY is not set");
  }

  const payload = `v1.${tier}.${expires}`;
  const sig = sign(null, Buffer.from(payload), privateKeyPem);
  return `${payload}.${sig.toString("hex")}`;
}
