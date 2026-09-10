import type { SendingDomain } from "@/actions/domains";

/**
 * Derives the DNS records an operator needs to publish for one sending
 * identity — DKIM CNAMEs plus, when a MAIL FROM domain is configured, its MX
 * and TXT (SPF) records. Pure: no AWS calls, no side effects, so it is
 * testable without mocking anything.
 *
 * The MX/TXT values are taken verbatim from the CloudFormation template's own
 * `MailFromDNS` output (cloudformation/wraps-email-infrastructure.yaml). No
 * SPF/DMARC record is ever emitted for the root domain — those are org
 * policy decisions, not per-identity facts.
 */
export function dnsRecordsFor(domain: SendingDomain): Array<{
  kind: "dkim" | "mailfrom_mx" | "mailfrom_spf";
  type: "CNAME" | "MX" | "TXT";
  name: string;
  value: string;
  purpose: string;
}> {
  const records: Array<{
    kind: "dkim" | "mailfrom_mx" | "mailfrom_spf";
    type: "CNAME" | "MX" | "TXT";
    name: string;
    value: string;
    purpose: string;
  }> = [];

  if (domain.dkim?.tokens.length) {
    for (const token of domain.dkim.tokens) {
      records.push({
        kind: "dkim",
        type: "CNAME",
        name: `${token}._domainkey.${domain.identity}`,
        value: `${token}.dkim.amazonses.com`,
        purpose: "DKIM signing",
      });
    }
  }

  if (domain.mailFromDomain) {
    records.push({
      kind: "mailfrom_mx",
      type: "MX",
      name: domain.mailFromDomain.domain,
      value: `10 feedback-smtp.${domain.region}.amazonses.com`,
      purpose: "MAIL FROM bounce handling",
    });
    records.push({
      kind: "mailfrom_spf",
      type: "TXT",
      name: domain.mailFromDomain.domain,
      value: "v=spf1 include:amazonses.com ~all",
      purpose: "MAIL FROM SPF alignment",
    });
  }

  return records;
}
