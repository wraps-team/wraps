import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { Ban, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listSuppressions } from "@/actions/suppressions";
import { CliCommand } from "@/components/cli-command";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { SuppressionsTable } from "./components/suppressions-table";
import type { SuppressionRow } from "./types";

type SuppressionsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export async function generateMetadata({ params }: SuppressionsPageProps) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });
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

/**
 * The console role needs its permissions rewritten to grant SES suppression
 * read/delete. Every account connected before this shipped hits this state —
 * see plan 296's "consent cost" section. Wording mirrors the shipped
 * IAMConfiguration card
 * (settings/aws-accounts/[accountId]/components/iam-configuration.tsx)
 * rather than inventing new copy; the CLI is presented first because, unlike
 * that settings card, most connected accounts have no CloudFormation stack
 * to update at all.
 */
function DeniedState({
  orgSlug,
  iamRoleHref,
}: {
  orgSlug: string;
  iamRoleHref: string;
}) {
  return (
    <Empty className="max-w-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Wraps needs updated permissions</EmptyTitle>
        <EmptyDescription>
          Browsing and removing suppressions needs SES suppression-list access
          that this AWS account&apos;s console role does not grant yet. Rewrite
          its permissions with one of the two routes below.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex w-full flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
              <Terminal className="size-4" />
              If you connected with the CLI
            </h4>
            <CliCommand command="wraps platform update-role" />
            <p className="mt-2 text-muted-foreground text-xs">
              Run this on the machine that deployed your Wraps infrastructure,
              in the same AWS account and region — it exits with &quot;No Wraps
              deployment found&quot; otherwise.
            </p>
          </div>

          <div className="text-center text-muted-foreground text-sm">or</div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
              <RefreshCw className="size-4" />
              If you deployed the role with CloudFormation
            </h4>
            <p className="text-muted-foreground text-xs">
              Open the <code className="font-mono">wraps-console-access</code>{" "}
              stack, choose <strong>Update</strong> →{" "}
              <strong>Replace existing template</strong>, and keep the External
              ID as-is. Details, including the template URL, are on the
              account&apos;s{" "}
              <Link className="underline underline-offset-4" href={iamRoleHref}>
                IAM Role Configuration
              </Link>{" "}
              card.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/${orgSlug}/settings/aws-accounts`}>
              View AWS Accounts settings
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export default async function SuppressionsPage({
  params,
}: SuppressionsPageProps) {
  const { orgSlug } = await params;

  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

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
    columns: { id: true },
  });

  const allDenied =
    accounts.length > 0 && page.deniedAccountIds.length === accounts.length;

  if (allDenied) {
    const iamRoleHref =
      accounts.length === 1
        ? `/${orgSlug}/settings/aws-accounts/${accounts[0].id}#iam-role`
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
      <div>
        <h1 className="font-bold text-3xl">Suppression List</h1>
        <p className="text-muted-foreground">
          Addresses AWS SES will not send to, read live from your AWS account.
        </p>
      </div>

      {page.deniedAccountIds.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 p-3 text-amber-700 text-sm dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {page.deniedAccountIds.length === 1
              ? "1 AWS account"
              : `${page.deniedAccountIds.length} AWS accounts`}{" "}
            need their console role permissions refreshed, so their suppressions
            are not shown here. Run{" "}
            <code className="font-mono">wraps platform update-role</code> for
            that account, or see{" "}
            <Link
              className="underline underline-offset-4"
              href={`/${orgSlug}/settings/aws-accounts`}
            >
              AWS Accounts settings
            </Link>
            .
          </div>
        </div>
      )}

      {page.unreachableAccountIds.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 p-3 text-amber-700 text-sm dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {page.unreachableAccountIds.length === 1
              ? "1 AWS account"
              : `${page.unreachableAccountIds.length} AWS accounts`}{" "}
            could not be read, so its suppressions are not shown here. Check its
            connection under{" "}
            <Link
              className="underline underline-offset-4"
              href={`/${orgSlug}/settings/aws-accounts`}
            >
              AWS Accounts settings
            </Link>
            .
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Ban className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Nothing suppressed</EmptyTitle>
            <EmptyDescription>
              Good news — SES has not suppressed any addresses for this account.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <SuppressionsTable
          initialHasMore={page.hasMore}
          initialNextToken={page.nextToken}
          initialRows={rows}
          organizationId={orgWithMembership.id}
        />
      )}
    </div>
  );
}
