import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getWorkflow, listWorkflowExecutions } from "@/actions/workflows";
import { getOrganizationWithMembership } from "@/lib/organization";
import { ExecutionsTable } from "./components/executions-table";

type ExecutionsPageProps = {
  params: Promise<{
    orgSlug: string;
    workflowId: string;
  }>;
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
};

export default async function ExecutionsPage({
  params,
  searchParams,
}: ExecutionsPageProps) {
  const { orgSlug, workflowId } = await params;
  const { page = "1", status } = await searchParams;

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

  const [workflowResult, executionsResult] = await Promise.all([
    getWorkflow(workflowId, orgWithMembership.id),
    listWorkflowExecutions(workflowId, orgWithMembership.id, {
      page: Number.parseInt(page, 10),
      pageSize: 50,
      status: status as
        | "pending"
        | "active"
        | "paused"
        | "waiting"
        | "completed"
        | "failed"
        | "cancelled"
        | undefined,
    }),
  ]);

  if (!workflowResult.success) {
    redirect(`/${orgSlug}/automations`);
  }

  const executions = executionsResult.success
    ? executionsResult.executions
    : [];
  const total = executionsResult.success ? executionsResult.total : 0;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">
          {workflowResult.workflow.name} — Executions
        </h1>
        <p className="text-muted-foreground">
          View execution history and step-by-step traces
        </p>
      </div>

      <ExecutionsTable
        executions={executions}
        orgSlug={orgSlug}
        total={total}
        workflowId={workflowId}
      />
    </div>
  );
}
