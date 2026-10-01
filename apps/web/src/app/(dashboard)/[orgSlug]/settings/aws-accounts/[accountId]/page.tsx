import { QuotaReserve } from "./components/quota-reserve";
import { toClientAccount } from "./lib/client-account";
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
  const { account, permissions, regional } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "",
    region,
    require: "view",
  });

  // Props to client components are serialized whole: hand them the allowlist,
  // never the row (it carries the SES webhook secret).
  const clientAccount = toClientAccount(account, regional);

  return (
    <div className="space-y-6">
      {/* Daily Quota Reserve - only show to managers */}
      {permissions.canManage && <QuotaReserve account={clientAccount} />}
    </div>
  );
}
