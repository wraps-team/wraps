"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import { Input } from "@wraps/ui/components/ui/input";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { AlertTriangle, Check, Copy, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildDmarcRecord,
  DEFAULT_DMARC_INPUT,
  type DmarcAlignment,
  type DmarcFailureOption,
  type DmarcInput,
  type DmarcPolicy,
} from "@/lib/dmarc-builder";

const POLICIES: { value: DmarcPolicy; label: string }[] = [
  { value: "none", label: "none (monitor only)" },
  { value: "quarantine", label: "quarantine" },
  { value: "reject", label: "reject" },
];

const OPTIONAL_POLICIES: { value: DmarcPolicy | "unset"; label: string }[] = [
  { value: "unset", label: "Not set" },
  ...POLICIES,
];

const ALIGNMENTS: { value: DmarcAlignment; label: string }[] = [
  { value: "r", label: "Relaxed (default)" },
  { value: "s", label: "Strict" },
];

const FAILURE_OPTIONS: {
  value: DmarcFailureOption | "unset";
  label: string;
}[] = [
  { value: "unset", label: "Not set" },
  { value: "0", label: "0: both SPF and DKIM fail" },
  { value: "1", label: "1: either SPF or DKIM fails" },
  { value: "d", label: "d: DKIM fails" },
  { value: "s", label: "s: SPF fails" },
];

function CopyBox({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-2">
        <span className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
          {label}
        </span>
        <Button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
          }}
          size="sm"
          variant="ghost"
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-success" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-4 font-mono text-foreground text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: string;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  const classes =
    tone === "warning"
      ? "border-warning/30 bg-warning/5 text-warning"
      : "border-info/30 bg-info/5 text-info";
  return (
    <div className={`rounded-lg border p-3 ${classes}`}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-muted-foreground text-sm">{children}</p>
      </div>
    </div>
  );
}

export default function DmarcBuilderPageContent() {
  const [answers, setAnswers] = useState<DmarcInput>({
    ...DEFAULT_DMARC_INPUT,
  });
  const result = useMemo(() => buildDmarcRecord(answers), [answers]);

  function update<K extends keyof DmarcInput>(key: K, value: DmarcInput[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  const warnings = result.warnings.filter((w) => w.severity === "warning");
  const notes = result.warnings.filter((w) => w.severity === "info");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg tracking-tight">
            Your policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="dmarc-domain">Domain (optional)</Label>
            <Input
              id="dmarc-domain"
              onChange={(event) => update("domain", event.target.value)}
              placeholder="example.com"
              value={answers.domain}
            />
            <p className="text-muted-foreground text-xs">
              Used to name the DNS record and to spot report addresses on other
              domains. Nothing is sent anywhere.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmarc-policy">Policy (p)</Label>
            <Select
              onValueChange={(value) => update("policy", value as DmarcPolicy)}
              value={answers.policy}
            >
              <SelectTrigger id="dmarc-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dmarc-sp">Subdomain policy (sp)</Label>
              <Select
                onValueChange={(value) =>
                  update(
                    "subdomainPolicy",
                    value === "unset" ? "" : (value as DmarcPolicy)
                  )
                }
                value={answers.subdomainPolicy || "unset"}
              >
                <SelectTrigger id="dmarc-sp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTIONAL_POLICIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dmarc-np">Non-existent subdomains (np)</Label>
              <Select
                onValueChange={(value) =>
                  update(
                    "nonExistentSubdomainPolicy",
                    value === "unset" ? "" : (value as DmarcPolicy)
                  )
                }
                value={answers.nonExistentSubdomainPolicy || "unset"}
              >
                <SelectTrigger id="dmarc-np">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTIONAL_POLICIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              checked={answers.testing}
              id="dmarc-testing"
              onCheckedChange={(checked) => update("testing", checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="dmarc-testing">Testing mode (t=y)</Label>
              <p className="text-muted-foreground text-xs">
                Asks receivers not to enforce. DMARCbis uses this in place of
                the retired pct tag.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dmarc-adkim">DKIM alignment (adkim)</Label>
              <Select
                onValueChange={(value) =>
                  update("adkim", value as DmarcAlignment)
                }
                value={answers.adkim}
              >
                <SelectTrigger id="dmarc-adkim">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIGNMENTS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dmarc-aspf">SPF alignment (aspf)</Label>
              <Select
                onValueChange={(value) =>
                  update("aspf", value as DmarcAlignment)
                }
                value={answers.aspf}
              >
                <SelectTrigger id="dmarc-aspf">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIGNMENTS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmarc-rua">Aggregate report addresses (rua)</Label>
            <Textarea
              id="dmarc-rua"
              onChange={(event) => update("rua", event.target.value)}
              placeholder="dmarc@example.com"
              rows={2}
              value={answers.rua}
            />
            <p className="text-muted-foreground text-xs">
              One or more, separated by commas or new lines. mailto: is added
              for you.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmarc-ruf">Forensic report addresses (ruf)</Label>
            <Textarea
              id="dmarc-ruf"
              onChange={(event) => update("ruf", event.target.value)}
              placeholder="Optional. Many receivers never send these."
              rows={2}
              value={answers.ruf}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmarc-fo">Failure reporting options (fo)</Label>
            <Select
              onValueChange={(value) =>
                update(
                  "fo",
                  value === "unset" ? "" : (value as DmarcFailureOption)
                )
              }
              value={answers.fo || "unset"}
            >
              <SelectTrigger id="dmarc-fo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAILURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Only written to the record when a valid ruf address is set.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <CopyBox
          label={result.name ? `TXT record for ${result.name}` : "TXT record"}
          text={result.value}
        />
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="mb-1 font-medium">DNS record</p>
          <p className="text-muted-foreground">
            Type <span className="font-mono text-foreground">TXT</span>, name{" "}
            <span className="font-mono text-foreground">
              {result.name ?? "_dmarc.<yourdomain>"}
            </span>
            . Some DNS hosts want just{" "}
            <span className="font-mono text-foreground">_dmarc</span> in the
            name field.
          </p>
        </div>
        {warnings.map((warning) => (
          <Notice key={`${warning.id}-${warning.message}`} tone="warning">
            {warning.message}
          </Notice>
        ))}
        {notes.map((note) => (
          <Notice key={`${note.id}-${note.message}`} tone="info">
            {note.message}
          </Notice>
        ))}
      </div>
    </div>
  );
}
