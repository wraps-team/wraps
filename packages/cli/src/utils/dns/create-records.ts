/**
 * Unified DNS record creation for multiple providers
 */

import {
  ChangeResourceRecordSetsCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";
import pc from "picocolors";
import {
  createSelectedDNSRecords,
  type ProposedDNSRecord,
} from "../route53.js";
import { CloudflareDNSClient } from "./cloudflare.js";
import type { DNSCredentials } from "./credentials.js";
import type { DNSCreationResult, EmailDNSRecordData } from "./types.js";
import { VercelDNSClient } from "./vercel.js";

/**
 * DNS record category type
 */
export type DNSRecordCategory =
  | "dkim"
  | "spf"
  | "dmarc"
  | "tracking"
  | "mailfrom_mx"
  | "mailfrom_spf"
  | "inbound_mx"
  | "inbound_spf";

/**
 * DNS record to be created
 */
export type DNSRecordInfo = {
  name: string;
  type: "CNAME" | "TXT" | "MX";
  value: string;
  priority?: number;
  category: DNSRecordCategory;
};

/**
 * Human-readable descriptions for each DNS record category
 */
export const DNS_RECORD_DESCRIPTIONS: Record<
  DNSRecordCategory,
  { label: string; purpose: string; impact: string }
> = {
  dkim: {
    label: "DKIM (3 CNAMEs)",
    purpose: "Cryptographic signatures proving emails are from your domain",
    impact: "Required — without DKIM, emails will likely land in spam",
  },
  spf: {
    label: "SPF (TXT)",
    purpose: "Authorizes Amazon SES to send email on behalf of your domain",
    impact: "Required — prevents spoofing and improves deliverability",
  },
  dmarc: {
    label: "DMARC (TXT)",
    purpose: "Policy for how receivers handle emails failing DKIM/SPF checks",
    impact: "Recommended — skip if you already have a DMARC policy",
  },
  tracking: {
    label: "Tracking (CNAME)",
    purpose: "Routes open/click tracking through your domain instead of AWS",
    impact: "Optional — improves brand consistency in tracked links",
  },
  mailfrom_mx: {
    label: "MAIL FROM MX",
    purpose: "Routes bounce notifications to SES for proper bounce handling",
    impact: "Recommended — required for full DMARC alignment",
  },
  mailfrom_spf: {
    label: "MAIL FROM SPF (TXT)",
    purpose: "Authorizes SES to send from the MAIL FROM subdomain",
    impact: "Required when using custom MAIL FROM domain",
  },
  inbound_mx: {
    label: "Inbound MX",
    purpose: "Routes incoming email to AWS SES for processing",
    impact: "Required for inbound email receiving",
  },
  inbound_spf: {
    label: "Inbound SPF (TXT)",
    purpose: "Authorizes SES for the inbound receiving domain",
    impact: "Required for inbound email receiving",
  },
};

/**
 * Build the list of DNS records needed for email authentication
 */
export function buildEmailDNSRecords(
  data: EmailDNSRecordData
): DNSRecordInfo[] {
  const { domain, dkimTokens, mailFromDomain, customTrackingDomain, region } =
    data;
  const records: DNSRecordInfo[] = [];

  // DKIM CNAME records (3 records)
  for (const token of dkimTokens) {
    records.push({
      name: `${token}._domainkey.${domain}`,
      type: "CNAME",
      value: `${token}.dkim.amazonses.com`,
      category: "dkim",
    });
  }

  // SPF TXT record for the domain
  records.push({
    name: domain,
    type: "TXT",
    value: "v=spf1 include:amazonses.com ~all",
    category: "spf",
  });

  // DMARC TXT record
  const dmarcRuaDomain = mailFromDomain || domain;
  records.push({
    name: `_dmarc.${domain}`,
    type: "TXT",
    value: `v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${dmarcRuaDomain}`,
    category: "dmarc",
  });

  // Custom tracking domain CNAME (if configured)
  if (customTrackingDomain) {
    records.push({
      name: customTrackingDomain,
      type: "CNAME",
      value: `r.${region}.awstrack.me`,
      category: "tracking",
    });
  }

  // MAIL FROM domain records (if configured)
  if (mailFromDomain) {
    // MX record for bounce handling
    records.push({
      name: mailFromDomain,
      type: "MX",
      value: `feedback-smtp.${region}.amazonses.com`,
      priority: 10,
      category: "mailfrom_mx",
    });

    // SPF TXT record for MAIL FROM subdomain
    records.push({
      name: mailFromDomain,
      type: "TXT",
      value: "v=spf1 include:amazonses.com ~all",
      category: "mailfrom_spf",
    });
  }

  return records;
}

/**
 * Build the list of DNS records needed for inbound email receiving
 */
export function buildInboundDNSRecords(
  receivingDomain: string,
  region: string
): DNSRecordInfo[] {
  const records: DNSRecordInfo[] = [];

  // MX record to route inbound email to SES
  records.push({
    name: receivingDomain,
    type: "MX",
    value: `inbound-smtp.${region}.amazonaws.com`,
    priority: 10,
    category: "inbound_mx",
  });

  // SPF record for the receiving domain
  records.push({
    name: receivingDomain,
    type: "TXT",
    value: "v=spf1 include:amazonses.com ~all",
    category: "inbound_spf",
  });

  return records;
}

/**
 * Format DNS records for display (manual setup)
 */
export function formatDNSRecordsForDisplay(
  records: DNSRecordInfo[]
): Array<{ name: string; type: string; value: string }> {
  return records.map((r) => ({
    name: r.name,
    type: r.type,
    value: r.priority ? `${r.priority} ${r.value}` : r.value,
  }));
}

/**
 * Format all DNS records for manual setup with descriptions
 */
export function formatManualDNSInstructions(records: DNSRecordInfo[]): string {
  const categories = [...new Set(records.map((r) => r.category))];
  const lines: string[] = [];

  for (const cat of categories) {
    const catRecords = records.filter((r) => r.category === cat);
    const desc = DNS_RECORD_DESCRIPTIONS[cat];

    lines.push(pc.bold(desc.label));
    lines.push(pc.dim(desc.purpose));
    lines.push(pc.dim(desc.impact));
    lines.push("");

    for (const record of catRecords) {
      const value = record.priority
        ? `${record.priority} ${record.value}`
        : record.value;
      lines.push(`  ${pc.cyan(record.type.padEnd(6))} ${record.name}`);
      lines.push(`  ${pc.dim("→")}      ${pc.green(value)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Create DNS records using the appropriate provider
 */
export async function createDNSRecordsForProvider(
  credentials: DNSCredentials,
  data: EmailDNSRecordData,
  selectedCategories?: Set<ProposedDNSRecord["category"]>
): Promise<DNSCreationResult> {
  switch (credentials.provider) {
    case "route53": {
      // Use existing Route53 function with category selection
      const categories: Set<ProposedDNSRecord["category"]> =
        selectedCategories ||
        new Set([
          "dkim",
          "spf",
          "dmarc",
          "tracking",
          "mailfrom_mx",
          "mailfrom_spf",
          "inbound_mx",
          "inbound_spf",
        ] as ProposedDNSRecord["category"][]);

      try {
        await createSelectedDNSRecords(
          credentials.hostedZoneId,
          data.domain,
          data.dkimTokens,
          data.region,
          categories,
          data.customTrackingDomain,
          data.mailFromDomain
        );

        // Count records created based on selected categories
        let recordsCreated = 0;
        if (categories.has("dkim")) {
          recordsCreated += data.dkimTokens.length;
        }
        if (categories.has("spf")) {
          recordsCreated += 1;
        }
        if (categories.has("dmarc")) {
          recordsCreated += 1;
        }
        if (data.customTrackingDomain && categories.has("tracking")) {
          recordsCreated += 1;
        }
        if (data.mailFromDomain) {
          if (categories.has("mailfrom_mx")) {
            recordsCreated += 1;
          }
          if (categories.has("mailfrom_spf")) {
            recordsCreated += 1;
          }
        }

        return {
          success: true,
          recordsCreated,
        };
      } catch (error) {
        return {
          success: false,
          recordsCreated: 0,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }
    }

    case "vercel": {
      const client = new VercelDNSClient(
        data.domain,
        credentials.token,
        credentials.teamId
      );
      if (selectedCategories) {
        const records = buildEmailDNSRecords(data);
        const filtered = records.filter((r) =>
          selectedCategories.has(r.category)
        );
        return client.createRecords(filtered);
      }
      return client.createEmailRecords(data);
    }

    case "cloudflare": {
      const client = new CloudflareDNSClient(
        credentials.zoneId,
        credentials.token
      );
      if (selectedCategories) {
        const records = buildEmailDNSRecords(data);
        const filtered = records.filter((r) =>
          selectedCategories.has(r.category)
        );
        return client.createRecords(filtered);
      }
      return client.createEmailRecords(data);
    }

    case "manual": {
      // Manual mode - user handles DNS themselves
      // Return success with 0 records created
      return {
        success: true,
        recordsCreated: 0,
      };
    }
  }
}

/**
 * Create inbound DNS records (MX + SPF) using the appropriate provider
 * @param parentDomain - The root domain (e.g., "wraps.dev") needed for Vercel DNS zone
 */
export async function createInboundDNSRecordsForProvider(
  credentials: DNSCredentials,
  receivingDomain: string,
  region: string,
  parentDomain: string
): Promise<DNSCreationResult> {
  const records = buildInboundDNSRecords(receivingDomain, region);

  switch (credentials.provider) {
    case "route53": {
      try {
        const client = new Route53Client({ region });
        await client.send(
          new ChangeResourceRecordSetsCommand({
            HostedZoneId: credentials.hostedZoneId,
            ChangeBatch: {
              Changes: records.map((r) => ({
                Action: "UPSERT" as const,
                ResourceRecordSet: {
                  Name: r.name,
                  Type: r.type,
                  TTL: 1800,
                  ResourceRecords: [
                    {
                      Value:
                        r.type === "MX"
                          ? `${r.priority} ${r.value}`
                          : r.type === "TXT"
                            ? `"${r.value}"`
                            : r.value,
                    },
                  ],
                },
              })),
            },
          })
        );
        return { success: true, recordsCreated: records.length };
      } catch (error) {
        return {
          success: false,
          recordsCreated: 0,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }
    }

    case "cloudflare": {
      const client = new CloudflareDNSClient(
        credentials.zoneId,
        credentials.token
      );
      return client.createRecords(records);
    }

    case "vercel": {
      const client = new VercelDNSClient(
        parentDomain,
        credentials.token,
        credentials.teamId
      );
      return client.createRecords(records);
    }

    case "manual":
      return { success: true, recordsCreated: 0 };
  }
}

/**
 * Get the display name for a DNS provider
 */
export function getDNSProviderDisplayName(
  provider: DNSCredentials["provider"]
): string {
  switch (provider) {
    case "route53":
      return "AWS Route53";
    case "vercel":
      return "Vercel DNS";
    case "cloudflare":
      return "Cloudflare";
    case "manual":
      return "Manual";
  }
}

/**
 * Get the URL for creating API tokens for a provider
 */
export function getDNSProviderTokenUrl(
  provider: "vercel" | "cloudflare"
): string {
  switch (provider) {
    case "vercel":
      return "https://vercel.com/account/tokens";
    case "cloudflare":
      return "https://dash.cloudflare.com/profile/api-tokens";
  }
}
