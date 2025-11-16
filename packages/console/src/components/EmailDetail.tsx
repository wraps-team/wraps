import { ArrowLeft, Check, Clock, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmailArchiveViewer } from "./EmailArchiveViewer";

type EmailEvent = {
  type:
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "failed";
  timestamp: number;
  metadata?: Record<string, any>;
};

type EmailDetails = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status:
    | "delivered"
    | "bounced"
    | "complained"
    | "sent"
    | "failed"
    | "opened"
    | "clicked";
  sentAt: number;
  events: EmailEvent[];
};

const EVENT_ICONS = {
  sent: Mail,
  delivered: Check,
  bounced: X,
  complained: X,
  opened: Mail,
  clicked: Mail,
  failed: X,
};

const EVENT_COLORS = {
  sent: "text-blue-500",
  delivered: "text-green-500",
  bounced: "text-red-500",
  complained: "text-red-500",
  opened: "text-purple-500",
  clicked: "text-indigo-500",
  failed: "text-red-500",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  delivered: "default",
  sent: "secondary",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  opened: "default",
  clicked: "default",
};

export function EmailDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<EmailDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivingEnabled, setArchivingEnabled] = useState(false);

  useEffect(() => {
    async function fetchEmailDetails() {
      try {
        setLoading(true);
        setError(null);

        // Get token from sessionStorage
        const token = sessionStorage.getItem("wraps-auth-token");

        if (!token) {
          throw new Error("Authentication token not found");
        }

        // Fetch deployment config to get archiving status
        try {
          const deploymentResponse = await fetch(
            `/api/settings/deployment?token=${token}`
          );
          if (deploymentResponse.ok) {
            const deploymentData = await deploymentResponse.json();
            setArchivingEnabled(deploymentData.archivingEnabled ?? false);
          }
        } catch (deploymentError) {
          console.warn("Failed to fetch deployment config:", deploymentError);
          // Continue with email fetch even if deployment config fails
        }

        // URL encode the message ID in case it contains special characters
        const encodedId = encodeURIComponent(id || "");
        console.log("Fetching email with ID:", id);
        console.log("Encoded ID:", encodedId);
        console.log(
          "Full URL:",
          `/api/emails/${encodedId}?token=${token.substring(0, 8)}...`
        );

        const response = await fetch(`/api/emails/${encodedId}?token=${token}`);

        if (!response.ok) {
          let errorMessage = "Failed to fetch email details";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (_e) {
            errorMessage = `${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        // Check content type before parsing
        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          const text = await response.text();
          console.error("Non-JSON response:", text);
          throw new Error("Server returned non-JSON response");
        }

        const data = await response.json();
        console.log("Email data received:", {
          id: data.id,
          hasHtmlBody: !!data.htmlBody,
          hasTextBody: !!data.textBody,
          htmlBodyLength: data.htmlBody?.length || 0,
          textBodyLength: data.textBody?.length || 0,
          events: data.events?.length || 0,
        });
        setEmail(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error fetching email details:", err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchEmailDetails();
    }
  }, [id]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatFullTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <div className="text-muted-foreground">Loading email details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate("/email")} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to emails
        </Button>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate("/email")} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to emails
        </Button>
        <div className="rounded-md border p-4 text-muted-foreground text-sm">
          Email not found
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => navigate("/email")} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to emails
        </Button>
        <Badge variant={STATUS_VARIANTS[email.status]}>
          {email.status.charAt(0).toUpperCase() + email.status.slice(1)}
        </Badge>
      </div>

      {/* Email Metadata */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-2xl">{email.subject}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {email.messageId}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-muted-foreground text-sm">FROM</div>
              <div className="font-mono text-sm">{email.from}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-sm">TO</div>
              <div className="font-mono text-sm">
                {email.to.length > 0 ? email.to.join(", ") : "(no recipients)"}
              </div>
            </div>
            {email.replyTo && (
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">REPLY-TO</div>
                <div className="font-mono text-sm">{email.replyTo}</div>
              </div>
            )}
            <div className="space-y-1">
              <div className="text-muted-foreground text-sm">ID</div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                  {email.id}
                </code>
                <Button
                  className="h-6 w-6"
                  onClick={() => navigator.clipboard.writeText(email.id)}
                  size="icon"
                  variant="ghost"
                >
                  <span className="sr-only">Copy ID</span>📋
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Archive Viewer */}
      <EmailArchiveViewer
        archivingEnabled={archivingEnabled}
        messageId={email.messageId}
      />

      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Email Events</CardTitle>
          <CardDescription>
            Lifecycle of this email from send to delivery
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {email.events.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No events recorded yet
              </div>
            ) : (
              email.events.map((event, index) => {
                const Icon = EVENT_ICONS[event.type] || Clock;
                const isLast = index === email.events.length - 1;

                return (
                  <div key={`${event.type}-${event.timestamp}`}>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`rounded-full border-2 border-background bg-muted p-2 ${EVENT_COLORS[event.type]}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        {!isLast && (
                          <div className="my-1 w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-center justify-between">
                          <div className="font-medium capitalize">
                            {event.type}
                          </div>
                          <div className="text-muted-foreground text-sm">
                            {formatTimestamp(event.timestamp)}
                          </div>
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {formatFullTimestamp(event.timestamp)}
                        </div>
                        {event.metadata &&
                          Object.keys(event.metadata).length > 0 && (
                            <div className="mt-2 rounded-md border bg-muted/50 p-2 font-mono text-xs">
                              <pre className="overflow-x-auto">
                                {JSON.stringify(event.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
