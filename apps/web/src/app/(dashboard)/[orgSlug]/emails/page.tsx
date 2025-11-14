import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getOrganizationWithMembership } from "@/lib/organization";
import { EmailsTable } from "./components/emails-table";
import type { EmailListItem } from "./types";

interface EmailsPageProps {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    days?: string;
    limit?: string;
  }>;
}

async function fetchEmails(
  orgSlug: string,
  days = 7,
  limit = 100
): Promise<EmailListItem[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = new URL(`/api/${orgSlug}/emails`, baseUrl);
    url.searchParams.set("days", days.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch emails:", response.statusText);
      return [];
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching emails:", error);
    return [];
  }
}

export default async function EmailsPage({
  params,
  searchParams,
}: EmailsPageProps) {
  const { orgSlug } = await params;
  const { days = "7", limit = "100" } = await searchParams;

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
    redirect("/dashboard");
  }

  // Fetch actual emails from API
  const emails = await fetchEmails(
    orgSlug,
    Number.parseInt(days, 10),
    Number.parseInt(limit, 10)
  );

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Emails</h1>
          <p className="text-muted-foreground">
            View and manage your email sending history
          </p>
        </div>
      </div>

      {/* Emails Table */}
      <div className="@container/main px-4 lg:px-6">
        <EmailsTable data={emails} orgSlug={orgSlug} />
      </div>
    </>
  );
}
