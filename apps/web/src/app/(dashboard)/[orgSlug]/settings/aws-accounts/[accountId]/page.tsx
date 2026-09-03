import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { getOrganizationBySlug } from "@/lib/organization";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";
import { isSelfHosted } from "@/lib/plan-limits";
import { AccountDetails } from "./components/account-details";
import { AccountFeatures } from "./components/account-features";
import { EventFeedStaleBanner } from "./components/event-feed-stale-banner";
import { IAMConfiguration } from "./components/iam-configuration";
import { QuotaReserve } from "./components/quota-reserve";
import { WebhookConfiguration } from "./components/webhook-configuration";

type AWSAccountPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
};

export default async function AWSAccountPage({ params }: AWSAccountPageProps) {
  const { orgSlug, accountId } = await params;

  // Get session
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  // Get organization
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    redirect("/");
  }

  // Get AWS account
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, accountId),
  });

  if (!account || account.organizationId !== organization.id) {
    redirect(`/${orgSlug}/settings?tab=aws-accounts`);
  }

  // Check if user has view permission
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: organization.id,
    awsAccountId: accountId,
    permission: "view",
  });

  if (!access.authorized) {
    redirect(`/${orgSlug}/emails`);
  }

  // Check all permissions
  const [viewAccess, sendAccess, manageAccess] = await Promise.all([
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission: "view",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission: "send",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission: "manage",
    }),
  ]);

  const permissions = {
    canView: viewAccess.authorized,
    canSend: sendAccess.authorized,
    canManage: manageAccess.authorized,
  };

  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Header */}
      <AccountHeader
        account={account}
        orgSlug={orgSlug}
        permissions={permissions}
      />

      {/* Stale Event Feed Warning */}
      <EventFeedStaleBanner account={account} />

      {/* Deployed Features */}
      <AccountFeatures account={account} organizationId={organization.id} />

      {/* Account Details */}
      <AccountDetails account={account} />

      {/* IAM role repair - the landing spot for the aws.role_unreachable
          notification, so the CloudFormation fix has to live here and not
          only on the account list. Managers only: it rewrites the role. */}
      {permissions.canManage && (
        <IAMConfiguration account={account} selfHosted={isSelfHosted()} />
      )}

      {/* Platform Connection - only show to managers */}
      {permissions.canManage && <WebhookConfiguration account={account} />}

      {/* Daily Quota Reserve - only show to managers */}
      {permissions.canManage && <QuotaReserve account={account} />}
    </div>
  );
}
