"use client";

import { BotIcon, CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const SKILLS_INSTALL = "npx add-skill wraps-team/skills";

type AgentPromptOptionProps = {
  prompt: string;
  onCopyPrompt?: () => void;
};

export function AgentPromptOption({
  prompt,
  onCopyPrompt,
}: AgentPromptOptionProps) {
  const [copied, setCopied] = useState<"prompt" | "skills" | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async (type: "prompt" | "skills") => {
    try {
      await navigator.clipboard.writeText(
        type === "prompt" ? prompt : SKILLS_INSTALL
      );
      setCopied(type);
      if (type === "prompt") {
        onCopyPrompt?.();
      }
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing to do
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="rounded-md border bg-background p-2">
          <BotIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Hand the setup to your AI agent</p>
          <p className="text-muted-foreground text-xs">
            Paste into Claude Code, Cursor, or any agent with shell access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="gap-2"
            onClick={() => handleCopy("prompt")}
            size="sm"
          >
            {copied === "prompt" ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
            {copied === "prompt" ? "Copied" : "Copy prompt"}
          </Button>
          <Button
            aria-expanded={expanded}
            className="gap-1"
            onClick={() => setExpanded((v) => !v)}
            size="sm"
            variant="outline"
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            <span className="hidden sm:inline">
              {expanded ? "Hide" : "View"}
            </span>
          </Button>
        </div>
      </div>

      {expanded && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t bg-muted/50 px-4 py-4 font-mono text-[13px] text-foreground leading-relaxed">
          {prompt}
        </pre>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
        <p className="text-muted-foreground text-xs">
          Using Claude Code? Install the Wraps skills for deeper context:
        </p>
        <button
          className="inline-flex items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs hover:bg-muted/80"
          onClick={() => handleCopy("skills")}
          type="button"
        >
          {SKILLS_INSTALL}
          {copied === "skills" ? (
            <CheckIcon className="h-3 w-3 text-primary" />
          ) : (
            <CopyIcon className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
