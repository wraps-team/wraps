import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { redirect } from "next/navigation";
import { OrganizationSettingsAwsAccounts } from "@/components/organization-settings-aws-accounts";
import { type AccountRow, getAccountStatus } from "@/lib/aws/account-status";
import {
  getOrganizationPlanId,
  getOrganizationWithMembership,
} from "@/lib/organization";
import { isSelfHosted } from "@/lib/plan-limits";
import { formatRelativeTime } from "@/lib/utils";

type AwsAccountsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AwsAccountsPage({
  params,
}: AwsAccountsPageProps) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/");
  }

  const planId = await getOrganizationPlanId(orgWithMembership.id);

  // Only the columns the list renders. webhookSecret, roleArn, externalId and
  // healthDetail never cross into the client component.
  const dbRows = await db.query.awsAccount.findMany({
    where: (a, { eq }) => eq(a.organizationId, orgWithMembership.id),
    columns: {
      id: true,
      name: true,
      accountId: true,
      region: true,
      emailEnabled: true,
      smsEnabled: true,
      healthStatus: true,
      healthDetail: true,
      roleLastReachableAt: true,
      eventFeedStaleSince: true,
      lastEventReceivedAt: true,
    },
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  const now = new Date();
  const accounts: AccountRow[] = dbRows.map((row) => ({
    id: row.id,
    name: row.name,
    accountId: row.accountId,
    region: row.region,
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    status: getAccountStatus({
      role: { lastReachableAt: row.roleLastReachableAt },
      regional: {
        healthStatus: row.healthStatus,
        healthReasons: row.healthDetail?.reasons ?? [],
        eventFeedStaleSince: row.eventFeedStaleSince,
        lastEventReceivedAt: row.lastEventReceivedAt,
      },
      now,
    }),
    lastEventAt: row.lastEventReceivedAt
      ? formatRelativeTime(row.lastEventReceivedAt)
      : null,
  }));

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">AWS Accounts</h1>
        <p className="text-muted-foreground">
          Accounts Wraps can read and send through.
        </p>
      </div>

      <OrganizationSettingsAwsAccounts
        accounts={accounts}
        organization={orgWithMembership}
        planId={planId}
        selfHosted={isSelfHosted()}
        unlimited={isSelfHosted()}
        userRole={orgWithMembership.userRole}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    return { title: "AWS Accounts" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `AWS Accounts | ${orgWithMembership.name} | Wraps`,
    description: `Manage AWS accounts for ${orgWithMembership.name}`,
  };
}
