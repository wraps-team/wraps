import { db } from "@wraps/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { QuotaReserve } from "../components/quota-reserve";
import { RemoveAccountCard } from "../components/remove-account-card";
import { RenameAccountForm } from "../components/rename-account-form";
import { toClientAccount } from "../lib/client-account";
import { loadAccountPage } from "../lib/load-account";

type SettingsPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
  searchParams: Promise<{
    region?: string | string[];
  }>;
};

const SETUP_METHOD_LABELS: Record<string, string> = {
  cfn_infrastructure: "CloudFormation (full stack)",
  cfn_console_role: "CloudFormation (role only)",
  cli_connect: "CLI",
  onboarding_wizard: "onboarding",
};

export default async function SettingsPage({
  params,
  searchParams,
}: SettingsPageProps) {
  const { orgSlug, accountId } = await params;
  const { region: regionParam } = await searchParams;

  // Mostly account-scoped, but the quota reserve is regional, so accept `region`.
  const { account, organization, region, regional } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "/settings",
    region: regionParam,
    require: "manage",
  });

  // Creator lookup is org-scoped: only a member of this org is named.
  const creatorId = account.createdBy;
  const creator = creatorId
    ? await db.query.member.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.userId, creatorId), eq(m.organizationId, organization.id)),
        with: { user: true },
      })
    : null;

  const setupLabel = account.setupMethod
    ? SETUP_METHOD_LABELS[account.setupMethod]
    : null;
  const addedOn = account.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Props to client components are serialized whole: hand them the allowlist,
  // never the row (it carries the SES webhook secret).
  const clientAccount = toClientAccount(account, regional);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Give this account a name you will recognise in lists and alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RenameAccountForm
            awsAccountId={account.id}
            initialName={account.name}
            organizationId={organization.id}
          />
          <p className="text-muted-foreground text-sm">
            Added {addedOn}
            {creator ? ` by ${creator.user.name}` : ""}
            {setupLabel ? ` · connected via ${setupLabel}` : ""}
          </p>
        </CardContent>
      </Card>

      <QuotaReserve account={clientAccount} region={region} />

      <RemoveAccountCard
        accountName={account.name}
        awsAccountId={account.id}
        organizationId={organization.id}
        orgSlug={orgSlug}
      />
    </div>
  );
}
