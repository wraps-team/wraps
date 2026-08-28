"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import type { ToolUIPart } from "ai";
import { AlertCircle, Check, Loader2, Minus } from "lucide-react";
import { z } from "zod";
import type { ToolPartRenderer } from "@/components/ui/assistant-conversation";
import { cn } from "@/lib/utils";

const setupStatusOutput = z.object({
  hasAwsAccount: z.boolean(),
  hasPlatformConnection: z.boolean(),
  hasVerifiedDomain: z.boolean(),
  verifiedDomains: z.array(z.string()),
  hasSentEmail: z.boolean(),
  emailCount: z.number(),
  sandboxStatus: z.boolean().nullable(),
  awsRegion: z.string().nullable(),
  domainCount: z.number(),
});

const emailMetricsOutput = z.object({
  days: z.number(),
  totals: z.object({
    sent: z.number(),
    delivered: z.number(),
    bounced: z.number(),
    complaints: z.number(),
    opens: z.number(),
    clicks: z.number(),
    renderingFailures: z.number(),
  }),
  daily: z.array(z.unknown()), // not rendered here; kept loose on purpose
});

const recentSendsOutput = z.array(
  z.object({
    subject: z.string(),
    eventType: z.string(),
    timestampFormatted: z.string(),
  })
);

/** Tool name, no `tool-` prefix, for the compact status/fallback line. */
function toolDisplayName(part: ToolUIPart): string {
  return part.type.replace(/^tool-/, "");
}

function StatusLine({ part, failed }: { part: ToolUIPart; failed?: boolean }) {
  if (failed) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{toolDisplayName(part)} failed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      <span>{toolDisplayName(part)}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {value ? (
        <Check className="h-4 w-4 shrink-0 text-foreground" />
      ) : (
        <Minus className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn(!value && "text-muted-foreground")}>{label}</span>
    </div>
  );
}

export function SetupStatusCard({ part }: { part: ToolUIPart }) {
  if (part.state === "output-error") {
    return <StatusLine failed part={part} />;
  }
  if (part.state !== "output-available") {
    return <StatusLine part={part} />;
  }
  const parsed = setupStatusOutput.safeParse(part.output);
  if (!parsed.success) {
    return <StatusLine part={part} />;
  }
  const status = parsed.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <BoolRow label="AWS account connected" value={status.hasAwsAccount} />
        <BoolRow
          label="Platform connection"
          value={status.hasPlatformConnection}
        />
        <BoolRow
          label="Verified sending domain"
          value={status.hasVerifiedDomain}
        />
        <BoolRow label="Has sent email" value={status.hasSentEmail} />
        {status.verifiedDomains.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Verified domains: {status.verifiedDomains.join(", ")}
          </p>
        )}
        {status.awsRegion && (
          <p className="text-muted-foreground text-sm">
            Region: {status.awsRegion}
          </p>
        )}
        {status.sandboxStatus === true && (
          <p className="text-destructive text-sm">
            SES sandbox — sends only reach verified recipients.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatRate(count: number, total: number): string {
  if (total === 0) {
    return "—";
  }
  return `${((count / total) * 100).toFixed(1)}%`;
}

export function EmailMetricsCard({ part }: { part: ToolUIPart }) {
  if (part.state === "output-error") {
    return <StatusLine failed part={part} />;
  }
  if (part.state !== "output-available") {
    return <StatusLine part={part} />;
  }
  const parsed = emailMetricsOutput.safeParse(part.output);
  if (!parsed.success) {
    return <StatusLine part={part} />;
  }
  const { days, totals } = parsed.data;
  const bounceRate = formatRate(totals.bounced, totals.sent);
  const complaintRate = formatRate(totals.complaints, totals.sent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email metrics — last {days} days</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">Sent</p>
            <p className="font-medium text-sm">{totals.sent}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Delivered</p>
            <p className="font-medium text-sm">{totals.delivered}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Bounce rate</p>
            <p className="font-medium text-sm">{bounceRate}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Complaint rate</p>
            <p className="font-medium text-sm">{complaintRate}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecentSendsList({ part }: { part: ToolUIPart }) {
  if (part.state === "output-error") {
    return <StatusLine failed part={part} />;
  }
  if (part.state !== "output-available") {
    return <StatusLine part={part} />;
  }
  const parsed = recentSendsOutput.safeParse(part.output);
  if (!parsed.success) {
    return <StatusLine part={part} />;
  }
  const rows = parsed.data.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sends</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li className="text-sm" key={`${row.timestampFormatted}-${index}`}>
              <span className="font-medium">
                {row.subject || "(no subject)"}
              </span>{" "}
              <span className="text-muted-foreground">
                {row.eventType} ·{" "}
                {new Date(row.timestampFormatted).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export const ASSISTANT_TOOL_RENDERERS: Record<string, ToolPartRenderer> = {
  get_setup_status: (part) => <SetupStatusCard part={part} />,
  get_email_metrics: (part) => <EmailMetricsCard part={part} />,
  list_recent_sends: (part) => <RecentSendsList part={part} />,
};
