/**
 * Account Health Worker
 *
 * Scheduled Lambda that sweeps connected AWS accounts with customer-role
 * credentials and writes inbox notifications for SES health problems the
 * customer would otherwise discover too late:
 *
 *   - ses.sending_paused      SendingEnabled=false or enforcement not HEALTHY
 *   - ses.reputation_warning  bounce rate >= 5% or complaint rate >= 0.1%
 *                             (SES review thresholds; pause is 10% / 0.5%)
 *   - ses.quota_warning       >= 80% of the 24h send quota consumed
 *   - ses.production_access   sandbox -> production transition observed
 *   - aws.role_unreachable    the customer's console-access role cannot be
 *                             assumed, or no longer grants SES read access.
 *                             Only raised for an account that previously
 *                             passed a check (roleLastReachableAt is set) —
 *                             a role that has never worked is an unfinished
 *                             setup, not a regression, and stays silent.
 *
 * Each alert is deduped per account per 24h via hasRecentNotification, so
 * an ongoing episode notifies once per day rather than once per hour.
 * Per-account errors are logged and skipped — one broken role must not
 * abort the sweep.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  GetAccountCommand,
  type GetAccountCommandOutput,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { captureException, wrapHandler } from "@sentry/aws-serverless";
import {
  awsAccount,
  db,
  hasRecentNotification,
  notifyOrg,
  organization,
} from "@wraps/db";
import type { Handler } from "aws-lambda";
import { and, eq, isNotNull } from "drizzle-orm";
import { flushLogger, log } from "../lib/logger";
import { type AwsCredentials, getCredentials } from "../services/credentials";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000; // once per day per account
const BOUNCE_RATE_WARN = 0.05; // SES review threshold
const COMPLAINT_RATE_WARN = 0.001; // SES review threshold
const QUOTA_WARN_RATIO = 0.8;

/**
 * STS/SES codes that all mean the same thing operationally: the customer's
 * console-access role is gone, its trust policy no longer admits this Lambda,
 * or it no longer carries the SES read permissions the sweep needs.
 */
const ROLE_ACCESS_ERROR_CODES = [
  "AccessDenied",
  "AccessDeniedException",
  "NoSuchEntity",
  "NoSuchEntityException",
  "InvalidClientTokenId",
  "ExpiredToken",
  "ExpiredTokenException",
  "UnrecognizedClientException",
] as const;

/**
 * AWS SDK v3 error names are unreliable — some errors arrive as `name: "Error"`
 * with the real code only in the message — so both are checked.
 */
function isRoleAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return ROLE_ACCESS_ERROR_CODES.some(
    (code) => error.name === code || error.message.includes(code)
  );
}

type AccountRow = {
  id: string;
  organizationId: string;
  name: string;
  accountId: string;
  region: string;
  features: typeof awsAccount.$inferSelect.features;
  roleLastReachableAt: Date | null;
};

async function getOrgSlug(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.slug ?? null;
}

async function notifyOnce(params: {
  account: AccountRow;
  type: string;
  title: string;
  body: string;
  href: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const already = await hasRecentNotification({
    organizationId: params.account.organizationId,
    type: params.type,
    since,
    dataEquals: { key: "awsAccountId", value: params.account.id },
  });
  if (already) {
    return false;
  }
  await notifyOrg({
    organizationId: params.account.organizationId,
    roles: ["owner", "admin"],
    type: params.type,
    title: params.title,
    body: params.body,
    href: params.href,
    data: { awsAccountId: params.account.id, ...params.data },
  });
  return true;
}

/** Latest non-null datapoint for SES account reputation metrics (last 24h). */
async function getReputationRates(
  cloudwatch: CloudWatchClient
): Promise<{ bounceRate: number | null; complaintRate: number | null }> {
  const now = new Date();
  const response = await cloudwatch.send(
    new GetMetricDataCommand({
      StartTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      EndTime: now,
      ScanBy: "TimestampDescending",
      MetricDataQueries: [
        {
          Id: "bounce",
          MetricStat: {
            Metric: {
              Namespace: "AWS/SES",
              MetricName: "Reputation.BounceRate",
            },
            Period: 3600,
            Stat: "Average",
          },
        },
        {
          Id: "complaint",
          MetricStat: {
            Metric: {
              Namespace: "AWS/SES",
              MetricName: "Reputation.ComplaintRate",
            },
            Period: 3600,
            Stat: "Average",
          },
        },
      ],
    })
  );

  const latest = (id: string): number | null => {
    const result = response.MetricDataResults?.find((r) => r.Id === id);
    return result?.Values?.[0] ?? null;
  };
  return { bounceRate: latest("bounce"), complaintRate: latest("complaint") };
}

async function checkAccount(account: AccountRow): Promise<void> {
  const orgSlug = await getOrgSlug(account.organizationId);
  if (!orgSlug) {
    return;
  }
  const accountHref = `/${orgSlug}/settings/aws-accounts/${account.id}`;

  // Assuming the role and reading SES are the two points where a deleted role,
  // a drifted trust policy, or a stripped inline policy surfaces. That is the
  // customer's configuration to repair, not a defect here: it never self-heals,
  // so reporting it to Sentry every hour buries real failures while leaving the
  // customer unaware their account stopped being health-checked.
  let credentials: AwsCredentials;
  let info: GetAccountCommandOutput;
  try {
    credentials = await getCredentials(account.id, account.organizationId);
    info = await new SESv2Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    }).send(new GetAccountCommand({}));
  } catch (error) {
    if (!isRoleAccessError(error)) {
      throw error;
    }
    // "Can no longer reach" is only true if it was ever reached. An account
    // that has never passed a check is one that was never finished being set
    // up — there is no regression to report, and an alert saying the role
    // broke is something the customer cannot act on because nothing changed.
    // Silence here is deliberate: these accounts are the majority, they never
    // self-heal, and alerting them buries the accounts that genuinely broke.
    if (account.roleLastReachableAt === null) {
      log.info(
        "[account-health] Role unusable and never reachable, skipping silently",
        {
          accountId: account.id,
          organizationId: account.organizationId,
          awsAccountId: account.accountId,
        }
      );
      return;
    }
    await notifyOnce({
      account,
      type: "aws.role_unreachable",
      title: "Wraps can no longer reach your AWS account",
      body: `The wraps-console-access-role in AWS account ${account.accountId} (${account.region}) cannot be assumed or is missing SES permissions, so health checks — sending paused, reputation, and quota alerts — are not running for this account. Run \`wraps platform update-role\` to repair the role's trust policy and permissions, or \`wraps platform connect\` if the role was deleted.`,
      href: accountHref,
      data: {
        reason: error instanceof Error ? error.name : "unknown",
        lastReachableAt: account.roleLastReachableAt.toISOString(),
      },
    });
    log.warn("[account-health] Customer role unusable, skipping account", {
      accountId: account.id,
      organizationId: account.organizationId,
      awsAccountId: account.accountId,
      lastReachableAt: account.roleLastReachableAt.toISOString(),
    });
    return;
  }

  // Known good: the role assumed and SES answered. Stamped before the checks
  // below so a later failure in one of them cannot retroactively make this
  // account look unreachable.
  await db
    .update(awsAccount)
    .set({ roleLastReachableAt: new Date() })
    .where(
      and(
        eq(awsAccount.id, account.id),
        eq(awsAccount.organizationId, account.organizationId)
      )
    );

  // 1. Sending paused / enforcement problems — the catastrophic one.
  const enforcement = info.EnforcementStatus;
  if (
    info.SendingEnabled === false ||
    (enforcement && enforcement !== "HEALTHY")
  ) {
    await notifyOnce({
      account,
      type: "ses.sending_paused",
      title: `SES sending is ${info.SendingEnabled === false ? "paused" : `under review (${enforcement})`}`,
      body: `AWS account ${account.accountId} (${account.region}) cannot send email normally. Check the SES console and your recent bounce/complaint rates immediately.`,
      href: accountHref,
      data: { enforcement: enforcement ?? null },
    });
  }

  // 2. Sandbox -> production transition.
  if (
    info.ProductionAccessEnabled &&
    account.features?.email?.sandbox === true
  ) {
    const features = {
      ...account.features,
      email: { ...account.features.email, sandbox: false },
    };
    await db
      .update(awsAccount)
      .set({ features, updatedAt: new Date() })
      .where(
        and(
          eq(awsAccount.id, account.id),
          eq(awsAccount.organizationId, account.organizationId)
        )
      );
    await notifyOnce({
      account,
      type: "ses.production_access",
      title: "SES production access granted",
      body: `AWS account ${account.accountId} (${account.region}) is out of the SES sandbox. You can now send email to any recipient.`,
      href: `/${orgSlug}/emails`,
    });
  }

  // 3. Daily quota approaching.
  const max24h = info.SendQuota?.Max24HourSend ?? 0;
  const sent24h = info.SendQuota?.SentLast24Hours ?? 0;
  if (max24h > 0 && sent24h / max24h >= QUOTA_WARN_RATIO) {
    const pct = Math.round((sent24h / max24h) * 100);
    await notifyOnce({
      account,
      type: "ses.quota_warning",
      title: `${pct}% of your daily SES quota used`,
      body: `${Math.round(sent24h)} of ${Math.round(max24h)} emails sent in the last 24 hours on AWS account ${account.accountId}. Sends fail once the quota is exhausted — request a quota increase if this is expected growth.`,
      href: accountHref,
      data: { sent24h, max24h },
    });
  }

  // 4. Reputation thresholds.
  const cloudwatch = new CloudWatchClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  const { bounceRate, complaintRate } = await getReputationRates(cloudwatch);
  const bounceHigh = bounceRate !== null && bounceRate >= BOUNCE_RATE_WARN;
  const complaintHigh =
    complaintRate !== null && complaintRate >= COMPLAINT_RATE_WARN;
  if (bounceHigh || complaintHigh) {
    const parts: string[] = [];
    if (bounceHigh) {
      parts.push(
        `bounce rate ${(bounceRate * 100).toFixed(2)}% (SES pauses sending at 10%)`
      );
    }
    if (complaintHigh) {
      parts.push(
        `complaint rate ${(complaintRate * 100).toFixed(3)}% (SES pauses sending at 0.5%)`
      );
    }
    await notifyOnce({
      account,
      type: "ses.reputation_warning",
      title: "SES reputation needs attention",
      body: `AWS account ${account.accountId} is in the SES review range: ${parts.join("; ")}. Clean your lists and investigate recent bounces/complaints before AWS pauses sending.`,
      href: `/${orgSlug}/emails/analytics`,
      data: { bounceRate, complaintRate },
    });
  }
}

export const handler: Handler = wrapHandler(async () => {
  log.info("[account-health] Starting sweep");

  const accounts = await db
    .select({
      id: awsAccount.id,
      organizationId: awsAccount.organizationId,
      name: awsAccount.name,
      accountId: awsAccount.accountId,
      region: awsAccount.region,
      features: awsAccount.features,
      roleLastReachableAt: awsAccount.roleLastReachableAt,
    })
    .from(awsAccount)
    .where(isNotNull(awsAccount.webhookSecret));

  let checkedCount = 0;
  let errorCount = 0;

  for (const account of accounts) {
    try {
      await checkAccount(account);
      checkedCount++;
    } catch (error) {
      errorCount++;
      // Skipped by design so one broken role cannot abort the sweep — which
      // also means an account whose role has drifted stops being health-checked
      // indefinitely without anything surfacing it.
      captureException(error, {
        tags: { worker: "account-health", stage: "check-account" },
        extra: {
          accountId: account.id,
          organizationId: account.organizationId,
        },
      });
      log.error("[account-health] Account check failed", error, {
        accountId: account.id,
        organizationId: account.organizationId,
      });
    }
  }

  log.info("[account-health] Sweep complete", {
    accountsTotal: accounts.length,
    checkedCount,
    errorCount,
  });
  await flushLogger();
});
