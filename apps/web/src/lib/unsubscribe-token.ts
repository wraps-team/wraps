/**
 * Unsubscribe Token Utility
 *
 * Generates and verifies JWT tokens for email unsubscribe links.
 * Used for RFC 8058 one-click unsubscribe compliance.
 */

import * as jose from "jose";

// Token payload structure
export interface UnsubscribeTokenPayload {
  cid: string; // contact ID
  oid: string; // organization ID
  tid?: string; // optional: specific topic ID
  type: "unsub"; // token type marker
}

// Get the secret from environment
function getSecret(): Uint8Array {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ||
    "dev-unsubscribe-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

/**
 * Generate an unsubscribe token for a contact
 */
export async function generateUnsubscribeToken(
  contactId: string,
  organizationId: string,
  topicId?: string
): Promise<string> {
  const payload: UnsubscribeTokenPayload = {
    cid: contactId,
    oid: organizationId,
    type: "unsub",
  };

  if (topicId) {
    payload.tid = topicId;
  }

  const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getSecret());

  return token;
}

/**
 * Verify and decode an unsubscribe token
 */
export async function verifyUnsubscribeToken(
  token: string
): Promise<UnsubscribeTokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());

    if (
      typeof payload.cid !== "string" ||
      typeof payload.oid !== "string" ||
      payload.type !== "unsub"
    ) {
      return null;
    }

    return {
      cid: payload.cid,
      oid: payload.oid,
      tid: typeof payload.tid === "string" ? payload.tid : undefined,
      type: "unsub",
    };
  } catch {
    return null;
  }
}

/**
 * Generate unsubscribe URL
 */
export async function generateUnsubscribeUrl(
  contactId: string,
  organizationId: string,
  topicId?: string
): Promise<string> {
  const token = await generateUnsubscribeToken(
    contactId,
    organizationId,
    topicId
  );
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.wraps.dev";
  return `${baseUrl}/unsubscribe/${token}`;
}

/**
 * Generate preferences URL
 */
export async function generatePreferencesUrl(
  contactId: string,
  organizationId: string
): Promise<string> {
  const token = await generateUnsubscribeToken(contactId, organizationId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wraps.dev";
  return `${baseUrl}/preferences/${token}`;
}
