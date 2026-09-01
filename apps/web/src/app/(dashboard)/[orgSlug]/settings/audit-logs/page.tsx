import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listAuditLogs } from "@/actions/audit-log";
import { AuditLogViewer } from "@/components/audit-log-viewer";
import { FeatureGate } from "@/components/feature-gate";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess, getOrganizationPlan } from "@/lib/plan-limits";
import { getRequiredPlan, type PlanId } from "@/lib/plans";

type AuditLogsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });
  if (!session?.user) return { title: "Audit Logs" };
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );
  if (!orgWithMembership) return { title: "Audit Logs" };
  return {
    title: `Audit Logs | ${orgWithMembership.name} | Wraps`,
    description: `View security-relevant activity for ${orgWithMembership.name}`,
  };
}

export default async function AuditLogsPage({ params }: AuditLogsPageProps) {
  const { orgSlug } = await params;

  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) redirect("/auth");

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );
  if (!orgWithMembership) redirect("/");

  const [featureCheck, planId] = await Promise.all([
    checkFeatureAccess(orgWithMembership.id, "auditLog"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  const requiredPlan = getRequiredPlan("auditLog") || "pro";

  if (!featureCheck.allowed) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">Audit Logs</h1>
            <p className="text-muted-foreground">
              View a full history of security-relevant actions taken by your
              team
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <FeatureGate
            currentPlanId={planId as PlanId}
            feature="Audit Logs"
            featureDescription="View a full history of security-relevant actions taken by your team — API key creation, member changes, settings updates, and more."
            isAllowed={false}
            orgSlug={orgSlug}
            requiredPlanId={requiredPlan as PlanId}
          >
            {null}
          </FeatureGate>
        </div>
      </>
    );
  }

  const initialData = await listAuditLogs(orgWithMembership.id);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Audit Logs</h1>
        <p className="text-muted-foreground">
          A history of security-relevant actions taken by your team.
        </p>
      </div>

      <AuditLogViewer
        initialData={initialData}
        organizationId={orgWithMembership.id}
      />
    </div>
  );
}
