import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";
import { getSetupStatus } from "@/lib/setup-status";
import { GettingStartedDashboard } from "../components/getting-started-dashboard";

type SetupPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SetupPage({ params }: SetupPageProps) {
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

  const { setupStatus, awsAccount: awsAccountData } = await getSetupStatus(
    orgWithMembership.id
  );

  const requiredSteps = [
    setupStatus.hasAwsAccount,
    setupStatus.hasPlatformConnection,
    setupStatus.hasVerifiedDomain,
    setupStatus.hasSentEmail,
  ];
  const completedRequired = requiredSteps.filter(Boolean).length;
  const completionPercent = Math.round(
    (completedRequired / requiredSteps.length) * 100
  );

  // Already fully set up — redirect to dashboard
  if (completionPercent === 100) {
    redirect(`/${orgSlug}`);
  }

  return (
    <GettingStartedDashboard
      awsAccount={awsAccountData}
      completionPercent={completionPercent}
      organizationId={orgWithMembership.id}
      organizationName={orgWithMembership.name}
      orgSlug={orgSlug}
      setupStatus={setupStatus}
      userEmail={session.user.email}
    />
  );
}
