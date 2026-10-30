"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Input } from "@wraps/ui/components/ui/input";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wraps/ui/components/ui/tabs";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { AlertTriangle, Check, Copy, Info, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  type BounceHandling,
  buildAppealReply,
  buildProductionAccessRequest,
  DEFAULT_REQUEST_ANSWERS,
  type DenialDiagnosis,
  diagnoseDenial,
  type MailType,
  type OptInMethod,
  type RequestAnswers,
  SES_NEW_ACCOUNT_NOTE,
  type UnsubscribeMechanism,
  type VolumePeriod,
} from "@/lib/ses-production-access";
import { trackEvent } from "@/utils/analytics";

type Mode = "build" | "diagnose";

const MAIL_TYPES: { value: MailType; label: string }[] = [
  { value: "transactional", label: "Transactional only" },
  { value: "newsletter", label: "Newsletter or announcements" },
  { value: "both", label: "Both" },
];

const OPT_IN_METHODS: { value: OptInMethod; label: string }[] = [
  {
    value: "form-double-opt-in",
    label: "Signup form with a confirmation email",
  },
  { value: "in-app-signup", label: "They created an account in the product" },
  { value: "imported-customers", label: "Imported existing customers" },
  { value: "other", label: "Something else — I'll describe it" },
];

const BOUNCE_HANDLING: { value: BounceHandling; label: string }[] = [
  { value: "ses-event-destination", label: "SES event destination" },
  { value: "webhook", label: "Webhook into my application" },
  { value: "manual", label: "Notifications to a mailbox I read" },
  { value: "none", label: "None yet" },
];

const UNSUBSCRIBE: { value: UnsubscribeMechanism; label: string }[] = [
  { value: "both", label: "List-Unsubscribe headers and an in-email link" },
  { value: "list-unsubscribe-header", label: "List-Unsubscribe headers" },
  { value: "in-email-link", label: "Link in the email body" },
  { value: "none", label: "None yet" },
];

const VOLUME_PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: "month", label: "per month" },
  { value: "day", label: "per day" },
];

function CopyBox({
  text,
  label,
  onCopy,
}: {
  text: string;
  label: string;
  onCopy: () => void;
}) {
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
            onCopy();
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
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-foreground text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "warning" | "info";
  title: string;
  children: ReactNode;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  const classes =
    tone === "warning"
      ? "border-warning/30 bg-warning/5 text-warning"
      : "border-info/30 bg-info/5 text-info";

  return (
    <div className={`rounded-lg border p-4 ${classes}`}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">{title}</p>
          <div className="space-y-2 text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BuildMode() {
  const [answers, setAnswers] = useState<RequestAnswers>(
    DEFAULT_REQUEST_ANSWERS
  );
  const built = useMemo(() => buildProductionAccessRequest(answers), [answers]);
  const [generated, setGenerated] = useState(false);

  function update<K extends keyof RequestAnswers>(
    key: K,
    value: RequestAnswers[K]
  ) {
    setAnswers((current) => ({ ...current, [key]: value }));
    if (!generated) {
      setGenerated(true);
      trackEvent("ses_production_access_request_generated", {
        tool: "ses-production-access",
      });
    }
  }

  const blocking = built.warnings.filter((warning) => warning.blocking);
  const advisories = built.warnings.filter((warning) => !warning.blocking);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg tracking-tight">
            Six answers AWS never asks for
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="mail-type">What you send</Label>
            <Select
              onValueChange={(value) => update("mailType", value as MailType)}
              value={answers.mailType}
            >
              <SelectTrigger id="mail-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAIL_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="opt-in">How recipients end up on your list</Label>
            <Select
              onValueChange={(value) => update("optIn", value as OptInMethod)}
              value={answers.optIn}
            >
              <SelectTrigger id="opt-in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPT_IN_METHODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              id="opt-in-detail"
              onChange={(event) => update("optInDetail", event.target.value)}
              placeholder="Optional: one sentence in your own words. Required if you picked 'something else'."
              rows={3}
              value={answers.optInDetail}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website URL</Label>
            <Input
              id="website"
              onChange={(event) => update("websiteUrl", event.target.value)}
              placeholder="https://yourapp.com"
              value={answers.websiteUrl}
            />
            <p className="text-muted-foreground text-xs">
              A reviewer opens this. It has to explain the mail without an
              account.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bounce">Bounce and complaint handling</Label>
            <Select
              onValueChange={(value) =>
                update("bounceHandling", value as BounceHandling)
              }
              value={answers.bounceHandling}
            >
              <SelectTrigger id="bounce">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOUNCE_HANDLING.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unsubscribe">Unsubscribe mechanism</Label>
            <Select
              onValueChange={(value) =>
                update("unsubscribe", value as UnsubscribeMechanism)
              }
              value={answers.unsubscribe}
            >
              <SelectTrigger id="unsubscribe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNSUBSCRIBE.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume">Expected volume</Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                id="volume"
                inputMode="numeric"
                min={0}
                onChange={(event) =>
                  update("volume", Number.parseInt(event.target.value, 10))
                }
                type="number"
                value={Number.isFinite(answers.volume) ? answers.volume : ""}
              />
              <Select
                onValueChange={(value) =>
                  update("volumePeriod", value as VolumePeriod)
                }
                value={answers.volumePeriod}
              >
                <SelectTrigger className="w-36" id="volume-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOLUME_PERIODS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {blocking.length > 0 && (
          <Callout
            title="Fix these before you submit — the request says so, it does not cover for you"
            tone="warning"
          >
            <ul className="list-disc space-y-1 pl-4">
              {blocking.map((warning) => (
                <li key={`${warning.field}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {advisories.length > 0 && (
          <Callout title="Worth tightening" tone="info">
            <ul className="list-disc space-y-1 pl-4">
              {advisories.map((warning) => (
                <li key={`${warning.field}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        <CopyBox
          label="Paste into the use-case description, or reply on the case"
          onCopy={() =>
            trackEvent("ses_production_access_copy_clicked", {
              tool: "ses-production-access",
              artifact: "request",
            })
          }
          text={built.text}
        />

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-heading text-base tracking-tight">
              Before you send this
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              Verify the sending <strong>domain</strong>, not a single address,
              and let DKIM leave Pending first. An account with one verified
              address gives the reviewer nothing to check —{" "}
              <Link
                className="text-brand-text underline underline-offset-2"
                href="/docs/guides/domain-verification"
              >
                domain verification guide
              </Link>
              .
            </p>
            <p>
              Nothing you type here leaves your browser. The text is assembled
              locally, from fixed templates, so the same answers always produce
              the same words.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DiagnoseMode() {
  const [text, setText] = useState("");
  const [diagnosis, setDiagnosis] = useState<DenialDiagnosis | null>(null);

  function run() {
    const result = diagnoseDenial(text);
    setDiagnosis(result);
    trackEvent("ses_production_access_denial_diagnosed", {
      tool: "ses-production-access",
      // The matched gap ids only. The pasted text is never sent anywhere.
      matched_gaps: result.matched.map((gap) => gap.id).join(","),
      generic: result.generic,
      unrecognized: result.unrecognized,
    });
  }

  const appeal = diagnosis ? buildAppealReply(diagnosis) : "";

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg tracking-tight">
            Paste what AWS sent you
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label className="sr-only" htmlFor="denial-text">
            Denial text from your AWS Support Center case
          </Label>
          <Textarea
            id="denial-text"
            onChange={(event) => setText(event.target.value)}
            placeholder="We reviewed your request and determined that your use of Amazon SES could have a negative impact on our service..."
            rows={8}
            value={text}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} variant="brand">
              <Search className="mr-2 h-4 w-4" />
              Match it against the four gaps
            </Button>
            <p className="text-muted-foreground text-xs">
              Matched in your browser with plain keyword rules. No upload, no
              model, no account.
            </p>
          </div>
        </CardContent>
      </Card>

      {diagnosis?.unrecognized && (
        <Callout title="That does not read like an SES decision" tone="info">
          <p>
            Paste the body of the Support Center case AWS opened for your
            request — the part that says why. If the case only carries the
            boilerplate refusal, paste that; it is a known shape and the tool
            handles it.
          </p>
        </Callout>
      )}

      {diagnosis?.generic && (
        <Callout
          title="This is the boilerplate denial — it names nothing"
          tone="info"
        >
          <p>
            &ldquo;Could have a negative impact on our service&rdquo; is what
            AWS sends when the request did not answer the questions the form
            never asked. There is no gap to narrow to, so close all four.
          </p>
        </Callout>
      )}

      {diagnosis && diagnosis.matched.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {diagnosis.matched.map((gap) => (
              <Card className="border-border bg-card" key={gap.id}>
                <CardHeader>
                  <CardTitle className="font-heading text-base tracking-tight">
                    {gap.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{gap.summary}</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {gap.remediation.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <Callout
            title="A denial is not final, and the reply is not a new request"
            tone="warning"
          >
            <p>
              Fix the gaps above first, then reply on the existing Support
              Center case AWS opened for this request. Opening a fresh
              production-access request instead throws away the context the
              reviewer already has.
            </p>
            <p>{SES_NEW_ACCOUNT_NOTE}</p>
          </Callout>

          <CopyBox
            label="Draft reply for the existing support case"
            onCopy={() =>
              trackEvent("ses_production_access_copy_clicked", {
                tool: "ses-production-access",
                artifact: "appeal",
              })
            }
            text={appeal}
          />
        </div>
      )}
    </div>
  );
}

export default function SESProductionAccessPageContent() {
  const [mode, setMode] = useState<Mode>("build");

  useEffect(() => {
    trackEvent("ses_production_access_tool_viewed", {
      tool: "ses-production-access",
    });
  }, []);

  return (
    <Tabs
      onValueChange={(value) => {
        setMode(value as Mode);
        trackEvent("ses_production_access_mode_chosen", {
          tool: "ses-production-access",
          mode: value,
        });
      }}
      value={mode}
    >
      <TabsList className="mb-6">
        <TabsTrigger value="build">Build the request</TabsTrigger>
        <TabsTrigger value="diagnose">Diagnose a denial</TabsTrigger>
      </TabsList>
      <TabsContent value="build">
        <BuildMode />
      </TabsContent>
      <TabsContent value="diagnose">
        <DiagnoseMode />
      </TabsContent>
    </Tabs>
  );
}
