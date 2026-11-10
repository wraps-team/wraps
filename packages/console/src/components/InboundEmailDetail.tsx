import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@wraps/ui/components/ui/input-group";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CopyButton } from "@/components/cdn";

type InboundEmailAddress = {
  address: string;
  name: string;
};

type InboundAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  contentDisposition?: string;
  cid?: string | null;
};

type InboundEmail = {
  emailId: string;
  messageId: string;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  cc: InboundEmailAddress[];
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
  spamVerdict: string | null;
  virusVerdict: string | null;
  rawS3Key: string;
  receivedAt: string;
  /** Lowercased envelope recipients (Bcc included). Absent = mail received before the upgrade. */
  envelopeRecipients?: string[];
};

/** Whole envelope list, only when it holds an address To and Cc do not show. */
function getDeliveredTo(email: InboundEmail): string[] {
  const envelope = email.envelopeRecipients;
  if (!envelope || envelope.length === 0) {
    return [];
  }
  const shown = new Set(
    [...email.to, ...email.cc].map((addr) => addr.address.toLowerCase())
  );
  return envelope.some((addr) => !shown.has(addr.toLowerCase()))
    ? envelope
    : [];
}

function formatAddress(addr: InboundEmailAddress): string {
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VerdictBadge({
  label,
  verdict,
}: {
  label: string;
  verdict: string | null;
}) {
  if (!verdict) {
    return null;
  }
  const pass = verdict === "PASS";
  return (
    <Badge variant={pass ? "success" : "destructive"}>
      {pass ? (
        <ShieldCheck className="mr-1 h-3 w-3" />
      ) : (
        <ShieldAlert className="mr-1 h-3 w-3" />
      )}
      {label}: {verdict}
    </Badge>
  );
}

export function InboundEmailDetail() {
  const { emailId } = useParams<{ emailId: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<InboundEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headersOpen, setHeadersOpen] = useState(false);

  useEffect(() => {
    async function fetchEmail() {
      try {
        setLoading(true);
        setError(null);

        const token = sessionStorage.getItem("wraps-auth-token");
        if (!token) {
          throw new Error("Authentication token not found");
        }

        const response = await fetch(
          `/api/inbound/${encodeURIComponent(emailId || "")}?token=${token}`
        );

        if (!response.ok) {
          let errorMessage = "Failed to fetch inbound email";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = `${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setEmail(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error fetching inbound email:", err);
      } finally {
        setLoading(false);
      }
    }

    if (emailId) {
      fetchEmail();
    }
  }, [emailId]);

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <div className="text-muted-foreground">Loading inbound email...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button
          onClick={() => navigate("/email?tab=receiving")}
          size="sm"
          variant="ghost"
        >
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
        <Button
          onClick={() => navigate("/email?tab=receiving")}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to emails
        </Button>
        <div className="rounded-md border p-4 text-muted-foreground text-sm">
          Inbound email not found
        </div>
      </div>
    );
  }

  const deliveredTo = getDeliveredTo(email);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          onClick={() => navigate("/email?tab=receiving")}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Email Metadata */}
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="flex flex-row items-center gap-2 text-xl">
            <span>{email.subject || "(no subject)"}</span>
          </CardTitle>
          {/* Verdicts */}
          <div className="flex flex-wrap gap-2">
            <VerdictBadge label="Spam" verdict={email.spamVerdict} />
            <VerdictBadge label="Virus" verdict={email.virusVerdict} />
            {email.headers["x-ses-dkim-verdict"] && (
              <VerdictBadge
                label="DKIM"
                verdict={email.headers["x-ses-dkim-verdict"]}
              />
            )}
            {email.headers["x-ses-spf-verdict"] && (
              <VerdictBadge
                label="SPF"
                verdict={email.headers["x-ses-spf-verdict"]}
              />
            )}
          </div>
          {/* Message ID */}
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 truncate rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
              {email.messageId}
            </code>
            <CopyButton
              className="h-6 w-6 shrink-0"
              size="sm"
              value={email.messageId}
              variant="ghost"
            />
          </div>
          {/* From / To / CC */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
            <InputGroup className="w-full cursor-text! sm:w-auto sm:min-w-[518px]">
              <InputGroupAddon align="inline-start">
                <InputGroupText>From</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                className="min-w-0 cursor-text! truncate font-mono text-sm"
                disabled
                readOnly
                value={formatAddress(email.from)}
              />
              <InputGroupAddon align="inline-end">
                <CopyButton
                  className="h-6 w-6"
                  size="sm"
                  value={email.from.address}
                  variant="ghost"
                />
              </InputGroupAddon>
            </InputGroup>
            <InputGroup className="w-full cursor-text! sm:w-auto sm:min-w-[518px]">
              <InputGroupAddon align="inline-start">
                <InputGroupText>To</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                className="min-w-0 cursor-text! truncate font-mono text-sm"
                disabled
                readOnly
                value={
                  email.to.length > 0
                    ? email.to.map(formatAddress).join(", ")
                    : "(no recipients)"
                }
              />
            </InputGroup>
            {email.cc.length > 0 && (
              <InputGroup className="w-full cursor-text! sm:w-auto sm:min-w-[518px]">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>CC</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  className="min-w-0 cursor-text! truncate font-mono text-sm"
                  disabled
                  readOnly
                  value={email.cc.map(formatAddress).join(", ")}
                />
              </InputGroup>
            )}
            {deliveredTo.length > 0 && (
              <InputGroup className="w-full cursor-text! sm:w-auto sm:min-w-[518px]">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>Delivered to</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  className="min-w-0 cursor-text! truncate font-mono text-sm"
                  disabled
                  readOnly
                  value={deliveredTo.join(", ")}
                />
              </InputGroup>
            )}
          </div>
          <div className="text-muted-foreground text-sm">
            Received: {new Date(email.receivedAt).toLocaleString()}
          </div>
        </CardHeader>
      </Card>

      {/* Email Body */}
      <Card>
        <CardHeader>
          <CardTitle>Message Body</CardTitle>
          {email.htmlTruncated && (
            <p className="text-sm text-warning">
              HTML content was truncated due to size limits
            </p>
          )}
        </CardHeader>
        <CardContent>
          {email.html ? (
            /* Fully sandboxed: this body is HTML from whoever sent the message, so
               it is not trusted. Nothing here reads contentWindow, so the frame has
               no reason to hold the app's origin. no-referrer keeps remote images
               from leaking the dashboard URL — or confirming to the sender that
               someone opened the message. */
            <iframe
              className="h-[500px] w-full rounded-md border bg-white"
              referrerPolicy="no-referrer"
              sandbox=""
              srcDoc={email.html}
              title="Email content"
            />
          ) : email.text ? (
            <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-mono text-sm">
              {email.text}
            </pre>
          ) : (
            <div className="text-muted-foreground text-sm">No message body</div>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      {email.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments ({email.attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {email.attachments.map((att) => (
                <div
                  className="flex items-center justify-between rounded-md border p-3"
                  key={att.id}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{att.filename}</div>
                      <div className="text-muted-foreground text-xs">
                        {att.contentType} &middot; {formatFileSize(att.size)}
                        {att.contentDisposition === "inline" && (
                          <Badge className="ml-2" variant="info">
                            inline
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Headers */}
      <Collapsible onOpenChange={setHeadersOpen} open={headersOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <span>Raw Headers</span>
                {headersOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-mono text-xs">
                {Object.entries(email.headers)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join("\n")}
              </pre>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
