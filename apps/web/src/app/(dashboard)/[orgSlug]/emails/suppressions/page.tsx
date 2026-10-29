import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { Ban, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listSuppressions } from "@/actions/suppressions";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { AddSuppressionDialog } from "./components/add-suppression-dialog";
import {
  DeniedAccountsBanner,
  DeniedState,
  NothingSuppressedState,
  UnreachableAccountsBanner,
} from "./components/suppression-banners";
import { SuppressionsTable } from "./components/suppressions-table";
import type { SuppressionRow } from "./types";

type SuppressionsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export async function generateMetadata({ params }: SuppressionsPageProps) {
  const { orgSlug } = await params;
  const session = await getCurrentSession();
  if (!session?.user) {
    return { title: "Suppression List" };
  }
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );
  if (!orgWithMembership) {
    return { title: "Suppression List" };
  }
  return {
    title: `Suppression List | ${orgWithMembership.name} | Wraps`,
    description: `Addresses AWS SES has suppressed for ${orgWithMembership.name}`,
  };
}

export default async function SuppressionsPage({
  params,
}: SuppressionsPageProps) {
  const { orgSlug } = await params;

  const session = await getCurrentSession();

  if (!session?.user) {
    redirect("/auth");
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/");
  }

  const hasAccounts = await checkHasAwsAccounts(orgWithMembership.id);

  if (!hasAccounts) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Ban className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Suppression List</EmptyTitle>
            <EmptyDescription>
              Browse, search, and remove addresses AWS SES has suppressed for
              your account — read live from your AWS account.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/setup`}>
                Connect AWS to see suppressions
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const result = await listSuppressions(orgWithMembership.id, { limit: 50 });

  if (!result.success) {
    return (
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {result.error}
        </div>
      </div>
    );
  }

  const { page } = result;

  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, orgWithMembership.id),
    columns: { id: true, name: true, region: true },
  });

  const allDenied =
    accounts.length > 0 && page.deniedAccountIds.length === accounts.length;

  if (allDenied) {
    const iamRoleHref =
      accounts.length === 1
        ? `/${orgSlug}/settings/aws-accounts/${accounts[0].id}/connection#iam-role`
        : `/${orgSlug}/settings/aws-accounts`;

    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <DeniedState iamRoleHref={iamRoleHref} orgSlug={orgSlug} />
      </div>
    );
  }

  const rows: SuppressionRow[] = page.entries.map((entry) => ({
    email: entry.email,
    reason: entry.reason,
    lastUpdated: entry.lastUpdated,
    awsAccountId: entry.awsAccountId,
    region: entry.region,
  }));

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Suppression List</h1>
          <p className="text-muted-foreground">
            Addresses AWS SES will not send to, read live from your AWS account.
          </p>
        </div>
        <AddSuppressionDialog
          accounts={accounts}
          organizationId={orgWithMembership.id}
        />
      </div>

      {page.deniedAccountIds.length > 0 && (
        <DeniedAccountsBanner
          count={page.deniedAccountIds.length}
          orgSlug={orgSlug}
        />
      )}

      {page.unreachableAccountIds.length > 0 && (
        <UnreachableAccountsBanner
          count={page.unreachableAccountIds.length}
          orgSlug={orgSlug}
        />
      )}

      {rows.length === 0 ? (
        <NothingSuppressedState />
      ) : (
        <SuppressionsTable
          initialHasMore={page.hasMore}
          initialNextToken={page.nextToken}
          initialRows={rows}
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
        />
      )}
    </div>
  );
}
