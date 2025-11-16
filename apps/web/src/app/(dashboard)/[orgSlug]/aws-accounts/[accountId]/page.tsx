import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { MetricsDisplay } from "@/components/metrics-display";
import { getSESMetricsSummary } from "@/lib/aws/cloudwatch";
import { getOrganizationBySlug } from "@/lib/organization";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";

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
    redirect("/dashboard");
  }

  // Get AWS account
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, accountId),
  });

  if (!account || account.organizationId !== organization.id) {
    redirect(`/${orgSlug}/aws-accounts`);
  }

  // Check if user has view permission
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: organization.id,
    awsAccountId: accountId,
    permission: "view",
  });

  if (!access.authorized) {
    redirect(`/${orgSlug}`);
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

  // Get metrics for last 7 days
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  let metrics: Awaited<ReturnType<typeof getSESMetricsSummary>> | null = null;
  let metricsError: string | null = null;

  try {
    metrics = await getSESMetricsSummary({
      awsAccountId: accountId,
      startTime,
      endTime,
      period: 3600, // 1 hour intervals
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    metricsError =
      error instanceof Error ? error.message : "Failed to fetch metrics";
  }

  return (
    <>
      {/* Header */}
      <div className="px-4 lg:px-6">
        <AccountHeader
          account={account}
          orgSlug={orgSlug}
          permissions={permissions}
        />
      </div>

      {/* Metrics */}
      <div className="px-4 lg:px-6">
        <h2 className="mb-4 font-semibold text-xl">
          Email Metrics (Last 7 Days)
        </h2>
        {metricsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-600 text-sm">
              Error loading metrics: {metricsError}
            </p>
          </div>
        ) : metrics ? (
          <MetricsDisplay metrics={metrics} />
        ) : (
          <div className="text-muted-foreground">Loading metrics...</div>
        )}
      </div>

      {/* Account Details */}
      <div className="px-4 lg:px-6">
        <h2 className="mb-4 font-semibold text-xl">Account Details</h2>
        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <dl className="space-y-4">
            <div>
              <dt className="font-medium text-muted-foreground text-sm">
                Account Name
              </dt>
              <dd className="mt-1">{account.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground text-sm">
                AWS Account ID
              </dt>
              <dd className="mt-1 font-mono text-sm">{account.accountId}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground text-sm">
                Region
              </dt>
              <dd className="mt-1">{account.region}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground text-sm">
                Role ARN
              </dt>
              <dd className="mt-1 font-mono text-sm">{account.roleArn}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground text-sm">
                Status
              </dt>
              <dd className="mt-1">
                {account.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-green-800 text-xs">
                    <svg
                      className="h-3 w-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        clipRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        fillRule="evenodd"
                      />
                    </svg>
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                    Pending Verification
                  </span>
                )}
              </dd>
            </div>
            {account.lastVerifiedAt && (
              <div>
                <dt className="font-medium text-muted-foreground text-sm">
                  Last Verified
                </dt>
                <dd className="mt-1 text-sm">
                  {new Date(account.lastVerifiedAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </>
  );
}
