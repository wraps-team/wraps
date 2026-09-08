"use server";

import { db } from "@wraps/db";
import { awsMarketplaceSubscription } from "@wraps/db/schema/aws-marketplace";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { createActionLogger } from "@/lib/logger";
import { MARKETPLACE_SESSION_COOKIE } from "@/lib/marketplace/aws";

const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export type MarketplaceRegisterResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Records the buyer's contact email against a resolved AWS Marketplace licence.
 *
 * The licence is read from the httpOnly cookie set by the registration POST,
 * never from the form — otherwise anyone could attach their address to someone
 * else's agreement by guessing a row id.
 *
 * This deliberately does NOT provision anything. AWS is explicit that resources
 * must not be created before the `subscribe-success` lifecycle event arrives,
 * so the row stays `pending` until EventBridge says otherwise.
 */
export async function registerMarketplaceContact(
  formData: FormData
): Promise<MarketplaceRegisterResult> {
  const log = createActionLogger("registerMarketplaceContact", {});

  const parsed = registerSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a valid email address",
    };
  }

  const cookieStore = await cookies();
  const ref = cookieStore.get(MARKETPLACE_SESSION_COOKIE)?.value;
  if (!ref) {
    return {
      ok: false,
      error:
        "This registration link has expired. Open your subscription in AWS Marketplace and choose Set up your account again.",
    };
  }

  const updated = await db
    .update(awsMarketplaceSubscription)
    .set({
      contactEmail: parsed.data.email,
      registeredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(awsMarketplaceSubscription.id, ref))
    .returning({ licenseArn: awsMarketplaceSubscription.licenseArn });

  if (updated.length === 0) {
    log.warn({ ref }, "Marketplace registration referenced an unknown licence");
    return {
      ok: false,
      error:
        "We could not find that subscription. Open your subscription in AWS Marketplace and choose Set up your account again.",
    };
  }

  log.info(
    { licenseArn: updated[0]?.licenseArn },
    "Captured contact email for an AWS Marketplace subscription"
  );

  return { ok: true };
}
