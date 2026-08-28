import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getEventNames, listEvents } from "@/actions/events";
import { getOrganizationWithMembership } from "@/lib/organization";
import { EventAnalytics } from "./components/event-analytics";
import { EventsTable } from "./components/events-table";
import { LiveRefreshToggle } from "./components/live-refresh-toggle";

type EventsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    eventName?: string;
    contactEmail?: string;
    dateFrom?: string;
    dateTo?: string;
    datePreset?: string;
  }>;
};

export default async function EventsPage({
  params,
  searchParams,
}: EventsPageProps) {
  const { orgSlug } = await params;
  const {
    page = "1",
    pageSize = "50",
    search,
    eventName,
    contactEmail,
    dateFrom,
    dateTo,
    datePreset,
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

  // Parse date filters
  const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
  const parsedDateTo = dateTo ? new Date(dateTo) : undefined;

  // Fetch events and event names in parallel
  const [eventsResult, eventNamesResult] = await Promise.all([
    listEvents(orgWithMembership.id, {
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
      search,
      eventName,
      contactEmail,
      dateFrom: parsedDateFrom,
      dateTo: parsedDateTo,
    }),
    getEventNames(orgWithMembership.id),
  ]);

  const events = eventsResult.success ? eventsResult.events : [];
  const total = eventsResult.success ? eventsResult.total : 0;
  const eventNames = eventNamesResult.success
    ? eventNamesResult.eventNames
    : [];

  return (
    <>
      {/* Event Analytics */}
      <div className="px-4 lg:px-6">
        <EventAnalytics organizationId={orgWithMembership.id} />
      </div>

      {/* Events Table */}
      <div className="@container/main px-4 lg:px-6">
        <div className="mb-3 flex justify-end">
          <LiveRefreshToggle
            params={{
              page,
              search,
              eventName,
              contactEmail,
              dateFrom,
              dateTo,
              datePreset,
            }}
          />
        </div>
        <EventsTable
          datePreset={datePreset}
          eventNames={eventNames}
          events={events}
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          page={Number.parseInt(page, 10)}
          pageSize={Number.parseInt(pageSize, 10)}
          total={total}
        />
      </div>
    </>
  );
}
