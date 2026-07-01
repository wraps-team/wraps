import { auth } from "@wraps/auth";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { DeliverabilityOverview } from "./components/deliverability-overview";

type DeliverabilityPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function DeliverabilityPage({
  params,
}: DeliverabilityPageProps) {
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
              <ShieldCheck className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Deliverability console</EmptyTitle>
            <EmptyDescription>
              This is your SES operations hub — account reputation, IP pools, and
              guided AWS production access, all running in your own AWS account.
              Connect AWS to see where you stand.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/${orgSlug}/setup`}>Connect AWS to begin</Link>
              </Button>
              <Button asChild variant="ghost">
                <a
                  href="https://wraps.dev/docs"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View documentation
                </a>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Deliverability</h1>
          <p className="text-muted-foreground">
            Am I safe? Every SES operational risk — reputation, production
            access, quota, domain auth, and cost — in one place.
          </p>
        </div>
      </div>
      <div className="@container/main px-4 lg:px-6">
        <DeliverabilityOverview orgSlug={orgSlug} />
      </div>
    </>
  );
}
