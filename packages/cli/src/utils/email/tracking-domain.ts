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

export async function putTrackingDomain(
  sesv2: SESv2Client,
  configSetName: string,
  trackingDomain: string,
  httpsPolicy?: "REQUIRE" | "OPTIONAL"
): Promise<void> {
  await sesv2.send(
    new PutConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
      CustomRedirectDomain: trackingDomain,
      ...(httpsPolicy ? { HttpsPolicy: httpsPolicy } : {}),
    })
  );
}

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
