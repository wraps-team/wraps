import { Code2, FileText, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  archivingEnabled: boolean;
};

export function EmailArchiveViewer({
  messageId,
  archivingEnabled,
}: EmailArchiveViewerProps) {
  const [archivedEmail, setArchivedEmail] = useState<ArchivedEmail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArchivedEmail() {
      if (!archivingEnabled) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const token = sessionStorage.getItem("wraps-auth-token");
        if (!token) {
          throw new Error("Authentication token not found");
        }

        const encodedId = encodeURIComponent(messageId);
        const response = await fetch(
          `/api/emails/${encodedId}/archive?token=${token}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            // Email not archived (might be sent before archiving was enabled)
            setArchivedEmail(null);
            setLoading(false);
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
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error fetching archived email:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchArchivedEmail();
  }, [messageId, archivingEnabled]);

  // Not enabled - show upgrade message
  if (!archivingEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Archive</CardTitle>
          <CardDescription>
            Enable email archiving to view full email content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Email archiving is not enabled for this deployment. Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                wraps upgrade
              </code>{" "}
              to enable archiving and view full email content with HTML
              rendering.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Archive</CardTitle>
          <CardDescription>Loading archived email content...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-[400px] w-full" />
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
              archiving was enabled for this deployment.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Email Archive</CardTitle>
            <CardDescription>
              Full email content stored in AWS SES Mail Manager
            </CardDescription>
          </div>
          {archivedEmail.attachments.length > 0 && (
            <Badge variant="secondary">
              {archivedEmail.attachments.length} attachment
              {archivedEmail.attachments.length > 1 ? "s" : ""}
            </Badge>
          )}
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
              <div className="space-y-2">
                <div className="font-medium text-sm">Attachments</div>
                <div className="space-y-2">
                  {archivedEmail.attachments.map((attachment, index) => (
                    <div
                      className="flex items-center justify-between rounded-md border p-3"
                      key={index}
                    >
                      <div className="space-y-1">
                        <div className="font-mono text-sm">
                          {attachment.filename || `Attachment ${index + 1}`}
                        </div>
                        <div className="text-muted-foreground text-xs">
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
