"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { trackEvent } from "@/utils/analytics";

type CopyCommandProps = {
  command: string;
  /** Where on the page this sits, for the click event. */
  location: string;
};

export function CopyCommand({ command, location }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    trackEvent("cta_click", {
      location,
      cta_text: `Copy command: ${command}`,
    });
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The command
      // is still on screen to select by hand.
    }
  }

  return (
    <button
      aria-label={`Copy command: ${command}`}
      className="group inline-flex max-w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 font-mono text-muted-foreground text-sm transition-colors hover:border-foreground/30 hover:text-foreground"
      onClick={copy}
      type="button"
    >
      <span aria-hidden="true" className="text-brand">
        $
      </span>
      <span className="min-w-0 break-all text-left text-foreground">
        {command}
      </span>
      {copied ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
