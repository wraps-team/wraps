import * as aws from "@pulumi/aws";
import * as cloudflare from "@pulumi/cloudflare";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import type {
  CloudflareDNSConfig,
  DNSConfig,
  Route53DNSConfig,
  VercelDNSConfig,
} from "@wraps/core";

/**
 * DNS records to create for email authentication
 */
export type EmailDNSRecords = {
  domain: string;
  dkimTokens: pulumi.Output<string[]>;
  mailFromDomain?: string;
  region: pulumi.Output<string>;
};

/**
 * Create DNS records based on provider configuration
 */
export function createDNSRecords(
  name: string,
  dnsConfig: DNSConfig,
  records: EmailDNSRecords,
  tags: Record<string, string>,
  opts?: pulumi.ComponentResourceOptions
): void {
  switch (dnsConfig.provider) {
    case "route53":
      createRoute53Records(name, dnsConfig, records, tags, opts);
      break;
    case "cloudflare":
      createCloudflareRecords(name, dnsConfig, records, opts);
      break;
    case "vercel":
      createVercelRecords(name, dnsConfig, records, opts);
      break;
  }
}

/**
 * Create Route53 DNS records
 */
function createRoute53Records(
  name: string,
  config: Route53DNSConfig,
  records: EmailDNSRecords,
  _tags: Record<string, string>,
  opts?: pulumi.ComponentResourceOptions
): void {
  const { domain, dkimTokens, mailFromDomain, region } = records;

  // DKIM CNAME records (3 records)
  dkimTokens.apply((tokens) => {
    tokens.forEach((token, i) => {
      new aws.route53.Record(
        `${name}-dkim-${i + 1}`,
        {
          zoneId: config.hostedZoneId,
          name: `${token}._domainkey.${domain}`,
          type: "CNAME",
          ttl: 1800,
          records: [`${token}.dkim.amazonses.com`],
        },
        opts
      );
    });
  });

  // SPF TXT record for the domain
  new aws.route53.Record(
    `${name}-spf`,
    {
      zoneId: config.hostedZoneId,
      name: domain,
      type: "TXT",
      ttl: 1800,
      records: ["v=spf1 include:amazonses.com ~all"],
    },
    opts
  );

  // DMARC TXT record
  new aws.route53.Record(
    `${name}-dmarc`,
    {
      zoneId: config.hostedZoneId,
      name: `_dmarc.${domain}`,
      type: "TXT",
      ttl: 1800,
      records: [
        `v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${mailFromDomain || domain}`,
      ],
    },
    opts
  );

  // MAIL FROM domain records (if configured)
  if (mailFromDomain) {
    // MX record for bounce handling
    new aws.route53.Record(
      `${name}-mailfrom-mx`,
      {
        zoneId: config.hostedZoneId,
        name: mailFromDomain,
        type: "MX",
        ttl: 1800,
        records: [region.apply((r) => `10 feedback-smtp.${r}.amazonses.com`)],
      },
      opts
    );

    // SPF TXT record for MAIL FROM subdomain
    new aws.route53.Record(
      `${name}-mailfrom-spf`,
      {
        zoneId: config.hostedZoneId,
        name: mailFromDomain,
        type: "TXT",
        ttl: 1800,
        records: ["v=spf1 include:amazonses.com ~all"],
      },
      opts
    );
  }
}

/**
 * Create Cloudflare DNS records
 */
function createCloudflareRecords(
  name: string,
  config: CloudflareDNSConfig,
  records: EmailDNSRecords,
  opts?: pulumi.ComponentResourceOptions
): void {
  const { domain, dkimTokens, mailFromDomain, region } = records;

  // Create a Cloudflare provider with the API token
  const cfProvider = new cloudflare.Provider(`${name}-cf-provider`, {
    apiToken: config.apiToken,
  });

  const cfOpts = { ...opts, provider: cfProvider };

  // DKIM CNAME records (3 records)
  dkimTokens.apply((tokens) => {
    tokens.forEach((token, i) => {
      new cloudflare.Record(
        `${name}-dkim-${i + 1}`,
        {
          zoneId: config.zoneId,
          name: `${token}._domainkey.${domain}`,
          type: "CNAME",
          content: `${token}.dkim.amazonses.com`,
          ttl: 1800,
          proxied: false, // Must not be proxied for DKIM
        },
        cfOpts
      );
    });
  });

  // SPF TXT record for the domain
  new cloudflare.Record(
    `${name}-spf`,
    {
      zoneId: config.zoneId,
      name: domain,
      type: "TXT",
      content: "v=spf1 include:amazonses.com ~all",
      ttl: 1800,
    },
    cfOpts
  );

  // DMARC TXT record
  new cloudflare.Record(
    `${name}-dmarc`,
    {
      zoneId: config.zoneId,
      name: `_dmarc.${domain}`,
      type: "TXT",
      content: `v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${mailFromDomain || domain}`,
      ttl: 1800,
    },
    cfOpts
  );

  // MAIL FROM domain records (if configured)
  if (mailFromDomain) {
    // MX record for bounce handling
    new cloudflare.Record(
      `${name}-mailfrom-mx`,
      {
        zoneId: config.zoneId,
        name: mailFromDomain,
        type: "MX",
        content: region.apply((r) => `feedback-smtp.${r}.amazonses.com`),
        priority: 10,
        ttl: 1800,
      },
      cfOpts
    );

    // SPF TXT record for MAIL FROM subdomain
    new cloudflare.Record(
      `${name}-mailfrom-spf`,
      {
        zoneId: config.zoneId,
        name: mailFromDomain,
        type: "TXT",
        content: "v=spf1 include:amazonses.com ~all",
        ttl: 1800,
      },
      cfOpts
    );
  }
}

/**
 * Create Vercel DNS records using the Vercel API via command provider
 * Vercel doesn't have a native Pulumi provider, so we use REST API calls
 */
function createVercelRecords(
  name: string,
  config: VercelDNSConfig,
  records: EmailDNSRecords,
  opts?: pulumi.ComponentResourceOptions
): void {
  const { domain, dkimTokens, mailFromDomain, region } = records;
  const teamParam = config.teamId ? `&teamId=${config.teamId}` : "";

  // Helper to create a Vercel DNS record via API
  const createVercelRecord = (
    recordName: string,
    recordType: string,
    recordValue: pulumi.Input<string>,
    recordDomain: string,
    priority?: number
  ) => {
    const body = pulumi.output(recordValue).apply((value) => {
      const payload: Record<string, unknown> = {
        name: recordDomain.replace(`.${domain}`, "") || "@",
        type: recordType,
        value,
        ttl: 1800,
      };
      if (priority !== undefined) {
        payload.mxPriority = priority;
      }
      return JSON.stringify(payload);
    });

    new command.local.Command(
      recordName,
      {
        create: pulumi.interpolate`curl -s -X POST "https://api.vercel.com/v2/domains/${domain}/records?${teamParam}" \
          -H "Authorization: Bearer ${config.apiToken}" \
          -H "Content-Type: application/json" \
          -d '${body}'`,
        delete: pulumi.interpolate`curl -s -X DELETE "https://api.vercel.com/v2/domains/${domain}/records/${recordDomain}?${teamParam}" \
          -H "Authorization: Bearer ${config.apiToken}"`,
      },
      opts
    );
  };

  // DKIM CNAME records (3 records)
  dkimTokens.apply((tokens) => {
    tokens.forEach((token, i) => {
      createVercelRecord(
        `${name}-dkim-${i + 1}`,
        "CNAME",
        `${token}.dkim.amazonses.com`,
        `${token}._domainkey.${domain}`
      );
    });
  });

  // SPF TXT record for the domain
  createVercelRecord(
    `${name}-spf`,
    "TXT",
    "v=spf1 include:amazonses.com ~all",
    domain
  );

  // DMARC TXT record
  createVercelRecord(
    `${name}-dmarc`,
    "TXT",
    `v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${mailFromDomain || domain}`,
    `_dmarc.${domain}`
  );

  // MAIL FROM domain records (if configured)
  if (mailFromDomain) {
    // MX record for bounce handling
    createVercelRecord(
      `${name}-mailfrom-mx`,
      "MX",
      region.apply((r) => `feedback-smtp.${r}.amazonses.com`),
      mailFromDomain,
      10
    );

    // SPF TXT record for MAIL FROM subdomain
    createVercelRecord(
      `${name}-mailfrom-spf`,
      "TXT",
      "v=spf1 include:amazonses.com ~all",
      mailFromDomain
    );
  }
}
