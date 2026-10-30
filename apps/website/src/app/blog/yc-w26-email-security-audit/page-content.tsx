"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Check, Copy } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

export function DomainChecker() {
  const [domain, setDomain] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCheck = () => {
    if (domain.trim()) {
      window.open(
        `https://wraps.dev/tools?domain=${encodeURIComponent(domain.trim())}&utm_source=blog&utm_medium=yc-audit`,
        "_blank"
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/20"
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          placeholder="yourdomain.com"
          type="text"
          value={domain}
        />
        <Button className="shrink-0" onClick={handleCheck}>
          Check Your Grade
        </Button>
      </div>
      <button
        className="group flex w-full items-center justify-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground"
        onClick={() => {
          navigator.clipboard.writeText("npx mail-audit yourdomain.com");
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        type="button"
      >
        <span className="font-mono">npx mail-audit yourdomain.com</span>
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}

export function GradeBar({
  grade,
  count,
  total,
  color,
  description,
}: {
  grade: string;
  count: number;
  total: number;
  color: string;
  description: string;
}) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-bold text-lg ${color}`}
      >
        {grade}
      </div>
      <div className="flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-medium text-foreground text-sm">
            {count} companies ({pct}%)
          </span>
          <span className="text-muted-foreground text-xs">{description}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full w-(--pct) rounded-full transition-all duration-700 ${color.replace("text-", "bg-").replace("border-", "bg-")}`}
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}

export function GradeDistribution() {
  const grades = [
    {
      grade: "A",
      count: 45,
      color: "text-success-foreground border-success bg-success",
      description: "SPF + DKIM + DMARC enforcing",
    },
    {
      grade: "B",
      count: 54,
      color: "text-warning-foreground border-warning bg-warning",
      description: "All present, not enforcing",
    },
    {
      grade: "C",
      count: 38,
      color: "text-primary-foreground border-brand bg-primary",
      description: "Missing one record",
    },
    {
      grade: "D",
      count: 40,
      color: "text-destructive-foreground border-destructive bg-destructive",
      description: "Missing two records",
    },
    {
      grade: "F",
      count: 23,
      color: "text-destructive-foreground border-destructive bg-destructive",
      description: "No auth or critical failure",
    },
  ];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      {grades.map((g) => (
        <GradeBar key={g.grade} total={200} {...g} />
      ))}
    </div>
  );
}

export function StatCard({
  value,
  label,
  sublabel,
}: {
  value: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="font-bold text-3xl text-foreground">{value}</div>
      <div className="mt-1 font-medium text-foreground text-sm">{label}</div>
      {sublabel && (
        <div className="text-muted-foreground text-xs">{sublabel}</div>
      )}
    </div>
  );
}
