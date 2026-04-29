/**
 * Email Check Constants
 * DKIM selectors and blacklist configurations
 */

import type { BlacklistConfig } from "./types.js";

// =============================================================================
// Quick Mode Configurations
// =============================================================================

/**
 * Top 25 DKIM selectors for quick mode
 * These are the most commonly used selectors across major providers
 */
export const QUICK_DKIM_SELECTORS = [
  // Top providers (most likely to find)
  "google",
  "selector1",
  "selector2",
  "default",
  "dkim",
  "mail",
  "email",
  "s1",
  "s2",
  "k1",
  // ESPs
  "sendgrid",
  "amazonses",
  "mandrill",
  "mailgun",
  "postmark",
  "resend",
  "ses",
  "sg",
  "mg",
  "pm",
  // Fallbacks
  "smtp",
  "mta",
  "mx",
  "primary",
  "main",
] as const;

/**
 * Top 10 blacklists for quick mode
 * These are the most impactful and widely used blocklists
 */
export const QUICK_BLACKLISTS: BlacklistConfig[] = [
  { name: "Spamhaus ZEN", zone: "zen.spamhaus.org", priority: "critical" },
  { name: "Spamhaus DBL", zone: "dbl.spamhaus.org", priority: "critical" },
  { name: "Barracuda", zone: "b.barracudacentral.org", priority: "high" },
  { name: "SpamCop", zone: "bl.spamcop.net", priority: "high" },
  { name: "CBL", zone: "cbl.abuseat.org", priority: "high" },
  { name: "SORBS", zone: "dnsbl.sorbs.net", priority: "medium" },
  { name: "URIBL", zone: "multi.uribl.com", priority: "medium" },
  { name: "SURBL", zone: "multi.surbl.org", priority: "medium" },
  { name: "Mailspike", zone: "bl.mailspike.net", priority: "medium" },
  { name: "Invaluement", zone: "dnsbl.invaluement.com", priority: "medium" },
];

// =============================================================================
// Full DKIM Selector List
// =============================================================================

/**
 * Comprehensive list of DKIM selectors (~100)
 * Ordered by likelihood of being found
 */
export const DEFAULT_DKIM_SELECTORS = [
  // Generic / common patterns
  "default",
  "dkim",
  "mail",
  "email",
  "smtp",
  "mta",
  "mx",
  "selector",
  "selector1",
  "selector2",
  "s",
  "s1",
  "s2",
  "s3",
  "k",
  "k1",
  "k2",
  "k3",
  "d",
  "d1",
  "d2",
  "m",
  "m1",
  "m2",
  "e",
  "e1",
  "e2",

  // Google Workspace
  "google",
  "g",
  "gm",

  // Microsoft 365 (selector1, selector2 already covered)

  // Amazon SES (note: often random, may not find)
  "amazonses",
  "ses",

  // Mailgun
  "mailo",
  "pic",
  "mg",
  "mailgun",

  // SendGrid
  "sendgrid",
  "sg",
  "smtpapi",

  // Mailchimp / Mandrill
  "mandrill",
  "mailchimp",
  "mc",
  "mte1",
  "mte2",

  // HubSpot
  "hs1",
  "hs2",
  "hubspot",
  "hubspotemail",

  // Klaviyo
  "kl",
  "kl2",
  "klaviyo",

  // Intercom
  "intercom",
  "ic",

  // Zendesk
  "zendesk",
  "zendesk1",
  "zendesk2",
  "zd",

  // Salesforce
  "sf",
  "sf1",
  "sf2",
  "salesforce",

  // Zoho
  "zoho",
  "zmail",
  "zm",

  // Fastmail
  "fm1",
  "fm2",
  "fm3",
  "mesmtp",

  // Proton
  "protonmail",
  "protonmail2",
  "protonmail3",

  // Mailerlite
  "ml",
  "litesrv",
  "mailerlite",

  // ConvertKit
  "ck",
  "ck1",
  "ck2",
  "convertkit",

  // ActiveCampaign
  "ac",
  "ac1",
  "ac2",
  "dk",
  "activecampaign",

  // Customer.io
  "cio",
  "customerio",

  // Postmark
  "pm",
  "postmark",

  // SparkPost
  "sparkpost",
  "sp",
  "sp1",
  "sp2",

  // SendPulse
  "sendpulse",

  // MailerSend
  "ms",
  "mailersend",

  // Loops
  "loops",

  // Resend
  "resend",

  // Campaign Monitor
  "cm",
  "cmail",

  // Drip
  "drip",

  // Brevo (Sendinblue)
  "sibmail",
  "brevo",

  // Mailjet
  "mailjet",
  "mj",

  // Constant Contact
  "cc",
  "ctct",
  "ctct1",
  "ctct2",

  // AWeber
  "aweber",
  "aw",

  // GetResponse
  "getresponse",
  "gr",

  // Moosend
  "moosend",

  // Omnisend
  "omnisend",

  // Keap / Infusionsoft
  "infusionsoft",
  "keap",

  // Twilio SendGrid
  "twilio",

  // Elastic Email
  "elastic",
  "ee",

  // Pepipost
  "pepipost",

  // SMTP.com
  "smtpcom",

  // Generic fallbacks
  "primary",
  "main",
  "prod",
  "live",
  "api",
  "bulk",
  "transactional",
  "marketing",
] as const;

// =============================================================================
// Full Blacklist Configuration
// =============================================================================

/**
 * Domain-based blacklists
 * Check if a domain appears on these lists
 */
export const DOMAIN_BLACKLISTS: BlacklistConfig[] = [
  { name: "Spamhaus DBL", zone: "dbl.spamhaus.org", priority: "critical" },
  { name: "SURBL Multi", zone: "multi.surbl.org", priority: "high" },
  { name: "URIBL Black", zone: "black.uribl.com", priority: "high" },
  { name: "URIBL Grey", zone: "grey.uribl.com", priority: "medium" },
  { name: "URIBL Red", zone: "red.uribl.com", priority: "high" },
  { name: "URIBL Multi", zone: "multi.uribl.com", priority: "high" },
  { name: "Spamcop URI", zone: "bl.spamcop.net", priority: "high" },
  { name: "DBL Abuse.ch", zone: "dbl.abuse.ch", priority: "medium" },
  { name: "FRESH URI", zone: "fresh.spameatingmonkey.net", priority: "low" },
  { name: "Mailspike Z", zone: "z.mailspike.net", priority: "medium" },
  { name: "SEM Fresh", zone: "fresh.spameatingmonkey.net", priority: "low" },
  { name: "SEM URI", zone: "uribl.spameatingmonkey.net", priority: "medium" },
  { name: "0spam Domain", zone: "bl.0spam.org", priority: "medium" },
  { name: "ZapBL RHSBL", zone: "rhsbl.zapbl.net", priority: "low" },
  { name: "Swinog URI", zone: "uribl.swinog.ch", priority: "low" },
  { name: "ScientificSpam RHSBL", zone: "rhsbl.scientificspam.net", priority: "medium" },
];

/**
 * IP-based blacklists
 * Check if sending IPs appear on these lists
 */
export const IP_BLACKLISTS: BlacklistConfig[] = [
  // Spamhaus (most important)
  { name: "Spamhaus ZEN", zone: "zen.spamhaus.org", priority: "critical" },
  { name: "Spamhaus SBL", zone: "sbl.spamhaus.org", priority: "critical" },
  { name: "Spamhaus XBL", zone: "xbl.spamhaus.org", priority: "critical" },
  { name: "Spamhaus PBL", zone: "pbl.spamhaus.org", priority: "high" },
  { name: "Spamhaus CSS", zone: "sbl-xbl.spamhaus.org", priority: "critical" },

  // Major lists
  { name: "Barracuda", zone: "b.barracudacentral.org", priority: "high" },
  { name: "SpamCop", zone: "bl.spamcop.net", priority: "high" },
  { name: "CBL", zone: "cbl.abuseat.org", priority: "high" },

  // Secondary lists
  { name: "SORBS", zone: "dnsbl.sorbs.net", priority: "medium" },
  { name: "SORBS Spam", zone: "spam.dnsbl.sorbs.net", priority: "medium" },
  {
    name: "SORBS Recent",
    zone: "recent.spam.dnsbl.sorbs.net",
    priority: "medium",
  },
  { name: "SORBS Web", zone: "web.dnsbl.sorbs.net", priority: "medium" },
  { name: "SORBS New", zone: "new.spam.dnsbl.sorbs.net", priority: "low" },

  { name: "Passive Spam Block", zone: "psbl.surriel.com", priority: "medium" },
  { name: "UCEPROTECT 1", zone: "dnsbl-1.uceprotect.net", priority: "medium" },
  { name: "UCEPROTECT 2", zone: "dnsbl-2.uceprotect.net", priority: "low" },
  { name: "UCEPROTECT 3", zone: "dnsbl-3.uceprotect.net", priority: "low" },

  { name: "WPBL", zone: "db.wpbl.info", priority: "medium" },
  { name: "Mailspike BL", zone: "bl.mailspike.net", priority: "medium" },
  { name: "Mailspike Z", zone: "z.mailspike.net", priority: "medium" },

  { name: "0spam IP", zone: "rbl.0spam.org", priority: "medium" },
  { name: "ZapBL", zone: "dnsbl.zapbl.net", priority: "medium" },

  // Additional lists
  { name: "JustSpam", zone: "dnsbl.justspam.org", priority: "low" },
  {
    name: "Hostkarma Black",
    zone: "hostkarma.junkemailfilter.com",
    priority: "low",
  },
  { name: "Invaluement", zone: "dnsbl.invaluement.com", priority: "medium" },
  { name: "Truncate", zone: "truncate.gbudb.net", priority: "low" },

  { name: "SpamRATS NoPtr", zone: "noptr.spamrats.com", priority: "low" },
  { name: "SpamRATS Dyna", zone: "dyna.spamrats.com", priority: "low" },
  { name: "SpamRATS Auth", zone: "auth.spamrats.com", priority: "low" },
  { name: "SpamRATS Spam", zone: "spam.spamrats.com", priority: "low" },

  { name: "BlockList.de", zone: "bl.blocklist.de", priority: "medium" },
  { name: "DroneBL", zone: "dnsbl.dronebl.org", priority: "low" },
  { name: "InterServer", zone: "rbl.interserver.net", priority: "low" },
  { name: "Suomispam", zone: "bl.suomispam.net", priority: "medium" },
  { name: "ScientificSpam", zone: "bl.scientificspam.net", priority: "medium" },
  { name: "Swinog IP", zone: "dnsrbl.swinog.ch", priority: "medium" },
  { name: "Kempt.net", zone: "dnsbl.kempt.net", priority: "low" },
  { name: "Anonmails", zone: "spam.dnsbl.anonmails.de", priority: "low" },

  // Reputation lists
  { name: "Composite BL", zone: "cbl.anti-spam.org.cn", priority: "low" },
];

// =============================================================================
// Timeouts and Limits
// =============================================================================

export const DEFAULT_TIMEOUT = 5000; // 5 seconds per query
export const TOTAL_TIMEOUT = 30_000; // 30 seconds total
export const SPF_LOOKUP_LIMIT = 10; // RFC 7208 limit
export const DKIM_BATCH_SIZE = 10; // Parallel selector lookups
export const BLACKLIST_BATCH_SIZE = 20; // Parallel blacklist checks
export const MAX_CNAME_CHAIN = 10; // Max CNAME hops to follow
export const PORT_25_PROBE_TIMEOUT = 2000; // 2 seconds to probe port 25

// =============================================================================
// Known Mail Server for Port 25 Probe
// =============================================================================

export const KNOWN_MX_SERVER = "gmail-smtp-in.l.google.com";

// =============================================================================
// Email Providers Detection Patterns
// =============================================================================

export const PROVIDER_PATTERNS: Record<
  string,
  { name: string; type: "esp" | "mailbox" | "self-hosted" }
> = {
  // Google
  "google.com": { name: "Google Workspace", type: "mailbox" },
  "googlemail.com": { name: "Google Workspace", type: "mailbox" },
  "gmail.com": { name: "Gmail", type: "mailbox" },

  // Microsoft
  "outlook.com": { name: "Microsoft 365", type: "mailbox" },
  "microsoft.com": { name: "Microsoft 365", type: "mailbox" },
  "protection.outlook.com": { name: "Microsoft 365", type: "mailbox" },

  // Amazon SES
  "amazonses.com": { name: "Amazon SES", type: "esp" },

  // SendGrid
  "sendgrid.net": { name: "SendGrid", type: "esp" },

  // Mailgun
  "mailgun.org": { name: "Mailgun", type: "esp" },

  // Postmark
  "postmarkapp.com": { name: "Postmark", type: "esp" },
  "mtasv.net": { name: "Postmark", type: "esp" },

  // Mailchimp / Mandrill
  "mandrillapp.com": { name: "Mailchimp/Mandrill", type: "esp" },
  "mcsv.net": { name: "Mailchimp", type: "esp" },

  // Resend
  "resend.com": { name: "Resend", type: "esp" },

  // SparkPost
  "sparkpostmail.com": { name: "SparkPost", type: "esp" },

  // Brevo (Sendinblue)
  "sendinblue.com": { name: "Brevo", type: "esp" },

  // Mailjet
  "mailjet.com": { name: "Mailjet", type: "esp" },

  // Zoho
  "zoho.com": { name: "Zoho Mail", type: "mailbox" },

  // Fastmail
  "fastmail.com": { name: "Fastmail", type: "mailbox" },
  "messagingengine.com": { name: "Fastmail", type: "mailbox" },

  // ProtonMail
  "protonmail.ch": { name: "ProtonMail", type: "mailbox" },
  "proton.me": { name: "ProtonMail", type: "mailbox" },
};

// =============================================================================
// Spamhaus Return Codes
// =============================================================================

export const SPAMHAUS_RETURN_CODES: Record<string, string> = {
  "127.0.0.2": "SBL - Spamhaus Block List (known spam source)",
  "127.0.0.3": "SBL - Spamhaus Block List CSS (snowshoe spam)",
  "127.0.0.4": "XBL - CBL (hijacked machine, compromised)",
  "127.0.0.5": "XBL - Njabl (open relay)",
  "127.0.0.6": "XBL - Njabl (spam source)",
  "127.0.0.9": "SBL - Spamhaus DROP (hijacked space)",
  "127.0.0.10": "PBL - Spamhaus Policy Block List (dynamic IP)",
  "127.0.0.11": "PBL - Spamhaus Policy Block List (ISP maintained)",
};
