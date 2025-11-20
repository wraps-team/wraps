"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

type EmailFieldsProps = {
  to: string[];
  from: string;
};

export function EmailFields({ to, from }: EmailFieldsProps) {
  const [copiedTo, setCopiedTo] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState(false);

  const copyToClipboard = async (
    text: string,
    setCopied: (value: boolean) => void
  ) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toEmail = to.length > 0 ? to[0] : "";
  const hasMultipleRecipients = to.length > 1;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* To Field */}
      <div className="flex flex-col gap-1.5">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText className="text-xs uppercase tracking-wide">
              To:
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            className="font-mono text-sm opacity-100!"
            disabled
            id="to-email"
            placeholder="(no recipients)"
            readOnly
            value={toEmail}
          />
          {hasMultipleRecipients && (
            <InputGroupAddon align="inline-end">
              <Badge className="text-xs" variant="secondary">
                +{to.length - 1}
              </Badge>
            </InputGroupAddon>
          )}
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Copy recipient email"
              disabled={!toEmail}
              onClick={() => copyToClipboard(toEmail, setCopiedTo)}
              size="icon-xs"
              title="Copy"
            >
              {copiedTo ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {/* From Field */}
      <div className="flex flex-col gap-1.5">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText className="text-xs uppercase tracking-wide">
              From:
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            className="font-mono text-foreground text-sm opacity-100!"
            disabled
            id="from-email"
            readOnly
            value={from}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Copy sender email"
              onClick={() => copyToClipboard(from, setCopiedFrom)}
              size="icon-xs"
              title="Copy"
            >
              {copiedFrom ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
