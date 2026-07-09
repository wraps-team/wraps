/**
 * Cloudflare DNS provider for CLI
 */

import type {
  DNSCreationResult,
  DNSProviderClient,
  EmailDNSRecordData,
} from "./types.js";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

type CloudflareRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority?: number;
  proxied: boolean;
};

type CloudflareResponse<T> = {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
};

/**
 * Cloudflare DNS provider client
 */
export class CloudflareDNSClient implements DNSProviderClient {
  private readonly zoneId: string;
  private readonly apiToken: string;

  constructor(zoneId: string, apiToken: string) {
    this.zoneId = zoneId;
    this.apiToken = apiToken;
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: unknown
  ): Promise<CloudflareResponse<T>> {
    const response = await fetch(
      `${CLOUDFLARE_API_BASE}/zones/${this.zoneId}${endpoint}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    return response.json() as Promise<CloudflareResponse<T>>;
  }

  private async createRecord(
    name: string,
    type: string,
    content: string,
    priority?: number
  ): Promise<boolean> {
    // Cloudflare requires TXT record content to be wrapped in double quotes
    const recordContent = type === "TXT" ? `"${content}"` : content;

    const body: Record<string, unknown> = {
      name,
      type,
      content: recordContent,
      ttl: 1800,
      proxied: false, // Must not be proxied for email records
    };

    if (priority !== undefined) {
      body.priority = priority;
    }

    const result = await this.request<CloudflareRecord>(
      "/dns_records",
      "POST",
      body
    );
    return result.success;
  }

  private async findRecord(
    name: string,
    type: string
  ): Promise<CloudflareRecord | null> {
    const result = await this.request<CloudflareRecord[]>(
      `/dns_records?name=${encodeURIComponent(name)}&type=${type}`
    );

    if (result.success && result.result.length > 0) {
      return result.result[0];
    }
    return null;
  }

  private async deleteRecord(recordId: string): Promise<boolean> {
    const result = await this.request<{ id: string }>(
      `/dns_records/${recordId}`,
      "DELETE"
    );
    return result.success;
  }

  /**
   * Create arbitrary DNS records from a list
   */
  async createRecords(
    records: Array<{
      name: string;
      type: string;
      value: string;
      priority?: number;
    }>
  ): Promise<DNSCreationResult> {
    const errors: string[] = [];
    let recordsCreated = 0;

    for (const record of records) {
      const success = await this.createRecord(
        record.name,
        record.type,
        record.value,
        record.priority
      );
      if (success) {
        recordsCreated++;
      } else {
        errors.push(`Failed to create ${record.type} record: ${record.name}`);
      }
    }

    return {
      success: errors.length === 0,
      recordsCreated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async createEmailRecords(
    data: EmailDNSRecordData
  ): Promise<DNSCreationResult> {
    const { domain, dkimTokens, mailFromDomain, customTrackingDomain, region } =
      data;
    const errors: string[] = [];
    let recordsCreated = 0;

    try {
      // DKIM CNAME records (3 records)
      for (const token of dkimTokens) {
        const name = `${token}._domainkey.${domain}`;
        const success = await this.createRecord(
          name,
          "CNAME",
          `${token}.dkim.amazonses.com`
        );
        if (success) {
          recordsCreated++;
        } else {
          errors.push(`Failed to create DKIM record: ${name}`);
        }
      }

      // SPF TXT record for the domain
      const spfSuccess = await this.createRecord(
        domain,
        "TXT",
        "v=spf1 include:amazonses.com ~all"
      );
      if (spfSuccess) {
        recordsCreated++;
      } else {
        errors.push(`Failed to create SPF record for ${domain}`);
      }

      // DMARC TXT record
      const dmarcSuccess = await this.createRecord(
        `_dmarc.${domain}`,
        "TXT",
        `v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${mailFromDomain || domain}`
      );
      if (dmarcSuccess) {
        recordsCreated++;
      } else {
        errors.push(`Failed to create DMARC record for ${domain}`);
      }

      // Custom tracking domain CNAME (if configured)
      if (customTrackingDomain) {
        const trackingSuccess = await this.createRecord(
          customTrackingDomain,
          "CNAME",
          `r.${region}.awstrack.me`
        );
        if (trackingSuccess) {
          recordsCreated++;
        } else {
          errors.push(
            `Failed to create tracking CNAME for ${customTrackingDomain}`
          );
        }
      }

      // MAIL FROM domain records (if configured)
      if (mailFromDomain) {
        // MX record for bounce handling
        const mxSuccess = await this.createRecord(
          mailFromDomain,
          "MX",
          `feedback-smtp.${region}.amazonses.com`,
          10
        );
        if (mxSuccess) {
          recordsCreated++;
        } else {
          errors.push(`Failed to create MX record for ${mailFromDomain}`);
        }

        // SPF TXT record for MAIL FROM subdomain
        const mailFromSpfSuccess = await this.createRecord(
          mailFromDomain,
          "TXT",
          "v=spf1 include:amazonses.com ~all"
        );
        if (mailFromSpfSuccess) {
          recordsCreated++;
        } else {
          errors.push(`Failed to create SPF record for ${mailFromDomain}`);
        }
      }

      return {
        success: errors.length === 0,
        recordsCreated,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        recordsCreated,
        errors: [
          ...errors,
          error instanceof Error ? error.message : "Unknown error",
        ],
      };
    }
  }

  async deleteEmailRecords(
    data: EmailDNSRecordData
  ): Promise<DNSCreationResult> {
    const { domain, dkimTokens, mailFromDomain } = data;
    const errors: string[] = [];
    let recordsCreated = 0; // We're actually counting deletions here

    try {
      // Delete DKIM CNAME records
      for (const token of dkimTokens) {
        const name = `${token}._domainkey.${domain}`;
        const record = await this.findRecord(name, "CNAME");
        if (record) {
          const success = await this.deleteRecord(record.id);
          if (success) {
            recordsCreated++;
          } else {
            errors.push(`Failed to delete DKIM record: ${name}`);
          }
        }
      }

      // Delete DMARC record
      const dmarcRecord = await this.findRecord(`_dmarc.${domain}`, "TXT");
      if (dmarcRecord) {
        const success = await this.deleteRecord(dmarcRecord.id);
        if (success) {
          recordsCreated++;
        } else {
          errors.push("Failed to delete DMARC record");
        }
      }

      // Delete MAIL FROM domain records
      if (mailFromDomain) {
        const mxRecord = await this.findRecord(mailFromDomain, "MX");
        if (mxRecord) {
          const success = await this.deleteRecord(mxRecord.id);
          if (success) {
            recordsCreated++;
          } else {
            errors.push(`Failed to delete MX record for ${mailFromDomain}`);
          }
        }

        const spfRecord = await this.findRecord(mailFromDomain, "TXT");
        if (spfRecord) {
          const success = await this.deleteRecord(spfRecord.id);
          if (success) {
            recordsCreated++;
          } else {
            errors.push(`Failed to delete SPF record for ${mailFromDomain}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        recordsCreated,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        recordsCreated,
        errors: [
          ...errors,
          error instanceof Error ? error.message : "Unknown error",
        ],
      };
    }
  }

  /**
   * Get the zone name (domain) for this zone ID
   */
  private async getZoneName(): Promise<string | null> {
    try {
      const response = await fetch(
        `${CLOUDFLARE_API_BASE}/zones/${this.zoneId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = (await response.json()) as CloudflareResponse<{
        name: string;
      }>;
      return data.success ? data.result.name : null;
    } catch {
      return null;
    }
  }

  /**
   * Get all CAA records for the zone
   */
  async getCAARecords(): Promise<
    Array<{ flags: number; tag: string; value: string }>
  > {
    const zoneName = await this.getZoneName();
    if (!zoneName) {
      return [];
    }

    const result = await this.request<CloudflareRecord[]>(
      "/dns_records?type=CAA"
    );

    if (!(result.success && result.result)) {
      return [];
    }

    // Cloudflare CAA content format: "0 issue \"letsencrypt.org\""
    return result.result
      .filter((r) => r.type === "CAA")
      .map((r) => {
        const match = r.content.match(/^(\d+)\s+(\w+)\s+"?([^"]+)"?$/);
        if (match) {
          return {
            flags: Number.parseInt(match[1], 10),
            tag: match[2],
            value: match[3],
          };
        }
        return null;
      })
      .filter(
        (r): r is { flags: number; tag: string; value: string } => r !== null
      );
  }

  /**
   * Check if Amazon is allowed to issue certificates based on CAA records
   */
  async isAmazonCAAAllowed(): Promise<{
    allowed: boolean;
    hasCAA: boolean;
    existingCAs: string[];
  }> {
    const caaRecords = await this.getCAARecords();

    const issueRecords = caaRecords.filter(
      (r) => r.tag === "issue" || r.tag === "issuewild"
    );

    if (issueRecords.length === 0) {
      return { allowed: true, hasCAA: false, existingCAs: [] };
    }

    const existingCAs = issueRecords.map((r) => r.value);
    const amazonAllowed = existingCAs.some(
      (ca) => ca.includes("amazon.com") || ca.includes("amazontrust.com")
    );

    return { allowed: amazonAllowed, hasCAA: true, existingCAs };
  }

  /**
   * Add a CAA record to allow Amazon to issue certificates
   */
  async addAmazonCAARecord(): Promise<boolean> {
    const zoneName = await this.getZoneName();
    if (!zoneName) {
      return false;
    }

    // Cloudflare CAA records use a data object format
    const body = {
      name: zoneName,
      type: "CAA",
      data: {
        flags: 0,
        tag: "issue",
        value: "amazon.com",
      },
      ttl: 1800,
    };

    const result = await this.request<CloudflareRecord>(
      "/dns_records",
      "POST",
      body
    );

    return result.success;
  }

  async verifyRecords(data: EmailDNSRecordData): Promise<{
    verified: boolean;
    missing: string[];
    incorrect: string[];
  }> {
    const { domain, dkimTokens, mailFromDomain, region } = data;
    const missing: string[] = [];
    const incorrect: string[] = [];

    // Check DKIM records
    for (const token of dkimTokens) {
      const name = `${token}._domainkey.${domain}`;
      const expectedValue = `${token}.dkim.amazonses.com`;
      const record = await this.findRecord(name, "CNAME");

      if (!record) {
        missing.push(`DKIM: ${name}`);
      } else if (record.content !== expectedValue) {
        incorrect.push(`DKIM: ${name} (expected ${expectedValue})`);
      }
    }

    // Check SPF record
    const spfRecord = await this.findRecord(domain, "TXT");
    if (!spfRecord) {
      missing.push(`SPF: ${domain}`);
    } else if (!spfRecord.content.includes("include:amazonses.com")) {
      incorrect.push(`SPF: ${domain} (missing amazonses.com include)`);
    }

    // Check DMARC record
    const dmarcRecord = await this.findRecord(`_dmarc.${domain}`, "TXT");
    if (!dmarcRecord) {
      missing.push(`DMARC: _dmarc.${domain}`);
    }

    // Check MAIL FROM records
    if (mailFromDomain) {
      const mxRecord = await this.findRecord(mailFromDomain, "MX");
      if (!mxRecord) {
        missing.push(`MX: ${mailFromDomain}`);
      } else if (
        !mxRecord.content.includes(`feedback-smtp.${region}.amazonses.com`)
      ) {
        incorrect.push(`MX: ${mailFromDomain}`);
      }

      const mailFromSpf = await this.findRecord(mailFromDomain, "TXT");
      if (!mailFromSpf) {
        missing.push(`SPF: ${mailFromDomain}`);
      }
    }

    return {
      verified: missing.length === 0 && incorrect.length === 0,
      missing,
      incorrect,
    };
  }
}
