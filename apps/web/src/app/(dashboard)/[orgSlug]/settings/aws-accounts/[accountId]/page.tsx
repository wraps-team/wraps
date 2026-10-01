import { getAccountStatus } from "@/lib/aws/account-status";
import { HealthSummary } from "./components/overview/health-summary";
import { StatusList } from "./components/overview/status-list";
import { loadAccountPage } from "./lib/load-account";
import { getRoleStatus } from "./lib/role-status";

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
  const { region: regionParam } = await searchParams;

  // An array is "present but not equal" and redirects like any other mismatch.
  const { account, region, regional } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "",
    region: regionParam,
    require: "view",
  });

  // Everything below reads persisted columns: no AWS call on page load.
  const now = new Date();
  const reasons = regional.healthDetail?.reasons ?? [];
  const status = getAccountStatus({
    role: { lastReachableAt: account.roleLastReachableAt },
    regional: {
      healthStatus: regional.healthStatus,
      healthReasons: reasons,
      eventFeedStaleSince: regional.eventFeedStaleSince,
      lastEventReceivedAt: regional.lastEventReceivedAt,
    },
    now,
  });
  const roleStatus = getRoleStatus({
    lastReachableAt: account.roleLastReachableAt,
    consolePolicyVersion: account.consolePolicyVersion,
    consolePolicyCheckedAt: account.consolePolicyCheckedAt,
    now,
  });

  return (
    <div className="space-y-6">
      <StatusList
        accountId={accountId}
        emailEnabled={regional.emailEnabled}
        lastEventReceivedAt={
          regional.lastEventReceivedAt?.toISOString() ?? null
        }
        orgSlug={orgSlug}
        region={region}
        roleStatus={roleStatus}
        scannedAt={regional.features?.scannedAt ?? null}
        smsEnabled={regional.smsEnabled}
        staleSince={regional.eventFeedStaleSince?.toISOString() ?? null}
        webhookConnected={regional.webhookConnected}
      />
      <HealthSummary
        healthCheckedAt={regional.healthCheckedAt?.toISOString() ?? null}
        healthDetail={regional.healthDetail}
        orgSlug={orgSlug}
        reasons={reasons}
        region={region}
        status={status}
      />
    </div>
  );
}
