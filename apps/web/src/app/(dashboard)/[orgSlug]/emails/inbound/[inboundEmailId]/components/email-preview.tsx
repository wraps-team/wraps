"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { InboundEmailDetail } from "@/lib/aws/s3-inbound";

type EmailPreviewProps = {
  email: InboundEmailDetail;
  orgSlug: string;
};

function formatAddress(addr: { address: string; name: string }): string {
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
  verdict: string | null | undefined;
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

export function EmailPreview({ email, orgSlug }: EmailPreviewProps) {
  const router = useRouter();
  const [headersOpen, setHeadersOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        onClick={() => router.push(`/${orgSlug}/emails/inbound`)}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to inbound
      </Button>

      {/*
        Header panel. The subject is the label; the title is truncated in the
        border, so the full subject sits in the tooltip.
        Every panel on this page reads the message out of the customer's S3
        bucket, so every one carries the `own` border.
      */}
      <Panel
        label={
          <PanelTitle
            className="min-w-0 max-w-md truncate"
            title={email.subject || "(no subject)"}
          >
            {email.subject || "(no subject)"}
          </PanelTitle>
        }
      >
        <div className="space-y-3">
          {/* Verdicts */}
          <div className="flex flex-wrap gap-2">
            <VerdictBadge label="Spam" verdict={email.spamVerdict} />
            <VerdictBadge label="Virus" verdict={email.virusVerdict} />
            <VerdictBadge
              label="DKIM"
              verdict={email.headers["x-ses-dkim-verdict"]}
            />
            <VerdictBadge
              label="SPF"
              verdict={email.headers["x-ses-spf-verdict"]}
            />
            <VerdictBadge
              label="DMARC"
              verdict={email.headers["x-ses-dmarc-verdict"]}
            />
          </div>

          {/* Message ID */}
          <code className="block truncate rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
            {email.messageId}
          </code>

          {/* From / To / CC */}
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="w-12 shrink-0 font-medium text-muted-foreground">
                From
              </span>
              <span className="font-mono">{formatAddress(email.from)}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-12 shrink-0 font-medium text-muted-foreground">
                To
              </span>
              <span className="font-mono">
                {email.to.map(formatAddress).join(", ") || "(no recipients)"}
              </span>
            </div>
            {email.cc.length > 0 && (
              <div className="flex gap-2">
                <span className="w-12 shrink-0 font-medium text-muted-foreground">
                  CC
                </span>
                <span className="font-mono">
                  {email.cc.map(formatAddress).join(", ")}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="w-12 shrink-0 font-medium text-muted-foreground">
                Date
              </span>
              <span>{new Date(email.receivedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Body */}
      <Panel
        description={
          email.htmlTruncated ? (
            <p className="text-sm text-warning">
              HTML content was truncated due to size limits
            </p>
          ) : undefined
        }
        label={<PanelTitle>Message Body</PanelTitle>}
      >
        {email.html ? (
          /* Fully sandboxed: this body is HTML from whoever sent the message, so
               it is not trusted. Nothing here reads contentWindow, so the frame has
               no reason to hold the app's origin. no-referrer keeps remote images
               from leaking the dashboard URL — or confirming to the sender that
               someone opened the message. */
          <iframe
            className="h-[500px] w-full rounded-md border bg-card"
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
          <p className="text-muted-foreground text-sm">No message body</p>
        )}
      </Panel>

      {/* Attachments */}
      {email.attachments.length > 0 && (
        <Panel
          label={
            <PanelTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments ({email.attachments.length})
            </PanelTitle>
          }
        >
          <div className="space-y-2">
            {email.attachments.map((att) => (
              <div
                className="flex items-center justify-between border p-4"
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
        </Panel>
      )}

      {/*
        Raw Headers. The collapse trigger lives in the label, so the chevron
        sits in the border; the body folds away beneath it.
      */}
      <Collapsible onOpenChange={setHeadersOpen} open={headersOpen}>
        <Panel
          label={
            <PanelTitle>
              <CollapsibleTrigger className="flex cursor-pointer items-center gap-2">
                <span>Raw Headers</span>
                {headersOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
            </PanelTitle>
          }
        >
          <CollapsibleContent>
            <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-mono text-xs">
              {Object.entries(email.headers)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
            </pre>
          </CollapsibleContent>
        </Panel>
      </Collapsible>
    </div>
  );
}
