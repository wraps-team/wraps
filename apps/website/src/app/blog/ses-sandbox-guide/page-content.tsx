"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  RefreshCw,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useEffect, useState } from "react";

// ============================================================================
// DATA
// ============================================================================
const checklistData = [
  {
    id: "technical-setup",
    title: "Technical Setup",
    items: [
      {
        id: "domain-verified",
        title: "Verify your domain in SES",
        description:
          "Not formally required, but AWS says verifying a domain first helps the request get approved faster — and a single verified address gives a reviewer nothing to check",
        recommended: true,
      },
      {
        id: "dkim-enabled",
        title: "Enable Easy DKIM",
        description: 'Add all 3 CNAME records and wait for "Verified" status',
        required: true,
      },
      {
        id: "spf-record",
        title: "Publish SPF record",
        description:
          "v=spf1 include:amazonses.com ~all on your MAIL FROM subdomain",
        required: true,
      },
      {
        id: "dmarc-record",
        title: "Publish DMARC policy",
        description: "Start with p=none for monitoring, can strengthen later",
        recommended: true,
      },
      {
        id: "sns-bounces",
        title: "Configure SNS for bounces",
        description: "Create SNS topic and subscribe your endpoint",
        recommended: true,
      },
      {
        id: "sns-complaints",
        title: "Configure SNS for complaints",
        description: "Create separate SNS topic for complaint notifications",
        recommended: true,
      },
    ],
  },
  {
    id: "account-profile",
    title: "Account & Profile",
    items: [
      {
        id: "business-email",
        title: "Use business email on AWS account",
        description: "Avoid Gmail, Hotmail, etc. Use your domain email",
      },
      {
        id: "website-live",
        title: "Live website on your domain",
        description:
          'Not a parked page or "coming soon" — real content showing your business',
        recommended: true,
      },
      {
        id: "privacy-policy",
        title: "Privacy policy published",
        description: "Accessible privacy policy on your website",
      },
      {
        id: "contact-info",
        title: "Contact information visible",
        description: "Email or contact form on your website",
      },
    ],
  },
  {
    id: "request-preparation",
    title: "Request Preparation",
    items: [
      {
        id: "use-case-detailed",
        title: "Know what the form actually asks",
        description:
          "Marketing or transactional, a website URL, up to 4 contact addresses, a language and an acknowledgement — there is no free-text use-case box. Save the detail for the support case if AWS comes back asking",
        required: true,
      },
      {
        id: "consent-explained",
        title: "Explain consent/opt-in mechanism",
        description: "How do recipients sign up? Where do they consent?",
        recommended: true,
      },
      {
        id: "bounce-handling-documented",
        title: "Document bounce handling process",
        description: "What happens when an email bounces? Auto-suppression?",
        recommended: true,
      },
      {
        id: "complaint-handling-documented",
        title: "Document complaint handling process",
        description: "How do you handle spam complaints? Immediate removal?",
        recommended: true,
      },
      {
        id: "volume-realistic",
        title: "Provide realistic volume estimates",
        description: "Current volume and 6-month projection with justification",
      },
      {
        id: "unsubscribe-explained",
        title: "Explain unsubscribe mechanism",
        description:
          "One-click unsubscribe for marketing, suppression list for all",
      },
    ],
  },
];

const templateDefaults = {
  companyName: "",
  websiteUrl: "",
  useCase: "transactional",
  emailTypes: "",
  currentVolume: "",
  projectedVolume: "",
  consentMechanism: "",
};

// ============================================================================
// COMPONENTS
// ============================================================================

const InfoCard = ({
  type = "tip",
  icon: Icon,
  title,
  children,
}: {
  type?: "tip" | "warning" | "danger";
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => {
  const styles = {
    tip: "border-success/50 bg-success/10",
    warning: "border-warning/50 bg-warning/10",
    danger: "border-destructive/50 bg-destructive/10",
  };
  const iconStyles = {
    tip: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  };

  return (
    <div className={`my-6 rounded-xl border p-4 ${styles[type]}`}>
      <div
        className={`mb-2 flex items-center gap-2 font-semibold ${iconStyles[type]}`}
      >
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="text-foreground/80 text-sm">{children}</p>
    </div>
  );
};

const CodeBlock = ({
  label,
  children,
}: {
  label: string;
  children: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="font-mono text-muted-foreground text-xs">{label}</span>
        <button
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
            copied
              ? "bg-success/20 text-success"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-foreground text-sm">
        {children}
      </pre>
    </div>
  );
};

const Collapsible = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-muted/30">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left font-medium transition-colors hover:bg-muted/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        {title}
      </button>
      {isOpen && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
};

// Checklist Components
const ChecklistGroup = ({
  group,
  checkedItems,
  onToggle,
}: {
  group: (typeof checklistData)[0];
  checkedItems: string[];
  onToggle: (id: string) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const completedCount = group.items.filter((item) =>
    checkedItems.includes(item.id)
  ).length;
  const isComplete = completedCount === group.items.length;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 text-left font-medium">{group.title}</span>
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs ${
            isComplete
              ? "bg-success/20 text-success"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {completedCount}/{group.items.length}
        </span>
      </button>
      {isExpanded && (
        <div className="space-y-1 px-4 pb-3">
          {group.items.map((item) => (
            <button
              className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-all ${
                checkedItems.includes(item.id)
                  ? "bg-muted/30 opacity-60"
                  : "hover:bg-muted/50"
              }`}
              key={item.id}
              onClick={() => onToggle(item.id)}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  checkedItems.includes(item.id)
                    ? "border-success bg-success text-success-foreground"
                    : "border-muted-foreground"
                }`}
              >
                {checkedItems.includes(item.id) && (
                  <Check className="h-3 w-3" />
                )}
              </div>
              <div className="flex-1">
                <div
                  className={`font-medium ${checkedItems.includes(item.id) ? "line-through" : ""}`}
                >
                  {item.title}
                </div>
                <div className="text-muted-foreground text-sm">
                  {item.description}
                </div>
                {item.required && (
                  <span className="mt-1 inline-block rounded bg-destructive/20 px-2 py-0.5 font-mono text-destructive text-xs dark:text-destructive">
                    Required
                  </span>
                )}
                {item.recommended && (
                  <span className="mt-1 inline-block rounded bg-info/20 px-2 py-0.5 font-mono text-info text-xs dark:text-info">
                    Recommended
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ReadinessChecklist = ({
  checkedItems,
  setCheckedItems,
}: {
  checkedItems: string[];
  setCheckedItems: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  const totalItems = checklistData.reduce(
    (acc, group) => acc + group.items.length,
    0
  );
  const checkedCount = checkedItems.length;

  const handleToggle = (itemId: string) => {
    setCheckedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  return (
    <Card className="overflow-hidden scroll-mt-24" id="pre-request-checklist">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-4 w-4 text-primary" />
          Pre-Request Checklist
        </div>
        <div className="font-mono text-muted-foreground text-sm">
          {checkedCount} of {totalItems} complete
        </div>
      </div>
      {checklistData.map((group) => (
        <ChecklistGroup
          checkedItems={checkedItems}
          group={group}
          key={group.id}
          onToggle={handleToggle}
        />
      ))}
    </Card>
  );
};

// Decision Flow Diagram
const DecisionFlowDiagram = () => (
  <div className="my-8 space-y-4">
    <div className="rounded-xl border border-primary/50 bg-primary/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Decision
      </div>
      <div className="font-semibold">
        Is your domain verified with Easy DKIM enabled?
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-center font-mono text-success text-sm dark:text-success">
          YES
        </div>
        <div className="rounded-xl border border-info/50 bg-info/5 p-4">
          <div className="font-semibold">Check custom MAIL FROM</div>
          <div className="text-muted-foreground text-sm">
            Verify SPF record is published
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-center font-mono text-destructive text-sm dark:text-destructive">
          NO
        </div>
        <div className="rounded-xl border border-warning/50 bg-warning/5 p-4">
          <div className="font-semibold">Stop — Complete DNS setup first</div>
          <div className="text-muted-foreground text-sm">
            Requests without DKIM are almost always denied
          </div>
        </div>
      </div>
    </div>

    <div className="flex justify-center py-2">
      <ArrowDown className="h-5 w-5 text-muted-foreground" />
    </div>

    <div className="rounded-xl border border-primary/50 bg-primary/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Decision
      </div>
      <div className="font-semibold">
        Is SNS configured for bounces AND complaints?
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-center font-mono text-success text-sm dark:text-success">
          YES
        </div>
        <div className="rounded-xl border border-info/50 bg-info/5 p-4">
          <div className="font-semibold">Answer what the form leaves out</div>
          <div className="text-muted-foreground text-sm">
            There is no free-text box — the detail goes on the support case if
            AWS asks
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-center font-mono text-destructive text-sm dark:text-destructive">
          NO
        </div>
        <div className="rounded-xl border border-warning/50 bg-warning/5 p-4">
          <div className="font-semibold">Configure SNS topics</div>
          <div className="text-muted-foreground text-sm">
            Required for bounce/complaint handling proof
          </div>
        </div>
      </div>
    </div>

    <div className="flex justify-center py-2">
      <ArrowDown className="h-5 w-5 text-muted-foreground" />
    </div>

    <div className="rounded-xl border border-success/50 bg-success/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Ready
      </div>
      <div className="font-semibold">Submit production access request</div>
      <div className="text-muted-foreground text-sm">
        Expect initial response within 24 hours
      </div>
    </div>
  </div>
);

// Template Builder
const TemplateBuilder = ({
  formData,
  setFormData,
}: {
  formData: typeof templateDefaults;
  setFormData: React.Dispatch<React.SetStateAction<typeof templateDefaults>>;
}) => {
  const [copied, setCopied] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateTemplate = () => {
    const {
      companyName,
      websiteUrl,
      useCase,
      emailTypes,
      currentVolume,
      projectedVolume,
      consentMechanism,
    } = formData;

    return `We operate ${companyName || "[Company Name]"} at ${websiteUrl || "[website URL]"}, a ${useCase === "transactional" ? "software platform" : "business"} requiring Amazon SES for ${useCase} email communications.

EMAIL USE CASE AND TYPES
${
  emailTypes ||
  `[Describe the specific types of emails you send, e.g.:
- Account verification emails when users sign up
- Password reset emails triggered by user requests
- Order confirmations after purchases
- Shipping notifications when orders are dispatched]`
}

These emails are ${useCase === "transactional" ? "not marketing communications—they are triggered by specific user actions and are essential to our service operation" : "sent only to subscribers who have explicitly opted in to receive our communications"}.

TECHNICAL IMPLEMENTATION
Our domain is fully verified with Easy DKIM enabled (all 3 CNAME records verified). We have configured a custom MAIL FROM domain with proper SPF alignment. Our DMARC policy is published and actively monitored.

We have configured Amazon SNS topics for both bounce and complaint notifications:
- Bounce notifications trigger automatic removal of the failed address from our active sending list
- Complaint notifications result in immediate suppression of the complainant's address

CONSENT AND OPT-IN MECHANISM
${
  consentMechanism ||
  `[Explain how users consent to receive emails:
- Users provide their email during account registration
- Checkbox confirming acceptance of Terms of Service and Privacy Policy
- Double opt-in confirmation for marketing communications]`
}

VOLUME ESTIMATES
Current sending volume: ${currentVolume || "[X]"} emails per day
Projected volume (6 months): ${projectedVolume || "[Y]"} emails per day

Our sending pattern is gradual and event-driven, not bulk blasts. Volume increases correlate with organic user growth.

BOUNCE AND COMPLAINT HANDLING
Bounce handling: Our system receives SNS notifications for bounced emails. Hard bounces are immediately and permanently suppressed—these addresses are never retried. Soft bounces are retried up to 3 times with exponential backoff before being suppressed.

Complaint handling: Any complaint results in immediate removal from all future communications. We manually review each complaint to identify potential issues with our email content or targeting.

UNSUBSCRIBE PROCESS
${useCase === "transactional" ? "As these are transactional emails essential to service operation, users manage their notification preferences through their account settings. Users can disable non-essential notifications while still receiving critical account and security emails." : "All marketing emails include a one-click unsubscribe link in the footer. Unsubscribe requests are processed immediately and the email address is added to our suppression list."}

We are committed to maintaining excellent deliverability and sender reputation. We understand that our use of SES reflects on all SES customers, and we take this responsibility seriously.`;
  };

  const template = generateTemplate();
  const wordCount = template.split(/\s+/).filter(Boolean).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="font-semibold">Request Template Builder</div>
        <div className="text-muted-foreground text-sm">
          Fill in your details to generate a production-ready request
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label className="mb-1.5 block font-medium text-sm">
            Company / Product Name
          </label>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => handleChange("companyName", e.target.value)}
            placeholder="Acme Corp"
            type="text"
            value={formData.companyName}
          />
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-sm">
            Website URL
          </label>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => handleChange("websiteUrl", e.target.value)}
            placeholder="https://acme.com"
            type="text"
            value={formData.websiteUrl}
          />
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-sm">
            Primary Use Case
          </label>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => handleChange("useCase", e.target.value)}
            value={formData.useCase}
          >
            <option value="transactional">
              Transactional (account alerts, receipts, etc.)
            </option>
            <option value="marketing">
              Marketing (newsletters, promotions)
            </option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-sm">
            Specific Email Types
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => handleChange("emailTypes", e.target.value)}
            placeholder="- Account verification emails&#10;- Password reset requests&#10;- Order confirmations"
            value={formData.emailTypes}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block font-medium text-sm">
              Current Daily Volume
            </label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => handleChange("currentVolume", e.target.value)}
              placeholder="500"
              type="text"
              value={formData.currentVolume}
            />
          </div>
          <div>
            <label className="mb-1.5 block font-medium text-sm">
              Projected Daily Volume (6 months)
            </label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => handleChange("projectedVolume", e.target.value)}
              placeholder="2,000"
              type="text"
              value={formData.projectedVolume}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-medium text-sm">
            Consent / Opt-in Mechanism
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => handleChange("consentMechanism", e.target.value)}
            placeholder="Describe how users sign up and consent to receive emails"
            value={formData.consentMechanism}
          />
        </div>
      </div>

      <div className="border-t bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium text-muted-foreground text-sm">
            Generated Request Text
          </span>
          <button
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              copied
                ? "bg-success/20 text-success"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy to Clipboard
              </>
            )}
          </button>
        </div>
        <div
          aria-label={copied ? "Copied to clipboard" : "Click to copy template"}
          className="group relative w-full cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={handleCopy}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCopy();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-4 font-mono text-foreground/80 text-sm leading-relaxed transition-colors group-hover:border-primary/50 group-hover:bg-accent/30">
            {template}
          </pre>
          <span
            className={`pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium text-xs transition-opacity ${
              copied
                ? "bg-success/20 text-success opacity-100 dark:text-success"
                : "bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Click to copy
              </>
            )}
          </span>
        </div>
        <div
          className={`mt-3 flex items-center gap-2 font-mono text-sm ${wordCount >= 400 ? "text-success" : "text-warning"}`}
        >
          <FileText className="h-4 w-4" />
          {wordCount} words{" "}
          {wordCount >= 400 ? "— Good length" : "— Try to reach ~400+ words"}
        </div>
      </div>
    </Card>
  );
};

// Denial Recovery Flow
const DenialRecoveryFlow = () => (
  <div className="my-8 space-y-4">
    <div className="rounded-xl border border-warning/50 bg-warning/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Status
      </div>
      <div className="font-semibold">Request Denied</div>
      <div className="text-muted-foreground text-sm">
        Don't panic — first-time denial is extremely common
      </div>
    </div>

    <div className="flex justify-center py-2">
      <ArrowDown className="h-5 w-5 text-muted-foreground" />
    </div>

    <div className="rounded-xl border border-primary/50 bg-primary/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Decision
      </div>
      <div className="font-semibold">Is this your first denial?</div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-center font-mono text-success text-sm dark:text-success">
          YES — First denial
        </div>
        <div className="rounded-xl border border-info/50 bg-info/5 p-4">
          <div className="font-semibold">Reply on the case AWS opened</div>
          <div className="text-muted-foreground text-sm">
            Fix the gap first, then reply on the existing case with your tech
            setup, consent flow and handling. Do not open a fresh request.
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-center font-mono text-destructive text-sm dark:text-destructive">
          Multiple denials
        </div>
        <div className="rounded-xl border border-info/50 bg-info/5 p-4">
          <div className="font-semibold">Request escalation</div>
          <div className="text-muted-foreground text-sm">
            Reply on the same case and list only changes you have already made —
            AWS says outright not to include steps you plan to take.
          </div>
        </div>
      </div>
    </div>

    <div className="flex justify-center py-2">
      <ArrowDown className="h-5 w-5 text-muted-foreground" />
    </div>

    <div className="rounded-xl border border-info/50 bg-info/5 p-4">
      <div className="mb-1 font-mono text-muted-foreground text-xs uppercase tracking-wider">
        Action
      </div>
      <div className="mb-2 font-semibold">Attach supporting evidence</div>
      <ul className="space-y-1 text-muted-foreground text-sm">
        <li>• Previous ESP invoices (SendGrid, Mailgun, etc.)</li>
        <li>• Social media presence with engaged following</li>
        <li>• Press coverage or customer testimonials</li>
        <li>• Screenshots of your email setup</li>
      </ul>
    </div>
  </div>
);

// Progress Header
const ProgressHeader = ({
  progress,
  approval,
}: {
  progress: number;
  approval: { level: string; text: string };
}) => (
  <div className="sticky top-16 z-40 border-b bg-background/95 py-3 backdrop-blur-sm">
    <div className="container mx-auto flex items-center gap-4 px-4">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full w-(--progress) rounded-full bg-gradient-to-r from-primary/80 via-primary to-primary/80 transition-all duration-500"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        />
      </div>
      <div className="font-mono text-primary text-sm">{progress}%</div>
      <div
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm ${
          approval.level === "high"
            ? "bg-success/20 text-success"
            : approval.level === "medium"
              ? "bg-warning/20 text-warning"
              : "bg-destructive/20 text-destructive"
        }`}
      >
        {approval.level === "high" && <CheckCircle className="h-4 w-4" />}
        {approval.level === "medium" && <Clock className="h-4 w-4" />}
        {approval.level === "low" && <AlertTriangle className="h-4 w-4" />}
        {approval.text}
      </div>
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function SandboxGuideContent() {
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [formData, setFormData] = useState(templateDefaults);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ses-guide-checklist");
    if (saved) {
      try {
        setCheckedItems(JSON.parse(saved));
      } catch (_e) {
        console.error("Failed to parse saved checklist");
      }
    }
    setIsLoaded(true);
  }, []);

  // Save checklist state (only after initial load)
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("ses-guide-checklist", JSON.stringify(checkedItems));
    }
  }, [checkedItems, isLoaded]);

  // Calculate progress
  const totalItems = checklistData.reduce(
    (acc, group) => acc + group.items.length,
    0
  );
  const progress = Math.round((checkedItems.length / totalItems) * 100);

  const getApprovalLikelihood = () => {
    if (progress >= 80) {
      return { level: "high", text: "High likelihood" };
    }
    if (progress >= 50) {
      return { level: "medium", text: "Medium likelihood" };
    }
    return { level: "low", text: "Low likelihood" };
  };

  const approval = getApprovalLikelihood();

  return (
    <>
      {/* Progress Bar */}
      <ProgressHeader approval={approval} progress={progress} />

      {/* Main Content */}
      <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
        {/* Why Requests Get Denied */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Why Most Requests Get Denied</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Amazon SES sandbox restrictions exist to protect their email
            infrastructure's reputation. Getting out requires proving you
            understand email deliverability — not just that you have a
            legitimate business.
          </p>

          <InfoCard icon={AlertTriangle} title="2024 Change" type="warning">
            While AWS documentation calls email authentication "strongly
            recommended," community reports indicate that requests without SPF,
            DKIM, and DMARC configured are frequently denied. Set up your DNS
            records before submitting.
          </InfoCard>
        </section>

        {/* Checklist */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <CheckCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">
              Pre-Request Readiness Checklist
            </h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Complete every required item before submitting. Your progress is
            saved automatically. Each checkbox you complete increases your
            approval likelihood.
          </p>

          <ReadinessChecklist
            checkedItems={checkedItems}
            setCheckedItems={setCheckedItems}
          />
        </section>

        {/* Decision Flow */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Are You Ready to Submit?</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Walk through this decision tree to confirm you've completed the
            critical steps. If you hit a "Stop" node, complete that step first.
          </p>

          <DecisionFlowDiagram />
        </section>

        {/* DNS Configuration */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">DNS Configuration</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Your DNS records are the foundation of email authentication. Here's
            exactly what you need.
          </p>

          <Collapsible defaultOpen title="SPF Record for Custom MAIL FROM">
            <p className="mb-3 text-muted-foreground text-sm">
              Add this TXT record to your MAIL FROM subdomain (e.g.,
              mail.yourdomain.com):
            </p>
            <CodeBlock label="TXT Record">
              v=spf1 include:amazonses.com ~all
            </CodeBlock>
          </Collapsible>

          <Collapsible title="DMARC Policy Record">
            <p className="mb-3 text-muted-foreground text-sm">
              Add this TXT record to _dmarc.yourdomain.com. Start with p=none
              for monitoring:
            </p>
            <CodeBlock label="TXT Record">
              v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
            </CodeBlock>
            <InfoCard icon={CheckCircle} title="DMARC Progression" type="tip">
              After monitoring for a few weeks with no issues, strengthen to
              p=quarantine, then p=reject.
            </InfoCard>
          </Collapsible>

          <Collapsible title="DKIM CNAME Records">
            <p className="text-muted-foreground text-sm">
              AWS provides 3 CNAME records when you enable Easy DKIM. Add all
              three — your domain won't show "Verified" until all records
              propagate.
            </p>
          </Collapsible>

          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-foreground/90 text-sm">
              <strong>Verify your setup:</strong> Use our{" "}
              <a className="text-primary hover:underline" href="/tools">
                free domain analyzer
              </a>{" "}
              to check if your SPF, DKIM, and DMARC records are correctly
              configured before submitting your production request.
            </p>
          </div>
        </section>

        {/* Template Builder */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Request Template Builder</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Fill in your details to generate a comprehensive production access
            request. The template includes all the sections AWS reviewers look
            for.
          </p>

          <TemplateBuilder formData={formData} setFormData={setFormData} />

          <InfoCard icon={CheckCircle} title="Pro Tip" type="tip">
            Copy the generated text and paste it into the "Use case description"
            field in the SES console. Don't be afraid to make it longer —
            detailed requests dramatically outperform brief ones.
          </InfoCard>
        </section>

        {/* Mid-page CTA — reached after users have their template in hand */}
        <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-primary text-xs uppercase tracking-wider">
                <Zap className="h-3 w-3" /> One command
              </div>
              <h3 className="mb-2 font-bold text-xl md:text-2xl">
                Or skip the wait entirely
              </h3>
              <p className="text-muted-foreground">
                Wraps deploys production-ready SES (DKIM, SPF, DMARC, bounce
                handling, SNS, suppression) to your AWS account in minutes.
                Still your AWS, still $0.10/1K — just no boilerplate.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart/email">
                  Deploy in one command
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools/ses-calculator">See your cost</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* After Submission */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">After You Submit</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            Here's what to expect once you hit submit.
          </p>

          <div className="relative space-y-6 border-l-2 border-muted pl-8">
            <div className="relative">
              <div className="absolute -left-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
                <Clock className="h-3 w-3" />
              </div>
              <h4 className="font-semibold">0-24 Hours: Initial Review</h4>
              <p className="text-muted-foreground text-sm">
                AWS Trust & Safety reviews your request. Most responses come
                within 24 hours during business days.
              </p>
            </div>
            <div className="relative">
              <div className="absolute -left-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted bg-background">
                <Circle className="h-2 w-2 fill-muted-foreground" />
              </div>
              <h4 className="font-semibold">Response: Approved or Follow-up</h4>
              <p className="text-muted-foreground text-sm">
                You'll either get production access or receive questions/denial.
                Follow-up questions are actually a good sign — they're engaging
                with your request.
              </p>
            </div>
            <div className="relative">
              <div className="absolute -left-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted bg-background">
                <Circle className="h-2 w-2 fill-muted-foreground" />
              </div>
              <h4 className="font-semibold">If Approved: Gradual Increase</h4>
              <p className="text-muted-foreground text-sm">
                Start with your approved quota. AWS automatically increases
                limits as you demonstrate good sending practices.
              </p>
            </div>
          </div>
        </section>

        {/* Denial Recovery */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Denied? Here's What to Do</h2>
          </div>
          <p className="mb-6 text-lg text-muted-foreground">
            First-time denial is so common it's almost expected. Here's how to
            recover.
          </p>

          <InfoCard
            icon={AlertTriangle}
            title="The Standard Denial"
            type="danger"
          >
            AWS sends a vague response: "We reviewed your request and determined
            that your use of Amazon SES could have a negative impact on our
            service." This tells you nothing — don't take it personally.
          </InfoCard>

          <DenialRecoveryFlow />

          <p className="mt-6 text-muted-foreground">
            Paste the denial into the{" "}
            <Link
              className="text-primary underline underline-offset-2"
              href="/tools/ses-production-access"
            >
              SES production access request builder
            </Link>{" "}
            and it will tell you which of the four gaps the refusal points at
            and draft the reply for the support case. It runs in your browser;
            the denial text is not uploaded anywhere.
          </p>
        </section>

        {/* Common Mistakes */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <AlertTriangle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">
              Common Mistakes That Trigger Denial
            </h2>
          </div>

          <div className="space-y-2">
            <Collapsible
              defaultOpen
              title="Vague or brief use case description"
            >
              <p className="text-muted-foreground text-sm">
                "I want to send transactional emails to my users" is not enough.
                Explain exactly what triggers each email, how users opt in, and
                what content they contain.
              </p>
            </Collapsible>

            <Collapsible title="Missing DNS authentication">
              <p className="text-muted-foreground text-sm">
                If DKIM shows "Pending" or you haven't configured SPF/DMARC,
                your request will likely be denied. Complete all DNS setup
                before submitting.
              </p>
            </Collapsible>

            <Collapsible title="No bounce/complaint handling explanation">
              <p className="text-muted-foreground text-sm">
                AWS needs to know you won't damage their reputation. Explicitly
                describe your SNS configuration and what happens when you
                receive bounce/complaint notifications.
              </p>
            </Collapsible>

            <Collapsible title="Website doesn't match the request">
              <p className="text-muted-foreground text-sm">
                Reviewers visit your URL. If it's a parked domain, "coming soon"
                page, or doesn't match your described use case, that's a red
                flag.
              </p>
            </Collapsible>

            <Collapsible title="Using a free email address">
              <p className="text-muted-foreground text-sm">
                Gmail, Hotmail, or Yahoo addresses on your AWS account signal
                non-business use. Use an email address on the domain you're
                requesting production access for.
              </p>
            </Collapsible>

            <Collapsible title="Requesting marketing access as a new user">
              <p className="text-muted-foreground text-sm">
                Marketing emails face much higher scrutiny. If you're new to
                SES, request transactional access first, build reputation, then
                expand to marketing.
              </p>
            </Collapsible>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-2">
            <Collapsible title="Do I need a live app before requesting production access?">
              <p className="text-muted-foreground text-sm">
                Not necessarily, but your website needs to clearly show what
                your business does. A landing page with your value proposition,
                contact info, and privacy policy is sufficient. What matters is
                that reviewers can verify you're a real business.
              </p>
            </Collapsible>

            <Collapsible title="My domain is brand new. Will that cause denial?">
              <p className="text-muted-foreground text-sm">
                New domains face more scrutiny but aren't automatically denied.
                Make your request extra detailed, ensure all DNS records are
                properly configured, and consider waiting a few weeks for the
                domain to age before requesting.
              </p>
            </Collapsible>

            <Collapsible title="Can I request access for multiple AWS accounts?">
              <p className="text-muted-foreground text-sm">
                Yes, but each account needs its own request. If you're using AWS
                Organizations, submit from the account that will actually send
                emails. Requests from accounts with no other AWS usage face more
                scrutiny.
              </p>
            </Collapsible>

            <Collapsible title="How long until my limits automatically increase?">
              <p className="text-muted-foreground text-sm">
                AWS monitors your sending reputation and automatically increases
                quotas over time. This typically happens within a few weeks of
                consistent, high-quality sending. Maintain bounce rates below 2%
                and complaint rates below 0.1%.
              </p>
            </Collapsible>

            <Collapsible title="Should I use SES or a third-party provider?">
              <p className="text-muted-foreground text-sm">
                SES is significantly cheaper at scale ($0.10/1000 emails) but
                requires more setup and management. If you want hands-off
                deliverability with dedicated IPs and better support, consider
                SendGrid, Postmark, or Mailgun. If you're comfortable with AWS
                and want to minimize costs, SES is excellent.
              </p>
            </Collapsible>
          </div>
        </section>

        {/* Resources */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <ExternalLink className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-bold text-2xl">Additional Resources</h2>
          </div>

          <div className="mb-4">
            <h3 className="mb-3 font-semibold text-muted-foreground text-sm">
              Wraps Resources
            </h3>
            <div className="space-y-3">
              <a
                className="flex items-center gap-3 rounded-lg border bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                href="/blog/ses-production-architecture"
              >
                <ArrowRight className="h-4 w-4 text-primary" />
                <span>AWS SES Production Architecture Guide</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                href="/blog/your-dmarc-policy-is-useless"
              >
                <ArrowRight className="h-4 w-4 text-primary" />
                <span>Your DMARC Policy is Useless</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg border bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                href="/docs/guides/domain-verification"
              >
                <ArrowRight className="h-4 w-4 text-primary" />
                <span>Domain Verification Guide</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-sm">
              AWS Documentation
            </h3>
            <div className="space-y-3">
              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span>
                  AWS Official Documentation: Request Production Access
                </span>
              </a>

              <a
                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                href="https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span>AWS Email Authentication Guide (SPF, DKIM, DMARC)</span>
              </a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center">
          <h3 className="mb-3 font-bold text-2xl">
            Skip the sandbox nightmare entirely
          </h3>
          <p className="mx-auto mb-6 max-w-lg text-muted-foreground">
            Wraps CLI deploys production-ready email infrastructure to your AWS
            account in one command. DNS records, bounce handling, reputation
            monitoring — all handled.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/docs/quickstart/email">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/cli">Learn About Wraps CLI</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
