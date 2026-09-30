import { isSelfHosted } from "@/lib/plan-limits";
import { AccountDetails } from "./components/account-details";
import { AccountFeatures } from "./components/account-features";
import { IAMConfiguration } from "./components/iam-configuration";
import { QuotaReserve } from "./components/quota-reserve";
import { SesPlanCard } from "./components/ses-plan-card";
import { VdmStatusCard } from "./components/vdm-status-card";
import { WebhookConfiguration } from "./components/webhook-configuration";
import { loadAccountPage } from "./lib/load-account";

type AWSAccountPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
  searchParams: Promise<{
    region?: string | string[];
  }>;
};

export default async function AWSAccountPage({
  params,
  searchParams,
}: AWSAccountPageProps) {
  const { orgSlug, accountId } = await params;
  const { region } = await searchParams;

  // An array is "present but not equal" and redirects like any other mismatch.
  const { account, organization, permissions } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "",
    region,
    require: "view",
  });

  return (
    <div className="space-y-6">
      {/* Deployed Features */}
      <AccountFeatures account={account} organizationId={organization.id} />

      {/* AWS SES pricing plan - read-only, visible to every viewer */}
      <SesPlanCard account={account} />

      {/* Virtual Deliverability Manager - read-only, visible to every viewer */}
      <VdmStatusCard account={account} />

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
