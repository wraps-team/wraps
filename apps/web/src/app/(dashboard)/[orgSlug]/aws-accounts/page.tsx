import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { redirect } from "next/navigation";
import { AWSAccountList } from "@/components/aws-account-list";
import { ConnectAccountSection } from "@/components/connect-account-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOrganizationWithMembership } from "@/lib/organization";

interface AWSAccountsPageProps {
  params: Promise<{
    orgSlug: string;
  }>;
}

export default async function AWSAccountsPage({
  params,
}: AWSAccountsPageProps) {
  const { orgSlug } = await params;

  // Get session
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  // Get organization and user's membership
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/dashboard");
  }

  // Get AWS accounts for this organization
  const awsAccounts = await db.query.awsAccount.findMany({
    where: (a, { eq }) => eq(a.organizationId, orgWithMembership.id),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  const canManageAccounts = ["owner", "admin"].includes(
    orgWithMembership.userRole
  );

  // Check permissions for each AWS account
  const { checkAWSAccountAccess } = await import(
    "@/lib/permissions/check-access"
  );

  const accountsWithPermissions = await Promise.all(
    awsAccounts.map(async (account) => {
      // Owners have all permissions
      if (orgWithMembership.userRole === "owner") {
        return {
          ...account,
          permissions: {
            canView: true,
            canSend: true,
            canManage: true,
          },
        };
      }

      // Check each permission for non-owners
      const [viewAccess, sendAccess, manageAccess] = await Promise.all([
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId: orgWithMembership.id,
          awsAccountId: account.id,
          permission: "view",
        }),
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId: orgWithMembership.id,
          awsAccountId: account.id,
          permission: "send",
        }),
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId: orgWithMembership.id,
          awsAccountId: account.id,
          permission: "manage",
        }),
      ]);

      return {
        ...account,
        permissions: {
          canView: viewAccess.authorized,
          canSend: sendAccess.authorized,
          canManage: manageAccess.authorized,
        },
      };
    })
  );

  return (
    <>
      {/* Header */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-2xl tracking-tight">AWS Accounts</h1>
            <p className="text-muted-foreground">
              Manage AWS accounts and permissions
            </p>
          </div>
          {canManageAccounts && (
            <Button asChild>
              <a href="#connect-account">Connect AWS Account</a>
            </Button>
          )}
        </div>
      </div>

      {/* AWS Accounts List */}
      <div className="px-4 lg:px-6">
        {accountsWithPermissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <p className="mb-4 text-muted-foreground">
                No AWS accounts connected yet
              </p>
              {canManageAccounts && (
                <p className="text-muted-foreground text-sm">
                  Connect your first AWS account to get started
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <AWSAccountList
            accounts={accountsWithPermissions}
            organizationId={orgWithMembership.id}
            orgSlug={orgSlug}
          />
        )}
      </div>

      {/* Connect AWS Account Form */}
      {canManageAccounts && (
        <ConnectAccountSection organizationId={orgWithMembership.id} />
      )}
    </>
  );
}
