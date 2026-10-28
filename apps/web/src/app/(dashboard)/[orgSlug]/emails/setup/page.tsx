import { ArrowRight, Mail, RefreshCw, Terminal } from "lucide-react";
import { redirect } from "next/navigation";
import { CliCommand } from "@/components/cli-command";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type EmailSetupPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function EmailSetupPage({ params }: EmailSetupPageProps) {
  const { orgSlug } = await params;

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

  return (
    <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Mail className="size-6" />
          </EmptyMedia>
          <EmptyTitle>Email Not Configured</EmptyTitle>
          <EmptyDescription>
            Deploy email infrastructure to your AWS account to start sending
            emails with AWS SES. Get production-ready email sending in under 2
            minutes.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex w-full flex-col gap-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
                <Terminal className="size-4" />
                Deploy Email with CLI
              </h4>
              <CliCommand command="wraps email init" />
              <p className="mt-2 text-muted-foreground text-xs">
                This will deploy email infrastructure (SES, DynamoDB,
                EventBridge) to your AWS account.
              </p>
            </div>

            <div className="text-center text-muted-foreground text-sm">or</div>

            <div className="rounded-lg border bg-muted/50 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
                <RefreshCw className="size-4" />
                Already deployed? Update your console role
              </h4>
              <CliCommand command="wraps platform update-role" />
              <p className="mt-2 text-muted-foreground text-xs">
                If you&apos;ve already deployed email infrastructure, run this
                command to grant the dashboard access to your email resources.
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button asChild variant="outline">
              <a
                href="https://wraps.dev/docs/quickstart/email"
                rel="noopener noreferrer"
                target="_blank"
              >
                View Documentation
                <ArrowRight className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
