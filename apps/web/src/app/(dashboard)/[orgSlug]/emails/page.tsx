import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getOrganizationWithMembership } from "@/lib/organization";
import { EmailsTable } from "./components/emails-table";
import type { EmailListItem } from "./types";

interface EmailsPageProps {
  params: Promise<{
    orgSlug: string;
  }>;
}

// Mock data for now - will be replaced with actual API call
const mockEmails: EmailListItem[] = [
  {
    id: "msg-001",
    messageId: "01234567-89ab-cdef-0123-456789abcdef",
    from: "hello@example.com",
    to: ["user@test.com"],
    subject: "Welcome to our platform!",
    status: "clicked",
    sentAt: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    eventCount: 4,
    hasOpened: true,
    hasClicked: true,
  },
  {
    id: "msg-002",
    messageId: "11234567-89ab-cdef-0123-456789abcdef",
    from: "hello@example.com",
    to: ["jane@test.com", "john@test.com"],
    subject: "Your monthly report is ready",
    status: "opened",
    sentAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    eventCount: 3,
    hasOpened: true,
    hasClicked: false,
  },
  {
    id: "msg-003",
    messageId: "21234567-89ab-cdef-0123-456789abcdef",
    from: "hello@example.com",
    to: ["support@test.com"],
    subject: "Password reset request",
    status: "delivered",
    sentAt: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    eventCount: 2,
    hasOpened: false,
    hasClicked: false,
  },
  {
    id: "msg-004",
    messageId: "31234567-89ab-cdef-0123-456789abcdef",
    from: "hello@example.com",
    to: ["invalid@nonexistent.domain"],
    subject: "Newsletter - Week 42",
    status: "bounced",
    sentAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    eventCount: 2,
    hasOpened: false,
    hasClicked: false,
  },
  {
    id: "msg-005",
    messageId: "41234567-89ab-cdef-0123-456789abcdef",
    from: "hello@example.com",
    to: ["user5@test.com"],
    subject: "Your order has shipped",
    status: "sent",
    sentAt: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
    eventCount: 1,
    hasOpened: false,
    hasClicked: false,
  },
];

export default async function EmailsPage({ params }: EmailsPageProps) {
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
    redirect("/dashboard");
  }

  // TODO: Fetch actual emails from API
  // const emails = await fetchEmails(orgWithMembership.id);
  const emails = mockEmails;

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
