"use client";

import { Mail, Paperclip, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type HighlightKey =
  | "emailId"
  | "from"
  | "to"
  | "subject"
  | "html"
  | "attachments"
  | "spamVerdict"
  | null;

const emailJson = {
  emailId: '"inb_a1b2c3d4"',
  from: '{ "address": "customer@example.com", "name": "John Doe" }',
  to: '[{ "address": "support@yourapp.com" }]',
  subject: '"Order #12345 Question"',
  html: '"<p>Hi, I have a question about my order...</p>"',
  attachments:
    '[{ "filename": "receipt.pdf", "contentType": "application/pdf", "size": 45678 }]',
  spamVerdict: '"PASS"',
  virusVerdict: '"PASS"',
};

// One accent, both panes. The highlight links a rendered element to its parsed
// field — it isn't a per-field category color.
const highlight = "ring-1 ring-brand bg-brand/10";

const verdictKeys = new Set(["spamVerdict", "virusVerdict"]);

/** Hover/focus target that highlights its counterpart in the other pane. */
function FieldTarget({
  children,
  className,
  field,
  isActive,
  onHover,
}: {
  children: React.ReactNode;
  className?: string;
  field: Exclude<HighlightKey, null>;
  isActive: boolean;
  onHover: (key: HighlightKey) => void;
}) {
  return (
    <button
      className={cn(
        "cursor-pointer rounded-lg text-left transition-all",
        className,
        isActive && highlight
      )}
      onBlur={() => onHover(null)}
      onFocus={() => onHover(field)}
      onMouseEnter={() => onHover(field)}
      onMouseLeave={() => onHover(null)}
      type="button"
    >
      {children}
    </button>
  );
}

function EmailPreview({
  highlighted,
  onHover,
}: {
  highlighted: HighlightKey;
  onHover: (key: HighlightKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Email header */}
      <div className="border-border border-b bg-muted/30 p-4">
        <div className="mb-3 flex items-start justify-between">
          <FieldTarget
            className="flex items-center gap-3 p-2"
            field="from"
            isActive={highlighted === "from"}
            onHover={onHover}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <User className="size-5 text-muted-foreground" />
            </span>
            <span className="block">
              <span className="block font-medium">John Doe</span>
              <span className="block font-mono text-muted-foreground text-sm">
                customer@example.com
              </span>
            </span>
          </FieldTarget>

          <FieldTarget
            className="p-2"
            field="emailId"
            isActive={highlighted === "emailId"}
            onHover={onHover}
          >
            <span className="font-mono text-muted-foreground text-xs">
              inb_a1b2c3d4
            </span>
          </FieldTarget>
        </div>

        <FieldTarget
          className="mb-2 block w-full p-2"
          field="to"
          isActive={highlighted === "to"}
          onHover={onHover}
        >
          <span className="font-mono text-muted-foreground text-sm">
            To: support@yourapp.com
          </span>
        </FieldTarget>

        <FieldTarget
          className="block w-full p-2"
          field="subject"
          isActive={highlighted === "subject"}
          onHover={onHover}
        >
          <h3 className="font-heading font-semibold text-lg tracking-tight">
            Order #12345 Question
          </h3>
        </FieldTarget>
      </div>

      {/* Email body */}
      <FieldTarget
        className="block w-full rounded-none p-4"
        field="html"
        isActive={highlighted === "html"}
        onHover={onHover}
      >
        <span className="block text-muted-foreground">
          Hi, I have a question about my order. Could you please help me track
          the shipment? I ordered it last week and haven't received any updates.
        </span>
      </FieldTarget>

      {/* Attachments */}
      <div className="border-border border-t bg-muted/20 p-4">
        <FieldTarget
          className="inline-flex items-center gap-2 border border-border bg-background p-3"
          field="attachments"
          isActive={highlighted === "attachments"}
          onHover={onHover}
        >
          <Paperclip className="size-4 text-muted-foreground" />
          <span className="block">
            <span className="block font-medium text-sm">receipt.pdf</span>
            <span className="block font-mono text-muted-foreground text-xs">
              45.6 KB
            </span>
          </span>
        </FieldTarget>
      </div>

      {/* Security badges */}
      <div className="flex items-center gap-4 border-border border-t bg-muted/10 p-4">
        <FieldTarget
          className="flex items-center gap-2 p-2"
          field="spamVerdict"
          isActive={highlighted === "spamVerdict"}
          onHover={onHover}
        >
          <ShieldCheck className="size-4 text-success" />
          <span className="font-medium text-success text-sm dark:text-success">
            Not Spam
          </span>
        </FieldTarget>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-success" />
          <span className="font-medium text-success text-sm dark:text-success">
            No Virus
          </span>
        </div>
      </div>
    </div>
  );
}

function JsonPreview({
  highlighted,
  onHover,
}: {
  highlighted: HighlightKey;
  onHover: (key: HighlightKey) => void;
}) {
  const renderLine = (key: string, value: string, isLast = false) => (
    <FieldTarget
      className="block w-full rounded px-2 py-1"
      field={key as Exclude<HighlightKey, null>}
      isActive={highlighted === key}
      key={key}
      onHover={onHover}
    >
      <span className="text-foreground">"{key}"</span>
      <span className="text-muted-foreground">: </span>
      <span
        className={cn(
          "text-muted-foreground",
          verdictKeys.has(key) && "text-success"
        )}
      >
        {value}
      </span>
      {!isLast && <span className="text-muted-foreground">,</span>}
    </FieldTarget>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-border border-b bg-muted/30 px-4 py-3">
        <Mail aria-hidden="true" className="size-3.5 text-brand-text" />
        <span className="font-mono text-muted-foreground text-xs">
          InboundEmail.json
        </span>
      </div>

      {/* JSON content */}
      <div className="overflow-x-auto p-4 font-mono text-sm">
        <div className="text-muted-foreground">{"{"}</div>
        <div className="pl-4">
          {renderLine("emailId", emailJson.emailId)}
          {renderLine("from", emailJson.from)}
          {renderLine("to", emailJson.to)}
          {renderLine("subject", emailJson.subject)}
          {renderLine("html", emailJson.html)}
          {renderLine("attachments", emailJson.attachments)}
          {renderLine("spamVerdict", emailJson.spamVerdict)}
          {renderLine("virusVerdict", emailJson.virusVerdict, true)}
        </div>
        <div className="text-muted-foreground">{"}"}</div>
      </div>
    </div>
  );
}

export function AnatomyInteractive() {
  const [highlighted, setHighlighted] = useState<HighlightKey>(null);

  return (
    <>
      {/* Split view */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email preview */}
        <div>
          <p className="mb-3 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            Email Preview
          </p>
          <EmailPreview highlighted={highlighted} onHover={setHighlighted} />
        </div>

        {/* JSON structure */}
        <div>
          <p className="mb-3 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            Parsed Data
          </p>
          <JsonPreview highlighted={highlighted} onHover={setHighlighted} />
        </div>
      </div>

      {/* Mobile hint */}
      <p className="mt-6 text-muted-foreground text-sm lg:hidden">
        Tap elements to see the connection
      </p>
    </>
  );
}
