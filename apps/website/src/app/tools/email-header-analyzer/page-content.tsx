"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { type AuthMethodResult, parseEmailHeaders } from "@/lib/email-headers";

type BadgeVariant = "success" | "warning" | "destructive" | "outline";

function resultVariant(result: string): BadgeVariant {
  if (result === "pass") {
    return "success";
  }
  if (result === "fail" || result === "permerror") {
    return "destructive";
  }
  if (result === "none") {
    return "outline";
  }
  return "warning";
}

function formatDelay(seconds: number | null): string {
  if (seconds === null) {
    return "-";
  }
  if (seconds === 0) {
    return "0s";
  }
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  if (abs < 60) {
    return `${sign}${abs}s`;
  }
  if (abs < 3600) {
    return `${sign}${Math.floor(abs / 60)}m ${abs % 60}s`;
  }
  return `${sign}${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="break-all font-mono text-sm">{value ?? "-"}</dd>
    </div>
  );
}

function AuthRow({ entry }: { entry: AuthMethodResult }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-border border-b py-2 last:border-b-0">
      <span className="w-14 font-mono text-sm uppercase">{entry.method}</span>
      <Badge variant={resultVariant(entry.result)}>{entry.result}</Badge>
      <span className="break-all font-mono text-muted-foreground text-sm">
        {entry.domain ?? "no domain reported"}
      </span>
    </div>
  );
}

export default function EmailHeaderAnalyzerPageContent() {
  // Plain state only. The pasted text must never reach the URL, storage or
  // any network call.
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseEmailHeaders(raw), [raw]);
  const hasInput = raw.trim().length > 0;
  const recognized = parsed.fields.length > 0;
  const { alignment } = parsed;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg tracking-tight">
            Paste the raw headers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="raw-headers">Raw message headers</Label>
          <Textarea
            autoComplete="off"
            className="font-mono text-xs"
            id="raw-headers"
            onChange={(event) => setRaw(event.target.value)}
            placeholder={
              "Received: from ...\nAuthentication-Results: ...\nFrom: ...\n(Gmail: three dots > Show original. Outlook: File > Properties.)"
            }
            rows={10}
            spellCheck={false}
            value={raw}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <Lock aria-hidden="true" className="h-3.5 w-3.5" />
              Parsed in your browser. Nothing is uploaded, stored, or put in the
              URL.
            </p>
            <Button
              disabled={!hasInput}
              onClick={() => setRaw("")}
              size="sm"
              variant="outline"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasInput && !recognized && (
        <p className="text-muted-foreground text-sm">
          No header lines found. Paste the block that starts at the top of the
          raw message, with lines like "From: ..." and "Received: ...".
        </p>
      )}

      {recognized && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg tracking-tight">
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parsed.auth.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No Authentication-Results header with SPF, DKIM or DMARC
                  results. Some receivers only add it on the final hop, so paste
                  headers from the received copy.
                </p>
              ) : (
                <div>
                  {parsed.auth.map((entry, i) => (
                    <AuthRow entry={entry} key={`${entry.method}-${i}`} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg tracking-tight">
                Return-Path vs From
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="space-y-2">
                <Row label="Return-Path" value={alignment.returnPathDomain} />
                <Row label="From" value={alignment.fromDomain} />
              </dl>
              {alignment.aligned === null ? (
                <p className="text-muted-foreground text-sm">
                  One of the two domains is missing, so alignment cannot be
                  judged.
                </p>
              ) : (
                <div className="space-y-2">
                  <Badge
                    variant={alignment.aligned ? "success" : "destructive"}
                  >
                    {alignment.aligned
                      ? alignment.exact
                        ? "Aligned (exact match)"
                        : "Aligned (relaxed)"
                      : "Not aligned"}
                  </Badge>
                  <p className="text-muted-foreground text-xs">
                    Heuristic: two domains count as aligned when their last two
                    labels match. That misjudges suffixes like co.uk. DMARC also
                    requires a passing SPF result for the Return-Path domain, or
                    a passing DKIM result for a matching d= domain.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-heading text-lg tracking-tight">
                Received chain, oldest first
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parsed.received.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No Received headers found.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Hop</th>
                        <th className="py-2 pr-4 font-medium">From</th>
                        <th className="py-2 pr-4 font-medium">By</th>
                        <th className="py-2 pr-4 font-medium">With</th>
                        <th className="py-2 pr-4 font-medium">Time</th>
                        <th className="py-2 font-medium">Delay</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {parsed.received.map((hop) => (
                        <tr className="border-border border-t" key={hop.index}>
                          <td className="py-2 pr-4">{hop.index}</td>
                          <td className="break-all py-2 pr-4">
                            {hop.from ?? "-"}
                          </td>
                          <td className="break-all py-2 pr-4">
                            {hop.by ?? "-"}
                          </td>
                          <td className="py-2 pr-4">{hop.protocol ?? "-"}</td>
                          <td className="py-2 pr-4">{hop.dateText ?? "-"}</td>
                          <td className="py-2">
                            {formatDelay(hop.delaySeconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-heading text-lg tracking-tight">
                Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2">
                <Row label="From" value={parsed.from} />
                <Row label="Return-Path" value={parsed.returnPath} />
                <Row label="Subject" value={parsed.subject} />
                <Row label="Date" value={parsed.date} />
                <Row label="Message-ID" value={parsed.messageId} />
              </dl>
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  Sending platform hints, from headers that are present:
                </p>
                {parsed.platforms.length === 0 ? (
                  <p className="text-sm">None of the known headers found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {parsed.platforms.map((platform) => (
                      <Badge key={platform} variant="info">
                        {platform}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
