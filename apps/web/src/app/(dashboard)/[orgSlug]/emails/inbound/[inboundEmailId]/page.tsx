import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getInboundEmail } from "@/lib/aws/s3-inbound";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";
import { EmailPreview } from "./components/email-preview";

type InboundDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    inboundEmailId: string;
  }>;
};

export default async function InboundEmailDetailPage({
  params,
}: InboundDetailPageProps) {
  const { orgSlug, inboundEmailId } = await params;

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

  // Get all AWS accounts for this org
  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, orgWithMembership.id),
  });

  // Try each account with inbound configured to find this email
  const inboundAccounts = accounts.filter(
    (a) => a.features?.email?.inboundBucketName
  );

  let email = null;
  for (const account of inboundAccounts) {
    try {
      email = await getInboundEmail({
        awsAccountId: account.id,
        emailId: inboundEmailId,
      });
      if (email) {
        break;
      }
    } catch {
      // Try next account
    }
  }

  if (!email) {
    return (
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Email Not Found</h1>
          <p className="text-muted-foreground">
            This inbound email could not be found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6">
      <EmailPreview email={email} orgSlug={orgSlug} />
    </div>
  );
}
