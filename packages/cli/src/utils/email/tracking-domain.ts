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

/**
 * True for the BadRequestException SES raises when the redirect domain's parent
 * identity is not verified yet. Callers treat it as "apply later", not failure.
 */
export function isTrackingDomainNotReady(error: unknown): boolean {
  const e = error as { name?: string; message?: string };
  return e?.name === "BadRequestException";
}

export async function putTrackingDomain(
  sesv2: SESv2Client,
  configSetName: string,
  trackingDomain: string
): Promise<void> {
  await sesv2.send(
    new PutConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
      CustomRedirectDomain: trackingDomain,
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
