import {
  MarketplaceMeteringClient,
  ResolveCustomerCommand,
  type ResolveCustomerCommandOutput,
} from "@aws-sdk/client-marketplace-metering";
import { db } from "@wraps/db";
import { awsMarketplaceSubscription } from "@wraps/db/schema/aws-marketplace";
import { NextResponse } from "next/server";
import { logger, serializeError } from "@/lib/logger";
import {
  MARKETPLACE_REGION,
  MARKETPLACE_SESSION_COOKIE,
  REGISTRATION_PATH,
  type RegistrationError,
} from "@/lib/marketplace/aws";

export const dynamic = "force-dynamic";

/**
 * AWS Marketplace SaaS registration landing page.
 *
 * AWS sends the buyer here as a cross-site form POST carrying a one-shot
 * `x-amzn-marketplace-token` after they choose "Set up your account". The token
 * is short-lived and single-use, so the identity it resolves to is written to
 * the database before anything else happens — if the buyer abandons the form
 * afterwards we can still reconcile them from an EventBridge event, which is
 * the only other place the licence ever appears.
 *
 * The resolved row id goes back on an httpOnly cookie rather than in the
 * redirect URL: it maps to a customer's AWS account, and query strings leak
 * through referrers and access logs.
 */

function redirectToRegistration(request: Request, error?: RegistrationError) {
  const url = new URL(REGISTRATION_PATH, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  // 303 forces the browser to follow with GET after the cross-site POST.
  return NextResponse.redirect(url, 303);
}

/**
 * ResolveCustomer's failure modes are all actionable by a different party, so
 * they get distinct messages rather than one opaque error. AWS SDK v3 sometimes
 * reports the real exception only in the message, so both fields are checked —
 * the same hazard the CLI handles in utils/shared/errors.ts.
 */
function classifyResolveError(error: unknown): RegistrationError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const matches = (needle: string) =>
    name.includes(needle) || message.includes(needle);

  if (matches("ExpiredToken")) {
    return "expired_token";
  }
  if (matches("InvalidToken")) {
    return "invalid_token";
  }
  if (matches("DisabledApi")) {
    return "listing_unavailable";
  }
  if (matches("Throttling")) {
    return "try_again";
  }
  return "resolve_failed";
}

export async function POST(request: Request) {
  let token: string | null = null;
  let offerType: string | null = null;

  try {
    const form = await request.formData();
    token = form.get("x-amzn-marketplace-token")?.toString() ?? null;
    offerType = form.get("x-amzn-marketplace-offer-type")?.toString() ?? null;
  } catch (error) {
    logger.warn(
      serializeError(error),
      "AWS Marketplace registration POST had an unreadable body"
    );
    return redirectToRegistration(request, "invalid_request");
  }

  if (!token) {
    logger.warn("AWS Marketplace registration POST arrived without a token");
    return redirectToRegistration(request, "missing_token");
  }

  const client = new MarketplaceMeteringClient({ region: MARKETPLACE_REGION });

  let resolved: ResolveCustomerCommandOutput;
  try {
    resolved = await client.send(
      new ResolveCustomerCommand({ RegistrationToken: token })
    );
  } catch (error) {
    const reason = classifyResolveError(error);
    if (reason === "resolve_failed" || reason === "listing_unavailable") {
      logger.error(
        serializeError(error),
        "ResolveCustomer failed for an AWS Marketplace registration"
      );
    } else {
      logger.warn({ reason }, "ResolveCustomer rejected a registration token");
    }
    return redirectToRegistration(request, reason);
  }

  const {
    LicenseArn: licenseArn,
    CustomerAWSAccountId: customerAwsAccountId,
    ProductCode: productCode,
    CustomerIdentifier: customerIdentifier,
  } = resolved;

  // licenseArn is the Concurrent Agreements identity key. Without it two
  // agreements on one AWS account are indistinguishable, so refuse rather than
  // write a row that can never be reconciled.
  if (!(licenseArn && customerAwsAccountId && productCode)) {
    logger.error(
      {
        hasLicenseArn: Boolean(licenseArn),
        hasAccountId: Boolean(customerAwsAccountId),
        hasProductCode: Boolean(productCode),
      },
      "ResolveCustomer returned an incomplete identity"
    );
    return redirectToRegistration(request, "resolve_incomplete");
  }

  // Re-registration is normal — buyers revisit "Set up your account" from the
  // Marketplace console. Keyed on licenseArn so a repeat visit updates the same
  // agreement rather than creating a duplicate.
  const [row] = await db
    .insert(awsMarketplaceSubscription)
    .values({
      licenseArn,
      customerAwsAccountId,
      productCode,
      customerIdentifier: customerIdentifier ?? null,
      offerType,
    })
    .onConflictDoUpdate({
      target: awsMarketplaceSubscription.licenseArn,
      set: {
        customerAwsAccountId,
        productCode,
        customerIdentifier: customerIdentifier ?? null,
        offerType,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: awsMarketplaceSubscription.id });

  if (!row) {
    logger.error(
      { licenseArn },
      "Failed to persist a resolved AWS Marketplace subscription"
    );
    return redirectToRegistration(request, "persist_failed");
  }

  logger.info(
    { licenseArn, productCode, offerType },
    "Resolved an AWS Marketplace subscription"
  );

  const response = redirectToRegistration(request);
  response.cookies.set(MARKETPLACE_SESSION_COOKIE, row.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // An hour to finish the form; they can always come back.
  });
  return response;
}

/**
 * AWS only ever POSTs here, but buyers bookmark the URL and return with a GET.
 * Send them to the form rather than a 405.
 */
export function GET(request: Request) {
  return redirectToRegistration(request);
}
