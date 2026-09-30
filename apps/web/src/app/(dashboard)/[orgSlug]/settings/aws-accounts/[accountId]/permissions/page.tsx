import { redirect } from "next/navigation";

type PermissionsPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
};

// Kept for stored links: the Access tab replaced this page.
export default async function PermissionsPage({
  params,
}: PermissionsPageProps) {
  const { orgSlug, accountId } = await params;
  redirect(`/${orgSlug}/settings/aws-accounts/${accountId}/access`);
}
