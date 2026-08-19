import { auth } from "@wraps/auth";
import {
  and,
  db,
  eq,
  getBroadcastClickBreakdown,
  MAX_CLICKED_URLS,
  messageSend,
} from "@wraps/db";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Separator } from "@wraps/ui/components/ui/separator";
import { sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowLeft,
  Mail,
  MessageSquare,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBatchSend } from "@/actions/batch";
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
import { BatchStats } from "./components/batch-stats";
import { CancelBatchButton } from "./components/cancel-button";
import { RecipientsPanel } from "./components/recipients-panel";
import { ResumeBatchButton } from "./components/resume-button";

type BatchDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    batchId: string;
  }>;
};

export default async function BatchDetailPage({
  params,
}: BatchDetailPageProps) {
  const { orgSlug, batchId } = await params;

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

  // Fetch batch details
  const result = await getBatchSend(batchId, orgWithMembership.id);

  if (!result.success) {
    // Only a genuine miss is a 404. Anything else — a dropped connection, a
    // query error — used to render "not found" at an operator watching a live
    // send, which is the one reading they must never be given.
    if ("errorCode" in result && result.errorCode === "NOT_FOUND") {
      notFound();
    }
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border border-destructive/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertTriangle className="size-6 text-destructive" />
            </EmptyMedia>
            <EmptyTitle>We couldn't load this broadcast.</EmptyTitle>
            <EmptyDescription>
              {result.error} This does not mean the broadcast is gone — if it
              was sending, it is still sending.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/emails/broadcasts/${batchId}`}>
                Try again
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const batch = result.batch;

  // Fetch bounce breakdown (hard vs soft) from message_send
  const bounceBreakdown = await db
    .select({
      hardBounced:
        sql<number>`count(*) filter (where ${messageSend.bounceType} = 'Permanent')`.as(
          "hard_bounced"
        ),
      softBounced:
        sql<number>`count(*) filter (where ${messageSend.bounceType} = 'Transient')`.as(
          "soft_bounced"
        ),
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.batchSendId, batch.id),
        eq(messageSend.organizationId, orgWithMembership.id)
      )
    );

  const hardBounced = bounceBreakdown[0]?.hardBounced ?? 0;
  const softBounced = bounceBreakdown[0]?.softBounced ?? 0;

  // Click URL breakdown. Bounded — unsubscribe and preference links are
  // per-recipient, so grouping every distinct URL returned one row per
  // recipient. They are counted in aggregate and excluded from the list.
  const { clicksByUrl, unsubscribeCount, totalDistinctUrls } =
    await getBroadcastClickBreakdown(batch.id, orgWithMembership.id);

  const isManager = ["owner", "admin"].includes(orgWithMembership.userRole);

  const canCancel =
    (batch.status === "scheduled" ||
      batch.status === "queued" ||
      batch.status === "processing") &&
    isManager;

  // Mirrors the API's own gate (POST /v1/batch/:id/resume): email only, and
  // only from 'processing' or 'failed'. Without this the endpoint existed but
  // was reachable only by curl, so a recoverable send looked terminal.
  const canResume =
    (batch.status === "processing" || batch.status === "failed") &&
    batch.channel === "email" &&
    Boolean(batch.awsAccount) &&
    isManager;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            aria-label="Back to broadcasts"
            asChild
            size="icon"
            variant="ghost"
          >
            <Link href={`/${orgSlug}/emails/broadcasts`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-2xl tracking-tight">
              {batch.name || "Untitled Batch"}
            </h1>
            <p className="text-muted-foreground">
              {batch.channel === "email" ? (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email broadcast
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> SMS broadcast
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canResume && (
            <ResumeBatchButton
              batchId={batch.id}
              organizationId={orgWithMembership.id}
              status={batch.status}
            />
          )}
          {canCancel && (
            <CancelBatchButton
              batchId={batch.id}
              organizationId={orgWithMembership.id}
            />
          )}
        </div>
      </div>

      {/* Stats with auto-refresh + engagement funnel */}
      <BatchStats
        batch={{
          id: batch.id,
          status: batch.status,
          channel: batch.channel,
          totalRecipients: batch.totalRecipients,
          processedRecipients: batch.processedRecipients,
          sent: batch.sent,
          delivered: batch.delivered,
          opened: batch.opened,
          clicked: batch.clicked,
          bounced: batch.bounced,
          complained: batch.complained,
          failed: batch.failed,
          hardBounced,
          softBounced,
          pausedReason: batch.pausedReason,
          lastChunkAt: batch.lastChunkAt,
          startedAt: batch.startedAt,
          completedAt: batch.completedAt,
        }}
        clicksByUrl={clicksByUrl}
        omittedUrlCount={Math.max(0, totalDistinctUrls - MAX_CLICKED_URLS)}
        organizationId={orgWithMembership.id}
        unsubscribeCount={unsubscribeCount}
      />

      {batch.status !== "draft" && (
        <RecipientsPanel
          batchId={batch.id}
          organizationId={orgWithMembership.id}
        />
      )}

      {/* Email Details */}
      {batch.channel === "email" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Email Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {batch.subject && (
              <div>
                <div className="font-medium text-muted-foreground text-sm">
                  Subject
                </div>
                <div>{batch.subject}</div>
              </div>
            )}
            {batch.previewText && (
              <div>
                <div className="font-medium text-muted-foreground text-sm">
                  Preview Text
                </div>
                <div>{batch.previewText}</div>
              </div>
            )}
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              {batch.from && (
                <div>
                  <div className="font-medium text-muted-foreground text-sm">
                    From
                  </div>
                  <div>
                    {batch.fromName
                      ? `${batch.fromName} <${batch.from}>`
                      : batch.from}
                  </div>
                </div>
              )}
              {batch.replyTo && (
                <div>
                  <div className="font-medium text-muted-foreground text-sm">
                    Reply-To
                  </div>
                  <div>{batch.replyTo}</div>
                </div>
              )}
            </div>
            {batch.templateName && (
              <>
                <Separator />
                <div>
                  <div className="font-medium text-muted-foreground text-sm">
                    Template
                  </div>
                  <div>{batch.templateName}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Details */}
      {batch.errorMessage && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-lg">
              <XCircle className="h-5 w-5" />
              Error Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{batch.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="font-medium text-muted-foreground">Created</div>
              <div>{new Date(batch.createdAt).toLocaleString()}</div>
            </div>
            {batch.createdBy && (
              <div>
                <div className="font-medium text-muted-foreground">
                  Created By
                </div>
                <div>{batch.createdBy.name || batch.createdBy.email}</div>
              </div>
            )}
            {batch.awsAccount && (
              <div>
                <div className="font-medium text-muted-foreground">
                  AWS Account
                </div>
                <div>
                  {batch.awsAccount.name} ({batch.awsAccount.region})
                </div>
              </div>
            )}
            {batch.scheduledFor && (
              <div>
                <div className="font-medium text-muted-foreground">
                  Scheduled For
                </div>
                <div>{new Date(batch.scheduledFor).toLocaleString()}</div>
              </div>
            )}
            {batch.startedAt && (
              <div>
                <div className="font-medium text-muted-foreground">Started</div>
                <div>{new Date(batch.startedAt).toLocaleString()}</div>
              </div>
            )}
            {batch.completedAt && (
              <div>
                <div className="font-medium text-muted-foreground">
                  Completed
                </div>
                <div>{new Date(batch.completedAt).toLocaleString()}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
