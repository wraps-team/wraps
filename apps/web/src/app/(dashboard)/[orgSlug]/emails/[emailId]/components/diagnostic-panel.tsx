"use client";

import type {
  DiagnosticSeverity,
  EventDiagnostics,
} from "@wraps/core/email-diagnostics";
import { Badge } from "@wraps/ui/components/ui/badge";

const SEVERITY_VARIANT: Record<
  DiagnosticSeverity,
  "destructive" | "secondary" | "outline"
> = {
  permanent: "destructive",
  transient: "secondary",
  success: "outline",
  info: "outline",
  unknown: "outline",
};

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  permanent: "Permanent",
  transient: "Transient",
  success: "Delivered",
  info: "Info",
  unknown: "Unknown",
};

function formatFieldValue(field: EventDiagnostics["fields"][number]): string {
  if (field.kind === "datetime") {
    const date = new Date(field.value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  }
  return field.value;
}

export function DiagnosticPanel({
  diagnostics,
}: {
  diagnostics: EventDiagnostics;
}) {
  const { headline, severity, fields, recipients } = diagnostics;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">{headline}</div>
        <Badge variant={SEVERITY_VARIANT[severity]}>
          {SEVERITY_LABEL[severity]}
        </Badge>
      </div>

      {fields.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {fields.map((field) => (
            <div className="flex flex-col gap-0.5" key={field.label}>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                {field.label}
              </dt>
              <dd className="break-words text-sm">{formatFieldValue(field)}</dd>
            </div>
          ))}
        </dl>
      )}

      {recipients && recipients.length > 0 && (
        <div className="mt-3 space-y-2">
          {recipients.map((recipient, index) => (
            <div
              className="rounded-md border bg-background/50 p-3"
              key={`${index}:${recipient.emailAddress}:${recipient.rawDiagnosticCode ?? ""}`}
            >
              <div className="break-words font-medium text-sm">
                {recipient.emailAddress}
              </div>

              {recipient.translation && (
                <div className="mt-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {recipient.translation.title}
                    </span>
                    {recipient.translation.provider && (
                      <Badge variant="secondary">
                        {recipient.translation.provider}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {recipient.translation.explanation}
                  </div>
                  {recipient.translation.suggestedAction && (
                    <div className="text-sm">
                      {recipient.translation.suggestedAction}
                    </div>
                  )}
                </div>
              )}

              {recipient.rawDiagnosticCode && (
                <pre className="mt-2 overflow-x-auto rounded-md bg-background/50 p-2 font-mono text-muted-foreground text-xs">
                  {recipient.rawDiagnosticCode}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
