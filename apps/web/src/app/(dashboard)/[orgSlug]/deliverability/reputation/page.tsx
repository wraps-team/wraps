import { auth } from "@wraps/auth";
import { Gauge } from "lucide-react";
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
import { ReputationConsole } from "../components/reputation-console";

type ReputationPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function ReputationPage({ params }: ReputationPageProps) {
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
              <Gauge className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Reputation console</EmptyTitle>
            <EmptyDescription>
              Live bounce and complaint rates plotted against AWS&apos;s actual
              enforcement lines, with a reversible kill switch. Connect AWS to
              start monitoring your account reputation.
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
            Reputation console
          </h1>
          <p className="text-muted-foreground">
            Your raw AWS account reputation against the lines that trigger
            review and pauses — plus a seatbelt to stop sending in seconds.
          </p>
        </div>
      </div>
      <div className="@container/main px-4 lg:px-6">
        <ReputationConsole />
      </div>
    </>
  );
}
