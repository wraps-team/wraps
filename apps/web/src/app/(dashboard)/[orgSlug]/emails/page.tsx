import { auth } from "@wraps/auth";
import { Mail } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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
import { checkHasAwsAccounts, getEmailsListStatus } from "@/lib/setup-status";
import { EmailAnalytics } from "./components/email-analytics";
import { EmailsTable } from "./components/emails-table";
import { EmailsTableSkeleton } from "./components/emails-table-skeleton";

type EmailsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    days?: string;
    q?: string;
    /** `asc` for oldest first. Absent or anything else means newest first. */
    sort?: string;
    status?: string;
  }>;
};

export default async function EmailsPage({
  params,
  searchParams,
}: EmailsPageProps) {
  const { orgSlug } = await params;
  const { days = "7", q, sort, status } = await searchParams;

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

  // Check if org has any AWS accounts before fetching
  const hasAccounts = await checkHasAwsAccounts(orgWithMembership.id);

  if (!hasAccounts) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Mail className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Email Activity</EmptyTitle>
            <EmptyDescription>
              See every email your application sends — delivery status, opens,
              clicks, and bounces in real time.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/${orgSlug}/setup`}>
                  Connect AWS to start sending
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <a
                  href="https://wraps.dev/docs/quickstart/email"
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
      {/*
        The page needs a heading - without one assistive tech has no page
        identity and every message tab reads "{Org} | Wraps" (audit F14) - but
        it does not need to occupy a block of its own. The sidebar already says
        Emails, and the two sections below name themselves, so on screen this
        was a third label for something nobody was unsure about.
      */}
      <h1 className="sr-only">Emails</h1>

      {/* Email Analytics */}
      <div className="px-4 lg:px-6">
        <EmailAnalytics orgSlug={orgSlug} />
      </div>

      {/*
        The table's own boundary (audit finding F16). The table needs two extra
        facts from the database to tell its zero-states apart; the chart needs
        none. Without a boundary here the whole page - chart included - waits on
        that query before a single byte streams.
      */}
      <div className="@container/main px-4 lg:px-6">
        <Suspense fallback={<EmailsTableSkeleton />}>
          <EmailsTableSection
            days={Number.parseInt(days, 10)}
            organizationId={orgWithMembership.id}
            orgSlug={orgSlug}
            search={q}
            sort={sort}
            status={status}
          />
        </Suspense>
      </div>
    </>
  );
}

type EmailsTableSectionProps = {
  days: number;
  organizationId: string;
  orgSlug: string;
  search?: string;
  sort?: string;
  status?: string;
};

async function EmailsTableSection({
  days,
  organizationId,
  orgSlug,
  search,
  sort,
  status,
}: EmailsTableSectionProps) {
  const { hasEverSent, sandboxStatus } =
    await getEmailsListStatus(organizationId);

  return (
    <EmailsTable
      days={days}
      hasEverSent={hasEverSent}
      organizationId={organizationId}
      orgSlug={orgSlug}
      sandboxStatus={sandboxStatus}
      search={search}
      sort={sort}
      status={status}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    return { title: "Emails" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Emails | ${orgWithMembership.name}`,
    description: `Message history and delivery events for ${orgWithMembership.name}`,
  };
}
