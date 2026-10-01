import { EmailServices } from "../components/email-services";
import { SesPlanCard } from "../components/ses-plan-card";
import { SmsServices } from "../components/sms-services";
import { VdmStatusCard } from "../components/vdm-status-card";
import { toClientAccount } from "../lib/client-account";
import { loadAccountPage } from "../lib/load-account";

type ServicesPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
  searchParams: Promise<{
    region?: string | string[];
  }>;
};

export default async function ServicesPage({
  params,
  searchParams,
}: ServicesPageProps) {
  const { orgSlug, accountId } = await params;
  const { region: regionParam } = await searchParams;

  // An array is "present but not equal" and redirects like any other mismatch.
  const { account, organization, region, regional } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "/services",
    region: regionParam,
    require: "view",
  });

  // Props to client components are serialized whole: hand them the allowlist,
  // never the row (it carries the SES webhook secret).
  const clientAccount = toClientAccount(account, regional);

  return (
    <div className="space-y-6">
      <EmailServices
        awsAccountId={account.id}
        features={regional.features}
        organizationId={organization.id}
        orgSlug={orgSlug}
        region={region}
      />

      {/* AWS SES pricing plan - read-only, visible to every viewer */}
      <SesPlanCard account={clientAccount} />

      {/* Virtual Deliverability Manager - read-only, visible to every viewer */}
      <VdmStatusCard
        account={clientAccount}
        iamRoleHref={`/${orgSlug}/settings/aws-accounts/${accountId}#iam-role`}
      />

      {regional.smsEnabled && (
        <SmsServices
          features={regional.features}
          orgSlug={orgSlug}
          region={region}
        />
      )}
    </div>
  );
}
