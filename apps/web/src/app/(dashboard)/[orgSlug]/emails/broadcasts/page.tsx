import { auth } from "@wraps/auth";
import { AlertTriangle, Send } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatchSends } from "@/actions/batch";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { BatchStatus } from "@/lib/batch";
import { getOrganizationWithMembership } from "@/lib/organization";
import { BatchTable } from "./components/batch-table";

type SendPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
  }>;
};

export default async function SendPage({
  params,
  searchParams,
}: SendPageProps) {
  const { orgSlug } = await params;
  const { page = "1", pageSize = "20", search, status } = await searchParams;

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

  const canManage =
    orgWithMembership.userRole === "owner" ||
    orgWithMembership.userRole === "admin";

  // Fetch batch sends
  const batchesResult = await listBatchSends(orgWithMembership.id, {
    page: Number.parseInt(page, 10),
    pageSize: Number.parseInt(pageSize, 10),
    search,
    status: status as BatchStatus | undefined,
  });

  const batches = batchesResult.success ? batchesResult.batches : [];
  const total = batchesResult.success ? batchesResult.total : 0;

  const hasFilters = !!(search || status);
  const isEmpty = total === 0 && !hasFilters;

  if (!batchesResult.success) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border border-destructive/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertTriangle className="size-6 text-destructive" />
            </EmptyMedia>
            <EmptyTitle>We couldn't load your broadcasts.</EmptyTitle>
            <EmptyDescription>{batchesResult.error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/emails/broadcasts`}>Try again</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Send className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Broadcasts</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Send targeted email campaigns to your contacts. Pick a template, choose an audience, and send — all at AWS pricing."
                : "No broadcasts yet. Ask an owner or admin to create one."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <Button asChild>
                <Link href={`/${orgSlug}/emails/broadcasts/new`}>
                  Create a broadcast
                </Link>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Broadcasts</h1>
          <p className="text-muted-foreground">Send emails to your contacts</p>
        </div>
      </div>

      {/* Batch Table */}
      <div className="@container/main px-4 lg:px-6">
        <BatchTable
          batches={batches}
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          page={Number.parseInt(page, 10)}
          pageSize={Number.parseInt(pageSize, 10)}
          search={search}
          status={status}
          total={total}
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
  );
}
