import { auth } from "@wraps/auth";
import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { listContacts } from "@/actions/contacts";
import { UNAUTHORIZED } from "@/actions/shared/org-action";
import { listTopics } from "@/actions/topics";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { isEmailStatus } from "@/lib/contacts";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess } from "@/lib/plan-limits";
import { ContactAnalytics } from "./components/contact-analytics";
import { ContactsEmptyState } from "./components/contacts-empty-state";
import { ContactsTable } from "./components/contacts-table";

type ContactsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    emailStatus?: string;
    topicId?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
};

export default async function ContactsPage({
  params,
  searchParams,
}: ContactsPageProps) {
  const { orgSlug } = await params;
  const {
    page = "1",
    pageSize = "50",
    search,
    emailStatus,
    topicId,
    sortBy,
    sortDir,
  } = await searchParams;

  // Straight from the URL, so it is not necessarily one of the five statuses
  // the filter can serve. An unknown value is dropped rather than passed down:
  // the column is plain `text()`, so `WHERE email_status = 'bogus'` is a silent
  // zero-row result, not an error. `sortBy`/`sortDir` below are different —
  // `listContacts` validates those itself (audit F14).
  const validEmailStatus = isEmailStatus(emailStatus) ? emailStatus : undefined;

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

  // Fetch contacts, topics, and feature access in parallel
  const [contactsResult, topicsResult, topicsFeature] = await Promise.all([
    listContacts(orgWithMembership.id, {
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
      search,
      emailStatus: validEmailStatus,
      topicId,
      // Raw strings straight from the URL — `listContacts` validates them
      // against the real sortable-column set before they reach the query
      // builder (audit F14), so nothing here needs to pre-check them.
      sortBy,
      sortDir,
    }),
    listTopics(orgWithMembership.id),
    checkFeatureAccess(orgWithMembership.id, "topics"),
  ]);

  // Topics feed the filter dropdown and the create-contact dialog on this
  // page - useful, but not what the page is about. A failure here degrades
  // to an empty list rather than blocking the page the way a failed contacts
  // fetch does below.
  const topics = topicsResult.success ? topicsResult.topics : [];
  const proFeaturesEnabled = topicsFeature.allowed;

  // Every page state below - error, never-created, filtered-empty, populated -
  // gets the same heading, so assistive tech and tab-switching always have a
  // page identity (audit F19) regardless of which state renders.
  const heading = (
    <div className="px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          Manage the people you can reach by email and SMS
        </p>
      </div>
    </div>
  );

  // A failed fetch must never fall through to "no contacts yet" - that is
  // audit finding F6. Read the result before deciding anything about
  // emptiness.
  if (!contactsResult.success) {
    return (
      <>
        {heading}
        <div className="px-4 lg:px-6">
          <ContactsLoadError
            isUnauthorized={contactsResult.error === UNAUTHORIZED}
            orgSlug={orgSlug}
          />
        </div>
      </>
    );
  }

  const contacts = contactsResult.contacts;
  const total = contactsResult.total;

  const hasFilters = !!(search || validEmailStatus || topicId);
  const isEmpty = total === 0 && !hasFilters;

  if (isEmpty) {
    return (
      <>
        {heading}
        <div className="px-4 lg:px-6">
          <ContactsEmptyState
            organizationId={orgWithMembership.id}
            orgSlug={orgSlug}
            proFeaturesEnabled={proFeaturesEnabled}
            topics={topics}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {heading}

      {/* Contact Analytics */}
      <div className="px-4 lg:px-6">
        <ContactAnalytics organizationId={orgWithMembership.id} />
      </div>

      {/* Contacts Table */}
      <div className="@container/main px-4 lg:px-6">
        <ContactsTable
          contacts={contacts}
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          page={Number.parseInt(page, 10)}
          pageSize={Number.parseInt(pageSize, 10)}
          proFeaturesEnabled={proFeaturesEnabled}
          topics={topics}
          total={total}
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
  );
}

/**
 * Renders in place of the contacts table when `listContacts` itself failed -
 * a DB outage, a dropped connection, anything `orgAction` caught and turned
 * into `{ success: false, error }`. Distinct from "no contacts yet"
 * (`ContactsEmptyState`) and from "no contacts match your filters" (handled
 * inside `ContactsTable`): this org may hold thousands of contacts and this
 * screen must never suggest otherwise (audit F6).
 */
function ContactsLoadError({
  isUnauthorized,
  orgSlug,
}: {
  isUnauthorized: boolean;
  orgSlug: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert className="size-6" />
        </EmptyMedia>
        <EmptyTitle>
          {isUnauthorized
            ? "You don't have access to contacts"
            : "We couldn't load your contacts"}
        </EmptyTitle>
        <EmptyDescription>
          {isUnauthorized
            ? "Your role in this organization doesn't include contact access. Ask an organization admin to update your permissions."
            : "Something went wrong while loading your contacts. Your contact data is unaffected — reloading the page usually fixes this."}
        </EmptyDescription>
      </EmptyHeader>
      {isUnauthorized ? null : (
        <EmptyContent>
          <Button asChild size="sm">
            <a href={`/${orgSlug}/contacts`}>Try again</a>
          </Button>
        </EmptyContent>
      )}
    </Empty>
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
    return { title: "Contacts" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Contacts | ${orgWithMembership.name}`,
    description: `Manage the people you can reach by email and SMS for ${orgWithMembership.name}`,
  };
}
