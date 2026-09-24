import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SMSStatus } from "@/app/(dashboard)/[orgSlug]/sms/types";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { querySMSEvents } from "@/lib/aws/sms-voice";
import { logger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { SMSTable } from "./components/sms-table";
import type { SMSListItem } from "./types";

type SMSPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    days?: string;
    limit?: string;
  }>;
};

// Map AWS event types to our SMSStatus
function mapEventTypeToStatus(
  _eventType: string,
  eventStatus: string
): SMSStatus {
  const statusLower = eventStatus.toLowerCase();

  if (statusLower === "delivered" || statusLower === "delivery") {
    return "delivered";
  }
  if (statusLower === "queued" || statusLower === "pending") {
    return "queued";
  }
  if (statusLower === "failed" || statusLower === "failure") {
    return "failed";
  }
  if (statusLower === "blocked") {
    return "blocked";
  }
  if (statusLower === "invalid") {
    return "invalid";
  }
  if (statusLower.includes("opt") || statusLower.includes("optout")) {
    return "opted_out";
  }
  if (statusLower.includes("carrier") || statusLower.includes("unreachable")) {
    return "carrier_unreachable";
  }
  if (statusLower.includes("ttl") || statusLower.includes("expired")) {
    return "ttl_expired";
  }

  return "sent";
}

async function fetchSMSMessages(
  organizationId: string,
  days = 7,
  limit = 100
): Promise<SMSListItem[]> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
    });

    if (accounts.length === 0) {
      return [];
    }

    // Fetch SMS events from all accounts
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await querySMSEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 500,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.warn(
            {
              accountId: account.id,
              awsAccountId: account.accountId,
              error: errorMessage,
              region: account.region,
              hasExternalId: !!account.externalId,
            },
            "fetchSMSMessages: failed to fetch SMS for account"
          );
          return [];
        }
      })
    );

    // Group events by messageId to get unique messages
    const messagesMap = new Map<string, SMSListItem>();

    for (const events of allEvents) {
      for (const event of events) {
        const existing = messagesMap.get(event.messageId);

        if (existing) {
          // Update status to most recent/significant event
          const newStatus = mapEventTypeToStatus(
            event.eventType,
            event.eventStatus
          );
          const statusPriority: SMSStatus[] = [
            "delivered",
            "failed",
            "blocked",
            "opted_out",
            "invalid",
            "carrier_unreachable",
            "ttl_expired",
            "sent",
            "queued",
          ];

          const currentPriority = statusPriority.indexOf(existing.status);
          const newPriority = statusPriority.indexOf(newStatus);

          if (newPriority < currentPriority) {
            existing.status = newStatus;
          }
        } else {
          messagesMap.set(event.messageId, {
            id: event.messageId,
            messageId: event.messageId,
            destinationNumber: event.destinationNumber,
            originationNumber: event.originationNumber,
            status: mapEventTypeToStatus(event.eventType, event.eventStatus),
            sentAt: event.sentAt,
          });
        }
      }
    }

    // Convert to array and sort by sentAt (newest first)
    const messages = Array.from(messagesMap.values())
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit);

    return messages;
  } catch (error) {
    logger.error({ err: error }, "fetchSMSMessages failed");
    return [];
  }
}

export default async function SMSPage({ params, searchParams }: SMSPageProps) {
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
              <MessageSquare className="size-6" />
            </EmptyMedia>
            <EmptyTitle>SMS Messages</EmptyTitle>
            <EmptyDescription>
              View your SMS messaging history — delivery status, phone numbers,
              and message details across all your AWS accounts.
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
                  href="https://wraps.dev/docs/quickstart/sms"
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

  // Fetch SMS messages directly
  const messages = await fetchSMSMessages(
    orgWithMembership.id,
    Number.parseInt(days, 10),
    Number.parseInt(limit, 10)
  );

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">SMS</h1>
          <p className="text-muted-foreground">
            View and manage your SMS messaging history
          </p>
        </div>
      </div>

      {/* SMS Table */}
      <div className="@container/main px-4 lg:px-6">
        <SMSTable
          data={messages}
          days={Number.parseInt(days, 10)}
          orgSlug={orgSlug}
        />
      </div>
    </>
  );
}
