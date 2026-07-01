/**
 * Sample data for the Deliverability console demo surfaces.
 *
 * These values mirror the real reads that already exist in the codebase
 * (CloudWatch bounce/complaint rates, SES GetAccount sandbox/quota fields,
 * GetDedicatedIps) so the mockups demo realistically. Swap these helpers for
 * the live server reads when wiring up the surfaces for real.
 */

export type ReputationStatus = "healthy" | "review" | "paused";

/** AWS SES enforcement lines — the numbers AWS actually acts on. */
export const BOUNCE_THRESHOLDS = {
  healthy: 2, // < 2% healthy
  review: 5, // >= 5% under review
  paused: 10, // >= 10% sending paused
} as const;

export const COMPLAINT_THRESHOLDS = {
  healthy: 0.1, // < 0.1% healthy
  review: 0.1, // >= 0.1% under review
  paused: 0.5, // >= 0.5% sending paused
} as const;

export function bounceStatus(rate: number): ReputationStatus {
  if (rate >= BOUNCE_THRESHOLDS.paused) {
    return "paused";
  }
  if (rate >= BOUNCE_THRESHOLDS.review) {
    return "review";
  }
  return "healthy";
}

export function complaintStatus(rate: number): ReputationStatus {
  if (rate >= COMPLAINT_THRESHOLDS.paused) {
    return "paused";
  }
  if (rate >= COMPLAINT_THRESHOLDS.review) {
    return "review";
  }
  return "healthy";
}

export const STATUS_LABEL: Record<ReputationStatus, string> = {
  healthy: "Healthy",
  review: "Under review",
  paused: "Sending paused",
};

/** Current account reputation snapshot (from CloudWatch). */
export const reputation = {
  sendingEnabled: true,
  bounceRate: 3.1,
  complaintRate: 0.04,
  // 14-day trend of bounce/complaint rate (%)
  history: [
    { date: "2026-06-18", bounce: 1.2, complaint: 0.02 },
    { date: "2026-06-19", bounce: 1.3, complaint: 0.02 },
    { date: "2026-06-20", bounce: 1.5, complaint: 0.03 },
    { date: "2026-06-21", bounce: 1.6, complaint: 0.03 },
    { date: "2026-06-22", bounce: 1.8, complaint: 0.03 },
    { date: "2026-06-23", bounce: 1.9, complaint: 0.04 },
    { date: "2026-06-24", bounce: 2.1, complaint: 0.04 },
    { date: "2026-06-25", bounce: 2.3, complaint: 0.04 },
    { date: "2026-06-26", bounce: 2.4, complaint: 0.04 },
    { date: "2026-06-27", bounce: 2.6, complaint: 0.05 },
    { date: "2026-06-28", bounce: 2.7, complaint: 0.04 },
    { date: "2026-06-29", bounce: 2.9, complaint: 0.04 },
    { date: "2026-06-30", bounce: 3.0, complaint: 0.04 },
    { date: "2026-07-01", bounce: 3.1, complaint: 0.04 },
  ],
};

/** Sandbox / production access + quota (from SES GetAccount / GetSendQuota). */
export const account = {
  inSandbox: false,
  region: "us-east-1",
  max24HourSend: 200_000,
  sentLast24Hours: 84_120,
  maxSendRate: 100, // messages / second
  peakSendRate: 61,
};

export type WarmupPoint = { day: number; cap: number; sent: number };

export type BlocklistCheck = {
  name: string;
  listed: boolean;
  checkedAt: string;
};

export type DedicatedIp = {
  address: string;
  status: ReputationStatus;
  reputation: number; // 0-100
  reverseDns: string;
  warmupDay: number;
  warmupTotal: number;
  dailyCap: number;
  sentToday: number;
  blocklists: BlocklistCheck[];
  warmup: WarmupPoint[];
};

function warmupCurve(days: number, currentDay: number): WarmupPoint[] {
  // AWS-style warmup ramp: 50, 100, 500, 1k, 5k ... doubling toward cap.
  const ramp = [
    50, 100, 500, 1000, 5000, 10_000, 20_000, 40_000, 75_000, 100_000, 150_000,
    200_000, 250_000, 300_000,
  ];
  return Array.from({ length: days }, (_, i) => {
    const cap = ramp[Math.min(i, ramp.length - 1)];
    const sent = i < currentDay ? Math.round(cap * (0.7 + Math.random() * 0.25)) : 0;
    return { day: i + 1, cap, sent };
  });
}

export type IpPool = {
  id: string;
  name: string;
  messageType: string;
  configurationSet: string;
  description: string;
  volume24h: number;
  ips: DedicatedIp[];
};

export const ipPools: IpPool[] = [
  {
    id: "pool-transactional",
    name: "Transactional",
    messageType: "Password resets, receipts, verification",
    configurationSet: "cfg-transactional",
    description:
      "Isolated so a marketing complaint spike can never touch password-reset deliverability.",
    volume24h: 52_400,
    ips: [
      {
        address: "198.51.100.24",
        status: "healthy",
        reputation: 98,
        reverseDns: "mta1.txn.acme.com",
        warmupDay: 14,
        warmupTotal: 14,
        dailyCap: 300_000,
        sentToday: 41_200,
        blocklists: [
          { name: "Spamhaus", listed: false, checkedAt: "6m ago" },
          { name: "Barracuda", listed: false, checkedAt: "6m ago" },
          { name: "SpamCop", listed: false, checkedAt: "6m ago" },
        ],
        warmup: warmupCurve(14, 14),
      },
      {
        address: "198.51.100.25",
        status: "healthy",
        reputation: 96,
        reverseDns: "mta2.txn.acme.com",
        warmupDay: 14,
        warmupTotal: 14,
        dailyCap: 300_000,
        sentToday: 11_200,
        blocklists: [
          { name: "Spamhaus", listed: false, checkedAt: "6m ago" },
          { name: "Barracuda", listed: false, checkedAt: "6m ago" },
          { name: "SpamCop", listed: false, checkedAt: "6m ago" },
        ],
        warmup: warmupCurve(14, 14),
      },
    ],
  },
  {
    id: "pool-marketing",
    name: "Marketing",
    messageType: "Broadcasts, newsletters, lifecycle",
    configurationSet: "cfg-marketing",
    description:
      "Warming a new dedicated IP. Traffic is capped daily until it reaches full sending volume.",
    volume24h: 28_900,
    ips: [
      {
        address: "203.0.113.71",
        status: "review",
        reputation: 74,
        reverseDns: "mta1.mkt.acme.com",
        warmupDay: 6,
        warmupTotal: 14,
        dailyCap: 10_000,
        sentToday: 9_400,
        blocklists: [
          { name: "Spamhaus", listed: false, checkedAt: "4m ago" },
          { name: "Barracuda", listed: true, checkedAt: "4m ago" },
          { name: "SpamCop", listed: false, checkedAt: "4m ago" },
        ],
        warmup: warmupCurve(14, 6),
      },
    ],
  },
];

export type MailboxProvider = {
  provider: string;
  delivered: number;
  inbox: number; // % placed in inbox
  bounced: number;
  complained: number;
};

export const providerPlacement: MailboxProvider[] = [
  { provider: "Gmail", delivered: 41_200, inbox: 98.4, bounced: 0.9, complained: 0.02 },
  { provider: "Outlook", delivered: 22_800, inbox: 94.1, bounced: 1.4, complained: 0.05 },
  { provider: "Yahoo", delivered: 12_400, inbox: 91.7, bounced: 2.1, complained: 0.08 },
  { provider: "Other", delivered: 7_700, inbox: 96.2, bounced: 1.1, complained: 0.03 },
];

export type DomainAuth = {
  domain: string;
  dkim: "pass" | "fail" | "pending";
  spf: "pass" | "fail" | "pending";
  dmarc: "pass" | "fail" | "pending";
  mailFrom: "pass" | "fail" | "pending";
  dmarcPolicy: string;
  drift: string | null;
};

export const domains: DomainAuth[] = [
  {
    domain: "acme.com",
    dkim: "pass",
    spf: "pass",
    dmarc: "pass",
    mailFrom: "pass",
    dmarcPolicy: "p=reject",
    drift: null,
  },
  {
    domain: "mail.acme.com",
    dkim: "pass",
    spf: "pass",
    dmarc: "fail",
    mailFrom: "pending",
    dmarcPolicy: "p=none",
    drift: "MAIL FROM MX record removed 2 days ago",
  },
];

export type ComplianceCheck = {
  label: string;
  detail: string;
  pass: boolean;
};

export const complianceChecklist: ComplianceCheck[] = [
  {
    label: "DMARC enforced",
    detail: "acme.com publishes p=reject",
    pass: true,
  },
  {
    label: "One-click List-Unsubscribe",
    detail: "RFC 8058 headers present on marketing sends",
    pass: true,
  },
  {
    label: "Spam rate under 0.3%",
    detail: "Current complaint rate 0.04%",
    pass: true,
  },
  {
    label: "SPF & DKIM aligned",
    detail: "mail.acme.com DMARC failing — MAIL FROM drift",
    pass: false,
  },
];

/** SES cost transparency at real AWS pricing. */
export const costs = {
  emailsSent: 2_540_000,
  perEmail: 0.1 / 1000, // $0.10 per 1,000 emails
  dedicatedIps: 3,
  perIpMonthly: 24.95,
  dataProcessedGb: 41,
  perGb: 0.12,
};
