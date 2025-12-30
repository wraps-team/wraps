import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getVerifiedDomains, listAWSAccounts } from "@/actions/aws-accounts";
import {
  listSegmentsForBatch,
  listTemplatesForBatch,
  listTopicsForBatch,
} from "@/actions/batch";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess } from "@/lib/plan-limits";
import { BatchForm } from "./components/batch-form";

type NewBatchPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function NewBatchPage({ params }: NewBatchPageProps) {
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

  // Only owners and admins can create batch sends
  if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
    redirect(`/${orgSlug}/send`);
  }

  // Fetch AWS accounts, templates, topics, segments, and feature access in parallel
  const [
    awsAccountsResult,
    templatesResult,
    topicsResult,
    segmentsResult,
    topicsFeature,
    segmentsFeature,
    campaignsFeature,
  ] = await Promise.all([
    listAWSAccounts(orgWithMembership.id),
    listTemplatesForBatch(orgWithMembership.id),
    listTopicsForBatch(orgWithMembership.id),
    listSegmentsForBatch(orgWithMembership.id),
    checkFeatureAccess(orgWithMembership.id, "topics"),
    checkFeatureAccess(orgWithMembership.id, "segments"),
    checkFeatureAccess(orgWithMembership.id, "campaigns"),
  ]);

  const awsAccounts = awsAccountsResult.success
    ? awsAccountsResult.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        region: a.region,
      }))
    : [];

  const templates = templatesResult.success ? templatesResult.templates : [];
  const topics = topicsResult.success ? topicsResult.topics : [];
  const segments = segmentsResult.success ? segmentsResult.segments : [];

  // Fetch verified domains for the first AWS account
  let initialVerifiedDomains: { identity: string; type: "DOMAIN" | "EMAIL_ADDRESS" }[] = [];
  if (awsAccounts.length > 0) {
    const domainsResult = await getVerifiedDomains(
      awsAccounts[0].id,
      orgWithMembership.id
    );
    if (domainsResult.success) {
      initialVerifiedDomains = domainsResult.identities;
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <BatchForm
        awsAccounts={awsAccounts}
        initialVerifiedDomains={initialVerifiedDomains}
        organizationId={orgWithMembership.id}
        orgSlug={orgSlug}
        schedulingEnabled={campaignsFeature.allowed}
        segments={segments}
        segmentsEnabled={segmentsFeature.allowed}
        templates={templates}
        topics={topics}
        topicsEnabled={topicsFeature.allowed}
      />
    </div>
  );
}
