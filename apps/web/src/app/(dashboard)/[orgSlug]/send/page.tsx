import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listBatchSends } from "@/actions/batch";
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
  const { page = "1", pageSize = "20" } = await searchParams;

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

  // Fetch batch sends
  const batchesResult = await listBatchSends(orgWithMembership.id, {
    page: Number.parseInt(page, 10),
    pageSize: Number.parseInt(pageSize, 10),
  });

  const batches = batchesResult.success ? batchesResult.batches : [];

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
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
  );
}
