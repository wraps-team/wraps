import { auth } from "@wraps/auth";
import { ArrowLeft, Mail, MessageSquare, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBatchSend } from "@/actions/batch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrganizationWithMembership } from "@/lib/organization";
import { BatchStats } from "./components/batch-stats";
import { CancelBatchButton } from "./components/cancel-button";

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
    notFound();
  }

  const batch = result.batch;
  const canCancel =
    (batch.status === "queued" || batch.status === "processing") &&
    ["owner", "admin"].includes(orgWithMembership.userRole);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild size="icon" variant="ghost">
            <Link href={`/${orgSlug}/send`}>
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
        {canCancel && (
          <CancelBatchButton
            batchId={batch.id}
            organizationId={orgWithMembership.id}
          />
        )}
      </div>

      {/* Stats with auto-refresh */}
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
          startedAt: batch.startedAt,
          completedAt: batch.completedAt,
        }}
        organizationId={orgWithMembership.id}
      />

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

      {/* Delivery Issues */}
      {(batch.bounced > 0 || batch.complained > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery Issues</CardTitle>
            <CardDescription>
              Issues encountered during email delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {batch.bounced > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="font-bold text-2xl text-orange-600">
                    {batch.bounced}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Bounced emails
                  </div>
                </div>
              )}
              {batch.complained > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="font-bold text-2xl text-red-600">
                    {batch.complained}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Spam complaints
                  </div>
                </div>
              )}
            </div>
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
