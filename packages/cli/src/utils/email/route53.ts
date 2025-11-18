import {
  type Change,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";

/**
 * Find Route53 hosted zone for a domain
 *
 * This function searches for a hosted zone that matches the given domain.
 * It will try the exact domain first, then fall back to parent domains.
 * For example, if given "track.example.com", it will check:
 * 1. track.example.com
 * 2. example.com
 */
export async function findHostedZone(
  domain: string,
  region: string
): Promise<{ id: string; name: string } | null> {
  const client = new Route53Client({ region });

  // Try exact domain first
  try {
    const response = await client.send(
      new ListHostedZonesByNameCommand({
        DNSName: domain,
        MaxItems: 1,
      })
    );

    const zone = response.HostedZones?.[0];
    if (zone && zone.Name === `${domain}.` && zone.Id) {
      return {
        id: zone.Id.replace("/hostedzone/", ""),
        name: zone.Name,
      };
    }
  } catch (_error) {
    // Continue to try parent domains
  }

  // Try parent domains (e.g., track.example.com -> example.com)
  const parts = domain.split(".");
  if (parts.length > 2) {
    const parentDomain = parts.slice(1).join(".");
    return findHostedZone(parentDomain, region);
  }

  return null;
}

/**
 * Create DNS records in Route53
 */
export async function createDNSRecords(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string,
  customTrackingDomain?: string,
  mailFromDomain?: string,
  cloudFrontDomain?: string
): Promise<void> {
  const client = new Route53Client({ region });

  const changes: Change[] = [];

  // DKIM CNAME records
  for (const token of dkimTokens) {
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${token}._domainkey.${domain}`,
        Type: "CNAME",
        TTL: 1800,
        ResourceRecords: [{ Value: `${token}.dkim.amazonses.com` }],
      },
    });
  }

  // SPF TXT record
  changes.push({
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: domain,
      Type: "TXT",
      TTL: 1800,
      ResourceRecords: [{ Value: '"v=spf1 include:amazonses.com ~all"' }],
    },
  });

  // DMARC TXT record
  changes.push({
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: `_dmarc.${domain}`,
      Type: "TXT",
      TTL: 1800,
      ResourceRecords: [
        { Value: `"v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}"` },
      ],
    },
  });

  // Custom tracking domain CNAME (if provided)
  // This allows SES to rewrite links for open/click tracking using your custom domain
  if (customTrackingDomain) {
    // If CloudFront domain is provided, use it (HTTPS tracking)
    // Otherwise, use direct SES tracking endpoint (HTTP tracking)
    const targetDomain = cloudFrontDomain || `r.${region}.awstrack.me`;

    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: customTrackingDomain,
        Type: "CNAME",
        TTL: 1800,
        ResourceRecords: [{ Value: targetDomain }],
      },
    });
  }

  // MAIL FROM domain records (if provided)
  // These records enable DMARC alignment by using a custom subdomain for the envelope sender
  if (mailFromDomain) {
    // MX record pointing to SES feedback server
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "MX",
        TTL: 1800,
        ResourceRecords: [
          { Value: `10 feedback-smtp.${region}.amazonses.com` },
        ],
      },
    });

    // SPF record for MAIL FROM domain
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [{ Value: '"v=spf1 include:amazonses.com ~all"' }],
      },
    });
  }

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changes,
      },
    })
  );
}
