import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { isSelfHosted } from "@/lib/plan-limits";
import { IAMConfiguration } from "../components/iam-configuration";
import { WebhookConfiguration } from "../components/webhook-configuration";
import { toClientAccount } from "../lib/client-account";
import { loadAccountPage } from "../lib/load-account";
import { getRoleStatus, LEVEL_BADGE_VARIANT } from "../lib/role-status";

type ConnectionPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
  searchParams: Promise<{
    region?: string | string[];
  }>;
};

export default async function ConnectionPage({
  params,
  searchParams,
}: ConnectionPageProps) {
  const { orgSlug, accountId } = await params;
  const { region: regionParam } = await searchParams;

  // An array is "present but not equal" and redirects like any other mismatch.
  const { account, region, regional, permissions } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "/connection",
    region: regionParam,
    require: "view",
  });

  // Props to client components are serialized whole: hand them the allowlist,
  // never the row (it carries the SES webhook secret).
  const clientAccount = toClientAccount(account, regional);

  // The role is account-scoped, so its status reads from the row, not `regional`.
  const roleStatus = getRoleStatus({
    lastReachableAt: account.roleLastReachableAt,
    consolePolicyVersion: account.consolePolicyVersion,
    consolePolicyCheckedAt: account.consolePolicyCheckedAt,
    now: new Date(),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4" id="iam-role">
        <Card>
          <CardHeader>
            <CardTitle>Role access</CardTitle>
            <CardDescription>
              How Wraps reaches this AWS account, through the{" "}
              <code className="font-mono">wraps-console-access-role</code> IAM
              role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={LEVEL_BADGE_VARIANT[roleStatus.level]}>
                {roleStatus.label}
              </Badge>
              {roleStatus.detail && (
                <span className="text-muted-foreground text-sm">
                  {roleStatus.detail}
                </span>
              )}
            </div>
            <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {account.roleArn}
            </code>
          </CardContent>
        </Card>

        {permissions.canManage && (
          <IAMConfiguration
            account={clientAccount}
            defaultOpen={roleStatus.needsRepair}
            selfHosted={isSelfHosted()}
          />
        )}
      </div>

      <WebhookConfiguration
        account={clientAccount}
        canManage={permissions.canManage}
        lastEventReceivedAt={
          regional.lastEventReceivedAt?.toISOString() ?? null
        }
        region={region}
        staleSince={regional.eventFeedStaleSince?.toISOString() ?? null}
      />
    </div>
  );
}
