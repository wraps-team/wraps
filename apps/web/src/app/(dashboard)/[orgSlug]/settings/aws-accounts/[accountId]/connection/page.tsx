import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ROLE_REACHABILITY_WINDOW_MS } from "@/lib/aws/account-status";
import { isSelfHosted } from "@/lib/plan-limits";
import { formatRelativeTime } from "@/lib/utils";
import { IAMConfiguration } from "../components/iam-configuration";
import { CURRENT_CONSOLE_POLICY_VERSION } from "../components/stale-policy-banner";
import { WebhookConfiguration } from "../components/webhook-configuration";
import { toClientAccount } from "../lib/client-account";
import { loadAccountPage } from "../lib/load-account";

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
  const { roleLastReachableAt, consolePolicyVersion, consolePolicyCheckedAt } =
    account;
  const unreachable =
    roleLastReachableAt !== null &&
    Date.now() - roleLastReachableAt.getTime() > ROLE_REACHABILITY_WINDOW_MS;
  const policyBehind =
    consolePolicyVersion !== null &&
    consolePolicyVersion < CURRENT_CONSOLE_POLICY_VERSION;
  const needsRepair = unreachable || policyBehind;

  let roleBadge: {
    variant: "secondary" | "destructive" | "success";
    label: string;
  };
  if (roleLastReachableAt === null) {
    roleBadge = { variant: "secondary", label: "Not checked yet" };
  } else if (unreachable) {
    roleBadge = { variant: "destructive", label: "Unreachable" };
  } else {
    roleBadge = { variant: "success", label: "Reachable" };
  }

  const roleDetail = [
    roleLastReachableAt
      ? `Last reached ${formatRelativeTime(roleLastReachableAt)}`
      : null,
    consolePolicyVersion !== null
      ? `policy v${consolePolicyVersion} of ${CURRENT_CONSOLE_POLICY_VERSION}`
      : null,
    consolePolicyCheckedAt
      ? `checked ${formatRelativeTime(consolePolicyCheckedAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
              <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
              {roleDetail && (
                <span className="text-muted-foreground text-sm">
                  {roleDetail}
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
            defaultOpen={needsRepair}
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
