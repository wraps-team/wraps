import { auth } from "@wraps/auth";
import { db, eq, scimProvider, ssoProvider } from "@wraps/db";
import { redirect } from "next/navigation";
import { getExistingVerificationToken } from "@/actions/sso";
import { FeatureGate } from "@/components/feature-gate";
import { OrganizationSettingsSso } from "@/components/organization-settings-sso";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess, getOrganizationPlan } from "@/lib/plan-limits";
import { getRequiredPlan, type PlanId } from "@/lib/plans";

type SsoPageProps = {
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
  if (!session?.user) return { title: "SSO & SCIM" };
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );
  if (!orgWithMembership) return { title: "SSO & SCIM" };
  return {
    title: `SSO & SCIM | ${orgWithMembership.name} | Wraps`,
    description: `Configure single sign-on and SCIM provisioning for ${orgWithMembership.name}`,
  };
}

export default async function SsoPage({ params }: SsoPageProps) {
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
    checkFeatureAccess(orgWithMembership.id, "sso"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  const requiredPlan = getRequiredPlan("sso") || "business";

  if (!featureCheck.allowed) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">SSO & SCIM</h1>
            <p className="text-muted-foreground">
              Single sign-on and SCIM user provisioning for your organization
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <FeatureGate
            currentPlanId={planId as PlanId}
            feature="SSO & SCIM"
            featureDescription="Enable OIDC-based single sign-on and automate user provisioning with SCIM for enterprise identity providers like Okta and Azure AD."
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

  const [ssoProviderRecord, existingScimProvider] = await Promise.all([
    db.query.ssoProvider.findFirst({
      where: eq(ssoProvider.organizationId, orgWithMembership.id),
    }),
    db.query.scimProvider.findFirst({
      where: eq(scimProvider.organizationId, orgWithMembership.id),
    }),
  ]);

  const pendingVerificationToken =
    ssoProviderRecord && !ssoProviderRecord.domainVerified
      ? await getExistingVerificationToken(
          orgWithMembership.id,
          ssoProviderRecord.providerId
        )
      : null;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">SSO & SCIM</h1>
        <p className="text-muted-foreground">
          Configure single sign-on and user provisioning for your organization.
        </p>
      </div>

      <OrganizationSettingsSso
        existingProvider={ssoProviderRecord ?? null}
        existingScimProvider={existingScimProvider ?? null}
        initialVerificationExpiresAt={
          pendingVerificationToken?.expiresAt ?? null
        }
        initialVerificationToken={pendingVerificationToken?.token ?? null}
        organization={{
          id: orgWithMembership.id,
          name: orgWithMembership.name,
          slug: orgWithMembership.slug ?? orgSlug,
        }}
        userRole={orgWithMembership.userRole}
      />
    </div>
  );
}
