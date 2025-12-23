import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listContacts } from "@/actions/contacts";
import { listTopics } from "@/actions/topics";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess } from "@/lib/plan-limits";
import { ContactsTable } from "./components/contacts-table";

type ContactsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    topicId?: string;
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
    status,
    topicId,
  } = await searchParams;

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
      status: status as
        | "pending_confirmation"
        | "active"
        | "unsubscribed"
        | "bounced"
        | "complained"
        | undefined,
      topicId,
    }),
    listTopics(orgWithMembership.id),
    checkFeatureAccess(orgWithMembership.id, "topics"),
  ]);

  const contacts = contactsResult.success ? contactsResult.contacts : [];
  const total = contactsResult.success ? contactsResult.total : 0;
  const topics = topicsResult.success ? topicsResult.topics : [];
  const proFeaturesEnabled = topicsFeature.allowed;

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your email contacts and their subscriptions
          </p>
        </div>
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
