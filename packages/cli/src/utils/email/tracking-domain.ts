import {
  DeleteConfigurationSetTrackingOptionsCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  PutConfigurationSetTrackingOptionsCommand,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";

export const TRACKING_DOMAIN_NONE = "none";

/** The default suggestion: `track.<domain>`. */
export function defaultTrackingDomain(domain: string): string {
  return `track.${domain}`;
}

/**
 * SES only accepts a redirect domain that is a verified identity or a subdomain
 * of one. Requiring it to sit under the sending domain keeps every additional
 * domain self-contained and keeps `domains add` able to create the CNAME in the
 * same DNS zone as the DKIM records.
 */
export function validateTrackingDomain(
  value: string,
  sendingDomain: string
): string | undefined {
  const v = value.trim().toLowerCase();
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)
  ) {
    return "Enter a hostname like track.example.com";
  }
  if (!v.endsWith(`.${sendingDomain.toLowerCase()}`)) {
    return `Must be a subdomain of ${sendingDomain}`;
  }
  return;
}

// Any of SES's phrasings around verification ("is not verified", "must be a
// verified identity", "verification pending"). Deliberately does NOT match
// "configuration set … does not exist", which is a real failure to surface.
const NOT_VERIFIED_MESSAGE = /verif/i;

/**
 * True for the BadRequestException SES raises when the redirect domain's parent
 * identity is not verified yet. Callers treat it as "apply later", not failure.
 *
 * Narrowed on the message, not just the exception name: SES answers a great
 * many things with BadRequestException, and a bare name match would report a
 * wrong configuration-set name as "will apply once the domain verifies" — a
 * deferral that never comes.
 */
export function isTrackingDomainNotReady(error: unknown): boolean {
  const e = error as { name?: string; message?: string };
  if (e?.name !== "BadRequestException") {
    return false;
  }
  return NOT_VERIFIED_MESSAGE.test(e.message ?? "");
}

/**
 * SES treats an omitted `HttpsPolicy` as `OPTIONAL`, which wraps click links
 * in the link's original protocol. Every link in a modern email is
 * `https://`, so an omitted policy on a tracking domain fronted by nothing
 * but the bare SES endpoint (no certificate for that hostname) makes those
 * links resolve against a certificate that does not cover them. The policy
 * is required here so no call site can produce that state by omission.
 */
export async function putTrackingDomain(
  sesv2: SESv2Client,
  configSetName: string,
  trackingDomain: string,
  httpsPolicy: "REQUIRE" | "OPTIONAL"
): Promise<void> {
  await sesv2.send(
    new PutConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
      CustomRedirectDomain: trackingDomain,
      HttpsPolicy: httpsPolicy,
    })
  );
}

/**
 * The only correct HttpsPolicy for a tracking domain is a function of whether
 * a CloudFront distribution is actually serving it. REQUIRE without a
 * distribution makes every tracking link fail TLS; OPTIONAL with one silently
 * downgrades opens to HTTP and leaves click links resolving against a
 * certificate that does not cover the domain.
 */
export function trackingHttpsPolicy(
  trackingHttps: { status?: string } | undefined
): "REQUIRE" | "OPTIONAL" {
  return trackingHttps?.status === "active" ? "REQUIRE" : "OPTIONAL";
}

/**
 * What HTTP-only tracking costs the recipient, in one sentence. Shared by
 * every place that reports HTTPS provisioning did not (yet) succeed, so the
 * wording cannot drift between them.
 */
export const HTTP_TRACKING_CONSEQUENCE =
  "Until then, https:// links in your emails will show recipients a certificate warning when clicked.";

/** SESv2 has no delete for tracking options; the v1 API does. */
export async function clearTrackingDomain(
  region: string,
  configSetName: string
): Promise<void> {
  const ses = new SESClient({ region });
  await ses.send(
    new DeleteConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
    })
  );
}
