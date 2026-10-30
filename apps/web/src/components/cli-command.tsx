"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CliCommandProps = {
  command: string;
  className?: string;
};

export function CliCommand({ command, className }: CliCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-2 rounded-md bg-background p-3 font-mono text-sm",
        className
      )}
    >
      <div className="min-w-0 flex-1 truncate">
        <code className="text-muted-foreground">$ </code>
        <code>{command}</code>
      </div>
      <span className="opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          aria-label="Copy to clipboard"
          className="h-7 w-7 shrink-0"
          onClick={handleCopy}
          size="icon"
          variant="ghost"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-success" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </Button>
      </span>
    </div>
  );
}
