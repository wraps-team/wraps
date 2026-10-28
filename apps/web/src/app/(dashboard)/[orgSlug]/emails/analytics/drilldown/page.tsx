import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { DrilldownShell } from "./components/drilldown-shell";

type DrilldownPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

/**
 * "Why this rate": the sends behind a bounce, complaint or suppression rate.
 * The shell reads its URL state on the client. This page only checks the
 * session, membership and AWS accounts, as the analytics page does.
 */
export default async function DrilldownPage({ params }: DrilldownPageProps) {
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
    // The analytics page renders the connect prompt for an org without accounts.
    redirect(`/${orgSlug}/emails/analytics`);
  }

  return (
    <div className="px-4 lg:px-6">
      <DrilldownShell orgSlug={orgSlug} />
    </div>
  );
}
