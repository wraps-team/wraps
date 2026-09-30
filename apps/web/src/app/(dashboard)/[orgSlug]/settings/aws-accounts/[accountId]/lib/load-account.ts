import { auth } from "@wraps/auth";
import type { awsAccount } from "@wraps/db";
import { db } from "@wraps/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getOrganizationBySlug } from "@/lib/organization";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";

type AwsAccountRow = typeof awsAccount.$inferSelect;

/**
 * Region-scoped view of an account. Built from the `aws_account` row today;
 * plan 386 (multi-region) will later read it from a per-region table inside
 * `loadAccountPage` and nothing else has to change.
 */
export type AccountRegionalView = {
  features: AwsAccountRow["features"];
  emailEnabled: AwsAccountRow["emailEnabled"];
  smsEnabled: AwsAccountRow["smsEnabled"];
  healthStatus: AwsAccountRow["healthStatus"];
  healthCheckedAt: AwsAccountRow["healthCheckedAt"];
  healthDetail: AwsAccountRow["healthDetail"];
  lastEventReceivedAt: AwsAccountRow["lastEventReceivedAt"];
  eventFeedStaleSince: AwsAccountRow["eventFeedStaleSince"];
  dailyQuotaReserve: AwsAccountRow["dailyQuotaReserve"];
  /** Never the secret itself. */
  webhookConnected: boolean;
};

export type AccountTab = "" | "/access";

// Cached per request on primitive args (React cache() dedupes by argument
// identity), so the layout and the page share one lookup.
const getAccountContext = cache(async (orgSlug: string, accountId: string) => {
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });
  if (!session?.user) {
    return { missing: "session" as const };
  }

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return { missing: "organization" as const };
  }

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, accountId), eq(a.organizationId, organization.id)),
  });
  if (!account) {
    return { missing: "account" as const };
  }

  const check = (permission: "view" | "send" | "manage") =>
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission,
    });
  const [viewAccess, sendAccess, manageAccess] = await Promise.all([
    check("view"),
    check("send"),
    check("manage"),
  ]);

  return {
    userId: session.user.id,
    organization,
    account,
    permissions: {
      canView: viewAccess.authorized,
      canSend: sendAccess.authorized,
      canManage: manageAccess.authorized,
    },
  };
});

/**
 * Every tab page AND the layout must call this: a layout does not re-render on
 * navigation and cannot gate a child segment, so each page redirects itself.
 * Pages read the region from the returned `region`, never `account.region`.
 */
export async function loadAccountPage(opts: {
  orgSlug: string;
  accountId: string;
  /** The current tab's path suffix, used for the region redirect. */
  tab: AccountTab;
  /** Pass `(await searchParams).region` on region-scoped pages; omit on account-scoped ones. */
  region?: string | string[];
  require: "view" | "manage";
}) {
  const { orgSlug, accountId, tab, region, require } = opts;
  const ctx = await getAccountContext(orgSlug, accountId);

  if ("missing" in ctx) {
    if (ctx.missing === "session") {
      redirect("/auth");
    }
    if (ctx.missing === "organization") {
      redirect("/");
    }
    redirect(`/${orgSlug}/settings/aws-accounts`);
  }

  const { userId, organization, account, permissions } = ctx;
  const base = `/${orgSlug}/settings/aws-accounts/${accountId}`;

  if (!permissions.canView) {
    redirect(`/${orgSlug}/emails`);
  }
  if (require === "manage" && !permissions.canManage) {
    redirect(base);
  }
  // Drop the param: a link must never silently show another region's data.
  if (region !== undefined && region !== account.region) {
    redirect(`${base}${tab}`);
  }

  const regional: AccountRegionalView = {
    features: account.features,
    emailEnabled: account.emailEnabled,
    smsEnabled: account.smsEnabled,
    healthStatus: account.healthStatus,
    healthCheckedAt: account.healthCheckedAt,
    healthDetail: account.healthDetail,
    lastEventReceivedAt: account.lastEventReceivedAt,
    eventFeedStaleSince: account.eventFeedStaleSince,
    dailyQuotaReserve: account.dailyQuotaReserve,
    webhookConnected: !!account.webhookSecret,
  };

  return {
    userId,
    organization,
    account,
    region: account.region,
    regional,
    permissions,
  };
}
