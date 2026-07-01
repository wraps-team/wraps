import { auth } from "@wraps/auth";
import { Rocket } from "lucide-react";
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
import { ProductionAccessConsole } from "../components/production-access-console";

type ProductionAccessPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function ProductionAccessPage({
  params,
}: ProductionAccessPageProps) {
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
              <Rocket className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Guided production access</EmptyTitle>
            <EmptyDescription>
              Exit the SES sandbox and raise your sending quota with a guided,
              pre-filled AWS support request. Connect AWS to check your readiness
              and prepare the request.
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
            Guided production access &amp; quota
          </h1>
          <p className="text-muted-foreground">
            Turn the scary AWS support ticket into a guided, pre-filled flow.
            Only AWS can approve — we do everything up to submit.
          </p>
        </div>
      </div>
      <div className="@container/main px-4 lg:px-6">
        <ProductionAccessConsole />
      </div>
    </>
  );
}
