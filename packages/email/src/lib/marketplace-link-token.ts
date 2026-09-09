import * as jose from "jose";

/**
 * Signed link tokens for AWS Marketplace subscriptions.
 *
 * These replace matching a buyer to their agreement by email address. An email
 * match is spoofable in one direction: whoever subscribes types the contact
 * address themselves, so they can enter a stranger's, and that stranger's
 * later signup would silently attach an agreement they never bought. Harmless
 * on a free listing, not harmless once entitlements gate a plan.
 *
 * A token proves possession of the confirmation email instead, which is the
 * thing we actually want to check.
 */

export type MarketplaceLinkTokenPayload = {
  sid: string; // aws_marketplace_subscription.id
  type: "marketplace-link"; // token type marker
};

// Long enough that a buyer who sets up next week still succeeds, short enough
// that a forwarded mailbox is not a permanent claim on the agreement.
const TOKEN_EXPIRATION = "30d";

function getSecret(): Uint8Array {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    const isProduction =
      process.env.NODE_ENV === "production" ||
      !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (isProduction) {
      throw new Error(
        "UNSUBSCRIBE_SECRET environment variable is required in production"
      );
    }
    return new TextEncoder().encode(
      "dev-unsubscribe-secret-change-in-production"
    );
  }
  return new TextEncoder().encode(secret);
}

export function generateMarketplaceLinkToken(
  subscriptionId: string
): Promise<string> {
  const payload: MarketplaceLinkTokenPayload = {
    sid: subscriptionId,
    type: "marketplace-link",
  };

  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(getSecret());
}

/**
 * Verify a marketplace link token. Returns null for anything invalid, expired,
 * or of the wrong type — the type marker matters because every token in this
 * codebase is signed with the same secret, so an unsubscribe token would
 * otherwise verify here too.
 */
export async function verifyMarketplaceLinkToken(
  token: string
): Promise<MarketplaceLinkTokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());

    if (payload.type !== "marketplace-link") {
      return null;
    }
    if (typeof payload.sid !== "string" || payload.sid.length === 0) {
      return null;
    }

    return { sid: payload.sid, type: "marketplace-link" };
  } catch {
    // Invalid signature, malformed token, or expired — all indistinguishable
    // to the caller on purpose.
    return null;
  }
}
