import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { ArrowRight, Inbox, RefreshCw, Terminal } from "lucide-react";
import { unstable_cache } from "next/cache";
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
import { listInboundEmails } from "@/lib/aws/s3-inbound";
import { logger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { InboundAnalytics } from "./components/inbound-analytics";
import { InboundEmailsTable } from "./components/inbound-emails-table";
import type { InboundEmailListItem } from "./types";

type InboundPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

async function fetchInboundEmails(
  organizationId: string
): Promise<{ emails: InboundEmailListItem[]; hasInbound: boolean }> {
  try {
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
    });

    if (accounts.length === 0) {
      return { emails: [], hasInbound: false };
    }

    const inboundAccounts = accounts.filter(
      (a) => a.features?.email?.inboundBucketName
    );

    if (inboundAccounts.length === 0) {
      return { emails: [], hasInbound: false };
    }

    const allResults = await Promise.all(
      inboundAccounts.map(async (account) => {
        try {
          const result = await listInboundEmails({
            awsAccountId: account.id,
            limit: 100,
          });

          return result.emails.map((email) => ({
            id: email.emailId,
            from: email.from.name
              ? `${email.from.name} <${email.from.address}>`
              : email.from.address,
            to: email.to.map((t) =>
              t.name ? `${t.name} <${t.address}>` : t.address
            ),
            subject: email.subject,
            receivedAt: email.receivedAt,
            hasAttachments: email.hasAttachments,
            attachmentCount: email.attachmentCount,
            spamVerdict: email.spamVerdict,
            virusVerdict: email.virusVerdict,
            accountId: account.id,
          }));
        } catch (error) {
          logger.warn(
            {
              accountId: account.id,
              awsAccountId: account.accountId,
              error: error instanceof Error ? error.message : String(error),
            },
            "fetchInboundEmails: failed for account"
          );
          return [];
        }
      })
    );

    return {
      emails: allResults
        .flat()
        .sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ),
      hasInbound: true,
    };
  } catch (error) {
    logger.error({ err: error }, "fetchInboundEmails failed");
    return { emails: [], hasInbound: false };
  }
}

export default async function InboundEmailsPage({ params }: InboundPageProps) {
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

  const getCachedInboundEmails = unstable_cache(
    fetchInboundEmails,
    [`inbound-emails-${orgWithMembership.id}`],
    { revalidate: 60, tags: [`inbound-emails-${orgWithMembership.id}`] }
  );

  const { emails, hasInbound } = await getCachedInboundEmails(
    orgWithMembership.id
  );

  if (!hasInbound) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Inbound Email Not Configured</EmptyTitle>
            <EmptyDescription>
              Deploy inbound email infrastructure to receive emails in your AWS
              account. Incoming emails are parsed and stored in S3 with spam
              filtering and attachment extraction.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex w-full flex-col gap-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <Terminal className="size-4" />
                  Deploy Inbound Email with CLI
                </h4>
                <CliCommand command="wraps email inbound init" />
                <p className="mt-2 text-muted-foreground text-xs">
                  This will deploy inbound email infrastructure (SES Receipt
                  Rules, S3, Lambda) to your AWS account.
                </p>
              </div>

              <div className="text-center text-muted-foreground text-sm">
                or
              </div>

              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <RefreshCw className="size-4" />
                  Already deployed? Scan your features
                </h4>
                <CliCommand command="wraps platform update-role" />
                <p className="mt-2 text-muted-foreground text-xs">
                  If you&apos;ve already deployed inbound email, run this
                  command to grant the dashboard access, then scan features from
                  Settings &gt; AWS Accounts.
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline">
                <a
                  href="https://wraps.dev/docs/quickstart/email/inbound"
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

  return (
    <>
      {/* Inbound Analytics */}
      <div className="px-4 lg:px-6">
        <InboundAnalytics
          emails={emails}
          organizationId={orgWithMembership.id}
        />
      </div>

      <div className="@container/main px-4 lg:px-6">
        <InboundEmailsTable data={emails} orgSlug={orgSlug} />
      </div>
    </>
  );
}
