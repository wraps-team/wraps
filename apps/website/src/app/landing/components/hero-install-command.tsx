"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { trackEvent } from "@/utils/analytics";

const COMMAND = "npx @wraps.dev/cli email init";

export function HeroInstallCommand() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    trackEvent("cta_click", {
      location: "hero",
      cta_text: "Copy install command",
    });
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The command
      // is still on screen to select by hand.
    }
  }

  return (
    <button
      aria-label={`Copy command: ${COMMAND}`}
      className="group inline-flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 font-mono text-muted-foreground text-sm transition-colors hover:border-foreground/30 hover:text-foreground"
      onClick={copy}
      type="button"
    >
      <span aria-hidden="true" className="text-brand">
        $
      </span>
      <span className="text-foreground">{COMMAND}</span>
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
