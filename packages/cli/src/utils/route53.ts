import {
  type Change,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";

/**
 * Find Route53 hosted zone for a domain
 */
export async function findHostedZone(
  domain: string,
  region: string
): Promise<{ id: string; name: string } | null> {
  const client = new Route53Client({ region });

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

    return null;
  } catch (_error) {
    return null;
  }
}

/**
 * Create DNS records in Route53
 */
export async function createDNSRecords(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string
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

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changes,
      },
    })
  );
}
