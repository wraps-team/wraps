import { auth } from "@wraps/auth";
import { GlobeIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listSendingDomains } from "@/actions/domains";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { SendingDomainsView } from "./components/sending-domains-view";

type DomainsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export async function generateMetadata({ params }: DomainsPageProps) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });
  if (!session?.user) {
    return { title: "Sending Domains" };
  }
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );
  if (!orgWithMembership) {
    return { title: "Sending Domains" };
  }
  return {
    title: `Sending Domains | ${orgWithMembership.name} | Wraps`,
    description: `Verified sending identities and outstanding DNS records for ${orgWithMembership.name}`,
  };
}

export default async function DomainsPage({ params }: DomainsPageProps) {
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
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Sending Domains</EmptyTitle>
            <EmptyDescription>
              See which domains and addresses are verified for sending, and the
              DNS records still outstanding for each — read live from your AWS
              account.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/setup`}>Connect AWS to see domains</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const result = await listSendingDomains(orgWithMembership.id);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Sending Domains</h1>
        <p className="text-muted-foreground">
          Domains and addresses verified for sending, read live from your AWS
          account.
        </p>
      </div>

      <SendingDomainsView
        organizationId={orgWithMembership.id}
        orgSlug={orgSlug}
        result={result}
      />
    </div>
  );
}
