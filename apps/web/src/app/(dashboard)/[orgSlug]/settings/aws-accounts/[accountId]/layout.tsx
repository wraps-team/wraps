import type { ReactNode } from "react";
import { AccountHeader } from "@/components/account-header";
import { AccountTabs } from "./components/account-tabs";
import { EventFeedStaleBanner } from "./components/event-feed-stale-banner";
import { StalePolicyBanner } from "./components/stale-policy-banner";
import { loadAccountPage } from "./lib/load-account";

type AccountLayoutProps = {
  children: ReactNode;
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
};

export default async function AccountLayout({
  children,
  params,
}: AccountLayoutProps) {
  const { orgSlug, accountId } = await params;
  const { account, permissions, region } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "",
    require: "view",
  });
  const baseHref = `/${orgSlug}/settings/aws-accounts/${accountId}`;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <AccountHeader account={account} orgSlug={orgSlug} region={region} />

      {/* Stale Event Feed Warning */}
      <EventFeedStaleBanner account={account} />

      {/* Stale Console Policy Warning - manager-only, unlike the banner
          above: its only call to action is a link to the IAM role card,
          which only managers can see. */}
      {permissions.canManage && (
        <StalePolicyBanner
          account={account}
          href={`${baseHref}/connection#iam-role`}
        />
      )}

      <AccountTabs baseHref={baseHref} canManage={permissions.canManage} />
      {children}
    </div>
  );
}
