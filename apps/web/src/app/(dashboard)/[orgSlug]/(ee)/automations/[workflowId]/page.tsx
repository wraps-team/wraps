import {
  awsAccount,
  db,
  organizationExtension,
  segment,
  topic,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getWorkflow } from "@/actions/(ee)/workflows";
import { WorkflowBuilder } from "@/components/(ee)/workflow-builder/workflow-builder";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type WorkflowBuilderPageProps = {
  params: Promise<{
    orgSlug: string;
    workflowId: string;
  }>;
};

export default async function WorkflowBuilderPage({
  params,
}: WorkflowBuilderPageProps) {
  const { orgSlug, workflowId } = await params;

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

  // Fetch workflow
  const workflowResult = await getWorkflow(workflowId, orgWithMembership.id);

  if (!workflowResult.success) {
    redirect(`/${orgSlug}/automations`);
  }

  // Fetch all data in parallel - all queries depend only on orgWithMembership.id
  const [awsAccounts, topics, segments, orgDefaults] = await Promise.all([
    db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
      columns: {
        id: true,
        name: true,
        region: true,
        smsEnabled: true,
      },
    }),
    db.query.topic.findMany({
      where: eq(topic.organizationId, orgWithMembership.id),
      columns: {
        id: true,
        name: true,
      },
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
    db.query.segment.findMany({
      where: eq(segment.organizationId, orgWithMembership.id),
      columns: {
        id: true,
        name: true,
      },
      orderBy: (s, { asc }) => [asc(s.name)],
    }),
    db.query.organizationExtension.findFirst({
      where: eq(organizationExtension.organizationId, orgWithMembership.id),
      columns: {
        defaultAwsAccountId: true,
        defaultFrom: true,
        defaultFromName: true,
        defaultReplyTo: true,
        defaultSenderId: true,
      },
    }),
  ]);

  // Negative margins cancel out the dashboard layout padding
  return (
    <div className="-my-4 flex h-[calc(100dvh-var(--header-height)-1rem)] flex-col md:-my-6 md:h-[calc(100dvh-var(--header-height)-1.5rem)]">
      <WorkflowBuilder
        awsAccounts={awsAccounts}
        organizationId={orgWithMembership.id}
        orgDefaults={orgDefaults ?? null}
        orgSlug={orgSlug}
        segments={segments}
        topics={topics}
        userRole={orgWithMembership.userRole}
        workflow={workflowResult.workflow}
      />
    </div>
  );
}
