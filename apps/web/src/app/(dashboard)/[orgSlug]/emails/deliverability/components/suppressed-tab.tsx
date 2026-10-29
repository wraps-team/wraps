"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { listSuppressions } from "@/actions/suppressions";
import { Button } from "@/components/ui/button";
import { AddSuppressionDialog } from "../../suppressions/components/add-suppression-dialog";
import {
  DeniedAccountsBanner,
  DeniedState,
  NothingSuppressedState,
  UnreachableAccountsBanner,
} from "../../suppressions/components/suppression-banners";
import { SuppressionsTable } from "../../suppressions/components/suppressions-table";
import type { SuppressionRow } from "../../suppressions/types";

type SuppressedTabProps = {
  organizationId: string;
  orgSlug: string;
  accounts: { id: string; name: string; region: string }[];
  /** Bumped by the panel after a suppress, so this tab reads the list again. */
  refreshKey: number;
};

/**
 * The SES suppression list, read live from each account. It keeps the banners,
 * the all-denied state and the table the standalone page had, and adds the
 * Add address dialog beside the search box.
 */
export function SuppressedTab({
  organizationId,
  orgSlug,
  accounts,
  refreshKey,
}: SuppressedTabProps) {
  const query = useQuery({
    queryKey: ["suppressions", organizationId, refreshKey],
    queryFn: () => listSuppressions(organizationId, { limit: 50 }),
  });

  const refetch = () => {
    query.refetch();
  };

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" data-testid="suppressed-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const result = query.data;
  if (query.isError || !result || !result.success) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          {result && !result.success
            ? result.error
            : "Could not load the suppression list. Try again."}
        </p>
        <Button onClick={refetch} size="sm" variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  const { page } = result;

  const allDenied =
    accounts.length > 0 && page.deniedAccountIds.length === accounts.length;

  if (allDenied) {
    const iamRoleHref =
      accounts.length === 1
        ? `/${orgSlug}/settings/aws-accounts/${accounts[0].id}/connection#iam-role`
        : `/${orgSlug}/settings/aws-accounts`;
    return <DeniedState iamRoleHref={iamRoleHref} orgSlug={orgSlug} />;
  }

  const rows: SuppressionRow[] = page.entries.map((entry) => ({
    email: entry.email,
    reason: entry.reason,
    lastUpdated: entry.lastUpdated,
    awsAccountId: entry.awsAccountId,
    region: entry.region,
  }));

  const addButton = (
    <AddSuppressionDialog
      accounts={accounts}
      onAdded={refetch}
      organizationId={organizationId}
    />
  );

  return (
    <div className="space-y-4">
      {page.deniedAccountIds.length > 0 ? (
        <DeniedAccountsBanner
          count={page.deniedAccountIds.length}
          orgSlug={orgSlug}
        />
      ) : null}

      {page.unreachableAccountIds.length > 0 ? (
        <UnreachableAccountsBanner
          count={page.unreachableAccountIds.length}
          orgSlug={orgSlug}
        />
      ) : null}

      {rows.length === 0 ? (
        <>
          <div className="flex justify-end">{addButton}</div>
          <NothingSuppressedState />
        </>
      ) : (
        <SuppressionsTable
          initialHasMore={page.hasMore}
          initialNextToken={page.nextToken}
          initialRows={rows}
          key={`${refreshKey}:${query.dataUpdatedAt}`}
          onRemoved={refetch}
          organizationId={organizationId}
          orgSlug={orgSlug}
          toolbarEnd={addButton}
        />
      )}
    </div>
  );
}
