"use client";

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
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ArchivedEmail = {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments: Array<{
    filename?: string;
    contentType: string;
    size: number;
  }>;
  headers: Record<string, string | string[] | undefined>;
  timestamp: Date;
  metadata?: {
    senderIp?: string;
    tlsProtocol?: string;
    tlsCipherSuite?: string;
    senderHostname?: string;
  };
};

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
  const [archivedEmail, setArchivedEmail] = useState<ArchivedEmail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleNotFound = () => {
      setArchivedEmail(null);
      setLoading(false);
    };

    const handleError = (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error fetching archived email:", err);
    };

    async function fetchArchivedEmail() {
      if (!archivingEnabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const encodedId = encodeURIComponent(messageId);
        const response = await fetch(
          `/api/${orgSlug}/emails/${encodedId}/archive`
        );

        if (!response.ok) {
          if (response.status === 404) {
            handleNotFound();
            return;
          }
          throw new Error(
            `Failed to fetch archived email: ${response.statusText}`
          );
        }

        const data = await response.json();
        setArchivedEmail({
          ...data,
          timestamp: new Date(data.timestamp),
        });
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchArchivedEmail();
  }, [messageId, orgSlug, archivingEnabled]);

  // Not enabled - show premium upgrade message
  if (!archivingEnabled) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Email Archive
                <Badge className="gap-1" variant="secondary">
                  <Sparkles className="h-3 w-3" />
                  Premium
                </Badge>
              </CardTitle>
              <CardDescription>
                Full email content with HTML rendering and attachments
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
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
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>View rendered HTML emails</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Access email attachments</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
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
        </CardContent>
      </Card>
    );
  }

  // Loading state - premium shimmer
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 animate-pulse text-primary" />
            </div>
            <div>
              <CardTitle>Email Archive</CardTitle>
              <CardDescription>
                Loading archived email content from AWS SES Mail Manager...
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-20 flex-1" />
              <Skeleton className="h-20 flex-1" />
              <Skeleton className="h-20 flex-1" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Archive</CardTitle>
          <CardDescription>Failed to load archived email</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Email not found in archive (sent before archiving was enabled)
  if (!archivedEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Archive</CardTitle>
          <CardDescription>Email content not available</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              This email was not archived. It may have been sent before email
              archiving was enabled for this AWS account.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
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
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Email Archive
                <Badge className="gap-1 font-normal" variant="outline">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Archived
                </Badge>
              </CardTitle>
              <CardDescription>
                Full email content stored securely in AWS SES Mail Manager
              </CardDescription>
            </div>
          </div>
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
        </div>
      </CardHeader>
      <CardContent>
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
              <div className="rounded-md border">
                <iframe
                  className="h-[600px] w-full rounded-md"
                  sandbox="allow-same-origin"
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
                      className="group relative flex items-center justify-between rounded-lg border bg-gradient-to-br from-background to-muted/20 p-4 transition-all hover:border-primary/50 hover:shadow-md"
                      key={attachment.filename || `attachment-${index}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
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
              <div className="rounded-md border bg-muted p-4">
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
              <div className="rounded-md border bg-muted p-4">
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

        {/* Email Metadata */}
        {archivedEmail.metadata && (
          <div className="mt-6 space-y-3 rounded-md border p-4">
            <div className="font-medium text-sm">SMTP Metadata</div>
            <div className="grid gap-3 md:grid-cols-2">
              {archivedEmail.metadata.senderIp && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs">Sender IP</div>
                  <div className="font-mono text-sm">
                    {archivedEmail.metadata.senderIp}
                  </div>
                </div>
              )}
              {archivedEmail.metadata.tlsProtocol && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs">
                    TLS Protocol
                  </div>
                  <div className="font-mono text-sm">
                    {archivedEmail.metadata.tlsProtocol}
                  </div>
                </div>
              )}
              {archivedEmail.metadata.senderHostname && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-xs">
                    Sender Hostname
                  </div>
                  <div className="font-mono text-sm">
                    {archivedEmail.metadata.senderHostname}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
