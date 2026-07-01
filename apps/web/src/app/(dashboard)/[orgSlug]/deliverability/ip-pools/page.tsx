import { auth } from "@wraps/auth";
import { Network } from "lucide-react";
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
import { IpPoolsConsole } from "../components/ip-pools-console";

type IpPoolsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function IpPoolsPage({ params }: IpPoolsPageProps) {
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
              <Network className="size-6" />
            </EmptyMedia>
            <EmptyTitle>IP pools &amp; dedicated IPs</EmptyTitle>
            <EmptyDescription>
              Segment transactional and marketing traffic across dedicated IP
              pools, each with its own warmup schedule, blocklist monitoring, and
              reputation. Connect AWS to provision dedicated IPs.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/setup`}>Connect AWS</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">
            IP pools &amp; dedicated IPs
          </h1>
          <p className="text-muted-foreground">
            The topology a managed provider hides — dedicated IPs, warmup curves,
            blocklist status, and per-IP reputation, all under your control.
          </p>
        </div>
      </div>
      <div className="@container/main px-4 lg:px-6">
        <IpPoolsConsole />
      </div>
    </>
  );
}
