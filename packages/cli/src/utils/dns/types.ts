/**
 * DNS Provider types for CLI
 */

export type { DNSConfig, DNSProvider, DNSRecord } from "@wraps/core";

/**
 * Common DNS record data for email authentication
 */
export type EmailDNSRecordData = {
  domain: string;
  dkimTokens: string[];
  mailFromDomain?: string;
  customTrackingDomain?: string;
  /** CNAME target for `customTrackingDomain`. Defaults to `r.<region>.awstrack.me` when omitted — set this to a CloudFront distribution domain for HTTPS tracking. */
  trackingCnameTarget?: string;
  region: string;
};

/**
 * Result of DNS record creation
 */
export type DNSCreationResult = {
  success: boolean;
  recordsCreated: number;
  errors?: string[];
};

/**
 * DNS provider interface
 */
export type DNSProviderClient = {
  /**
   * Create all email DNS records
   */
  createEmailRecords(data: EmailDNSRecordData): Promise<DNSCreationResult>;

  /**
   * Delete all email DNS records
   */
  deleteEmailRecords(data: EmailDNSRecordData): Promise<DNSCreationResult>;

  /**
   * Verify that records exist and are correct
   */
  verifyRecords(data: EmailDNSRecordData): Promise<{
    verified: boolean;
    missing: string[];
    incorrect: string[];
  }>;
};
