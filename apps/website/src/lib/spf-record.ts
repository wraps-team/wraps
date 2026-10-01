export type SpfProvider = {
  name: string;
  mechanism: string;
  lookups: number;
  logo: string;
};

export type SpfQualifier = "~all" | "-all" | "?all";

export type SpfQualifierInfo = {
  label: string;
  description: string;
  recommended?: boolean;
};

export type SpfRecordInput = {
  /** Keys into SPF_PROVIDERS; unknown keys are ignored. */
  providers?: string[];
  /** Bare IPv4/IPv6 addresses, emitted as ip4:/ip6:. */
  ips?: string[];
  /** Bare domains, emitted as include:. */
  includes?: string[];
  /** Defaults to "~all". */
  qualifier?: SpfQualifier;
};

export type SpfRecordResult = {
  record: string;
  lookups: number;
  limit: number;
  withinLimit: boolean;
  warnings: string[];
  unknownProviders: string[];
};

export const SPF_LOOKUP_LIMIT = 10;
export const DEFAULT_SPF_QUALIFIER: SpfQualifier = "~all";

// The library has no DNS access, so a custom include is assumed to cost 2.
const ASSUMED_CUSTOM_INCLUDE_LOOKUPS = 2;

// Provider data with verified SPF mechanisms and lookup counts
// All mechanisms verified via DNS lookup on 2026-01-16
export const SPF_PROVIDERS: Record<string, SpfProvider> = {
  // Email providers - verified
  google: {
    name: "Google Workspace",
    mechanism: "include:_spf.google.com",
    lookups: 1, // Only contains IP ranges
    logo: "google.png",
  },
  microsoft: {
    name: "Microsoft 365",
    mechanism: "include:spf.protection.outlook.com",
    lookups: 1, // Only contains IP ranges
    logo: "microsoft.png",
  },
  // Transactional - verified
  ses: {
    name: "AWS SES",
    mechanism: "include:amazonses.com",
    lookups: 1, // Only contains IP ranges
    logo: "aws.png",
  },
  resend: {
    name: "Resend",
    mechanism: "include:send.resend.com",
    lookups: 2, // Includes amazonses.com
    logo: "resend.png",
  },
  sendgrid: {
    name: "SendGrid",
    mechanism: "include:sendgrid.net",
    lookups: 2, // Includes ab.sendgrid.net
    logo: "sendgrid.png",
  },
  postmark: {
    name: "Postmark",
    mechanism: "include:spf.mtasv.net",
    lookups: 1, // Only contains IP ranges
    logo: "postmark.png",
  },
  mailchimp: {
    name: "Mailchimp",
    mechanism: "include:servers.mcsv.net",
    lookups: 1, // Only contains IP ranges
    logo: "mailchimp.png",
  },
  mailgun: {
    name: "Mailgun",
    mechanism: "include:mailgun.org",
    lookups: 5, // Complex: includes _spf.mailgun.org, _spf.eu.mailgun.org, then _spf1/_spf2
    logo: "mailgun.png",
  },
  // Marketing/CRM - verified
  hubspot: {
    name: "HubSpot",
    mechanism: "include:hubspotemail.net",
    lookups: 1, // Only contains IP ranges
    logo: "hubspot.png",
  },
  drip: {
    name: "Drip",
    mechanism: "include:stspg-customer.com",
    lookups: 1, // Only contains IP ranges
    logo: "drip.png",
  },
  activecampaign: {
    name: "ActiveCampaign",
    mechanism: "include:emsd1.com",
    lookups: 1, // Only contains IP ranges
    logo: "activecampaign.png",
  },
  constantcontact: {
    name: "Constant Contact",
    mechanism: "include:spf.constantcontact.com",
    lookups: 1, // Only contains IP ranges
    logo: "constantcontact.png",
  },
  convertkit: {
    name: "ConvertKit",
    mechanism: "include:convertkit.com",
    lookups: 3, // Includes _spf.google.com + hubspotemail.net
    logo: "convertkit.png",
  },
  customerio: {
    name: "Customer.io",
    mechanism: "include:customeriomail.com",
    lookups: 3, // Includes sendgrid.net
    logo: "customerio.png",
  },
  klaviyo: {
    name: "Klaviyo",
    mechanism: "include:send.klaviyo.com",
    lookups: 3, // CNAMEs to sendgrid.net
    logo: "klaviyo.png",
  },
  // Business tools - verified
  shopify: {
    name: "Shopify",
    mechanism: "include:shops.shopify.com",
    lookups: 1, // Only contains ~all (pass-through)
    logo: "shopify.png",
  },
  intercom: {
    name: "Intercom",
    mechanism: "include:intercom-mail.com",
    lookups: 1, // Only contains IP ranges
    logo: "intercom.png",
  },
  salesforce: {
    name: "Salesforce",
    mechanism: "include:_spf.salesforce.com",
    lookups: 2, // Uses exists: mechanism
    logo: "salesforce.png",
  },
  zendesk: {
    name: "Zendesk",
    mechanism: "include:mail.zendesk.com",
    lookups: 1, // Only contains IP ranges
    logo: "zendesk.png",
  },
  freshdesk: {
    name: "Freshdesk",
    mechanism: "include:email.freshdesk.com",
    lookups: 7, // Includes sendgrid.net (2) + 4 freshemail.io subdomains
    logo: "freshdesk.png",
  },
  zoho: {
    name: "Zoho",
    mechanism: "include:zoho.com",
    lookups: 4, // Includes spf.zoho.com + zcsend.net + spf.zohomail.com (all IPs)
    logo: "zoho.png",
  },
  stripe: {
    name: "Stripe",
    mechanism: "include:spf1.stripe.com",
    lookups: 4, // Includes _spf.google.com, amazonses.com, mail.zendesk.com
    logo: "stripe.png",
  },
};

// Qualifier options
export const SPF_QUALIFIERS: Record<SpfQualifier, SpfQualifierInfo> = {
  "~all": {
    label: "Soft Fail (~all)",
    description:
      "Mark unauthorized mail and let DMARC enforce — recommended for sending domains",
    recommended: true,
  },
  "-all": {
    label: "Hard Fail (-all)",
    description:
      "Reject unauthorized mail at SMTP — best for parked domains that never send",
  },
  "?all": {
    label: "Neutral (?all)",
    description: "No assertion — testing only, not recommended",
  },
};

export function estimateSpfLookups(input: SpfRecordInput): number {
  const providerLookups = (input.providers ?? []).reduce(
    (sum, key) => sum + (SPF_PROVIDERS[key]?.lookups ?? 0),
    0
  );
  const customLookups =
    (input.includes ?? []).length * ASSUMED_CUSTOM_INCLUDE_LOOKUPS;
  return providerLookups + customLookups;
}

export function buildSpfRecord(input: SpfRecordInput): SpfRecordResult {
  const qualifier = input.qualifier ?? DEFAULT_SPF_QUALIFIER;
  const parts = ["v=spf1"];

  // IPs first: they don't count toward lookups.
  for (const ip of input.ips ?? []) {
    parts.push(ip.includes(":") ? `ip6:${ip}` : `ip4:${ip}`);
  }

  const unknownProviders: string[] = [];
  for (const key of input.providers ?? []) {
    const provider = SPF_PROVIDERS[key];
    if (provider) {
      parts.push(provider.mechanism);
    } else {
      unknownProviders.push(key);
    }
  }

  for (const domain of input.includes ?? []) {
    parts.push(`include:${domain}`);
  }

  parts.push(qualifier);

  const lookups = estimateSpfLookups(input);
  const warnings: string[] = [];
  if (lookups > SPF_LOOKUP_LIMIT) {
    warnings.push(
      `Exceeds the 10 DNS lookup limit (${lookups}). Receivers return a permerror and SPF stops evaluating.`
    );
  } else if (lookups >= 8) {
    warnings.push(`Close to the 10 DNS lookup limit (${lookups} of 10).`);
  }
  if (unknownProviders.length > 0) {
    warnings.push(
      `Unknown provider keys ignored: ${unknownProviders.join(", ")}.`
    );
  }
  if (qualifier === "-all") {
    warnings.push(
      "'-all' rejects unauthorized mail outright. Use '~all' on a sending domain and let DMARC enforce."
    );
  }
  if (qualifier === "?all") {
    warnings.push(
      "'?all' asserts nothing and offers no protection. Use it for testing only."
    );
  }

  return {
    record: parts.join(" "),
    lookups,
    limit: SPF_LOOKUP_LIMIT,
    withinLimit: lookups <= SPF_LOOKUP_LIMIT,
    warnings,
    unknownProviders,
  };
}
