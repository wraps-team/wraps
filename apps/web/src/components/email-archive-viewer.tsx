"use client";

import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wraps/ui/components/ui/tabs";
import {
  CheckCircle2,
  Code2,
  Download,
  FileText,
  Globe,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArchivedEmail } from "@/hooks/use-archived-email";

type EmailArchiveViewerProps = {
  messageId: string;
  orgSlug: string;
  archivingEnabled: boolean;
};

export function EmailArchiveViewer({
  messageId,
  orgSlug,
  archivingEnabled,
}: EmailArchiveViewerProps) {
  const {
    data: archivedEmail,
    isLoading: loading,
    error: queryError,
  } = useArchivedEmail(orgSlug, messageId, archivingEnabled);

  const error = queryError?.message ?? null;

  // Not enabled - show premium upgrade message
  if (!archivingEnabled) {
    return (
      // The upgrade prompt is Wraps' own offer, not data from the account, so it
      // keeps the plain panel.
      <Panel
        actions={<Lock className="h-5 w-5 text-primary" />}
        description="Full email content with HTML rendering and attachments"
        label={
          <PanelTitle className="flex items-center gap-2">
            Email Archive
            <Badge className="gap-1" variant="secondary">
              <Sparkles className="h-3 w-3" />
              Premium
            </Badge>
          </PanelTitle>
        }
      >
        <div className="space-y-4">
          <div className="border bg-muted/50 p-4">
            <div className="mb-4 flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <div className="font-medium text-sm">
                  Unlock Complete Email Archive
                </div>
                <div className="text-muted-foreground text-sm">
                  Enable archiving to access full email content including HTML
                  rendering, attachments, and detailed metadata stored securely
                  in AWS SES Mail Manager.
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>View rendered HTML emails</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Access email attachments</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Inspect headers and SMTP metadata</span>
              </div>
            </div>
          </div>
          <Alert>
            <AlertDescription>
              Contact your administrator to enable email archiving for this AWS
              account or run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                wraps upgrade
              </code>{" "}
              in your CLI.
            </AlertDescription>
          </Alert>
        </div>
      </Panel>
    );
  }

  // Loading state - premium shimmer
  if (loading) {
    return (
      <Panel
        actions={<Mail className="h-5 w-5 animate-pulse text-primary" />}
        description="Loading archived email content from AWS SES Mail Manager..."
        label={<PanelTitle>Email Archive</PanelTitle>}
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[400px] w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-20 flex-1" />
            <Skeleton className="h-20 flex-1" />
            <Skeleton className="h-20 flex-1" />
          </div>
        </div>
      </Panel>
    );
  }

  // Error state
  if (error) {
    return (
      <Panel
        description="Failed to load archived email"
        label={<PanelTitle>Email Archive</PanelTitle>}
      >
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Panel>
    );
  }

  // Email not found in archive (sent before archiving was enabled)
  if (!archivedEmail) {
    return (
      <Panel
        description="Email content not available"
        label={<PanelTitle>Email Archive</PanelTitle>}
      >
        <Alert>
          <AlertDescription>
            This email was not archived. It may have been sent before email
            archiving was enabled for this AWS account.
          </AlertDescription>
        </Alert>
      </Panel>
    );
  }

  const downloadHTML = () => {
    if (!archivedEmail?.html) {
      return;
    }
    const blob = new Blob([archivedEmail.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${archivedEmail.subject.slice(0, 50)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    // A plain panel: an archived message is history, and the dashed "own"
    // border is reserved for live account state.
    <Panel
      actions={
        <div className="flex items-center gap-2">
          {archivedEmail.attachments.length > 0 && (
            <Badge className="gap-1" variant="secondary">
              <Download className="h-3 w-3" />
              {archivedEmail.attachments.length} attachment
              {archivedEmail.attachments.length > 1 ? "s" : ""}
            </Badge>
          )}
          {archivedEmail.html && (
            <Button
              className="gap-2"
              onClick={downloadHTML}
              size="sm"
              variant="outline"
            >
              <Download className="h-4 w-4" />
              Download HTML
            </Button>
          )}
        </div>
      }
      description="Full email content stored securely in AWS SES Mail Manager"
      label={
        <PanelTitle className="flex items-center gap-2">
          Email Archive
          <Badge className="gap-1" variant="outline">
            <CheckCircle2 className="h-3 w-3 text-success" />
            Archived
          </Badge>
        </PanelTitle>
      }
    >
      <Tabs className="w-full" defaultValue="rendered">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger className="gap-2" value="rendered">
            <Globe className="h-4 w-4" />
            Rendered Email
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="text">
            <FileText className="h-4 w-4" />
            Plain Text
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="html">
            <Code2 className="h-4 w-4" />
            HTML Source
          </TabsTrigger>
        </TabsList>

        {/* Rendered Email Tab */}
        <TabsContent className="space-y-4" value="rendered">
          {archivedEmail.html ? (
            <div className="border">
              {/* Fully sandboxed: this is the org's own archived sent mail, but
                    nothing here reads contentWindow, so the frame has no reason
                    to hold the app's origin. no-referrer keeps remote images from
                    leaking the dashboard URL to whatever host serves them. */}
              <iframe
                className="h-[600px] w-full"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={archivedEmail.html}
                title="Email preview"
              />
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No HTML content available for this email. View the plain text
                tab instead.
              </AlertDescription>
            </Alert>
          )}

          {archivedEmail.attachments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <div className="font-medium text-sm">
                  Attachments ({archivedEmail.attachments.length})
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {archivedEmail.attachments.map((attachment, index) => (
                  <div
                    className="group relative flex items-center justify-between border bg-gradient-to-br from-background to-muted/20 p-4 transition-all hover:border-primary/50 hover:shadow-md"
                    key={attachment.filename || `attachment-${index}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="font-medium font-mono text-sm">
                          {attachment.filename || `Attachment ${index + 1}`}
                        </div>
                      </div>
                      <div className="ml-10 text-muted-foreground text-xs">
                        {attachment.contentType} •{" "}
                        {(attachment.size / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Plain Text Tab */}
        <TabsContent className="space-y-4" value="text">
          {archivedEmail.text ? (
            <div className="border bg-muted p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {archivedEmail.text}
              </pre>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No plain text content available for this email.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* HTML Source Tab */}
        <TabsContent className="space-y-4" value="html">
          {archivedEmail.html ? (
            <div className="border bg-muted p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                {archivedEmail.html}
              </pre>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No HTML content available for this email.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>

      {/* Email Headers */}
      {archivedEmail.headers &&
        Object.keys(archivedEmail.headers).length > 0 && (
          <div className="mt-6 space-y-3 border p-4">
            <div className="font-medium text-sm">Email Headers</div>
            <div className="space-y-2">
              {Object.entries(archivedEmail.headers)
                .filter(([key]) =>
                  [
                    "from",
                    "to",
                    "subject",
                    "date",
                    "message-id",
                    "reply-to",
                    "cc",
                    "bcc",
                    "x-ses-configuration-set",
                    "x-ses-message-id",
                    "mime-version",
                    "content-type",
                  ].includes(key.toLowerCase())
                )
                .map(([key, value]) => (
                  <div
                    className="grid gap-2 border-b pb-2 last:border-b-0 md:grid-cols-4"
                    key={key}
                  >
                    <div className="font-medium text-muted-foreground text-xs uppercase">
                      {key}
                    </div>
                    <div className="break-all font-mono text-sm md:col-span-3">
                      {Array.isArray(value) ? value.join(", ") : value}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
    </Panel>
  );
}
