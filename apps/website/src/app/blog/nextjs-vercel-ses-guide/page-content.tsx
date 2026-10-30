"use client";

import { Card } from "@wraps/ui/components/ui/card";
import { Check, Cloud, Copy, Lock, Mail, Server, Shield } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { AsciinemaPlayer } from "@/components/asciinema-player";
import { assetUrl } from "@/lib/utils";

// Code block with copy functionality
type CodeBlockProps = {
  code: string;
  filename?: string;
};

export function CodeBlock({ code, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30">
      {filename && (
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <span className="font-mono text-muted-foreground text-xs">
            {filename}
          </span>
          <button
            className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-sm">
        <code className="font-mono text-foreground/80">{code}</code>
      </pre>
    </div>
  );
}

// OIDC Flow Diagram - animated with useEffect
export function OIDCDiagram() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((s) => (s + 1) % 6);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { label: "Vercel Function", icon: Server },
    { label: "OIDC Token", icon: Lock },
    { label: "AWS STS", icon: Cloud },
    { label: "Validate", icon: Shield },
    { label: "Temp Creds", icon: Lock },
    { label: "Send via SES", icon: Mail },
  ];

  return (
    <Card className="p-8">
      <div className="relative flex items-center justify-between">
        {/* Connection line */}
        <div className="absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2 bg-border" />
        <div
          className="absolute top-1/2 left-0 h-0.5 w-(--progress) -translate-y-1/2 bg-success transition-all duration-500"
          style={
            {
              "--progress": `${(activeStep / 5) * 100}%`,
            } as React.CSSProperties
          }
        />

        {steps.map((step, i) => (
          <div className="relative z-10 flex flex-col items-center" key={i}>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
                i <= activeStep
                  ? "scale-110 bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <step.icon className="h-5 w-5" />
            </div>
            <span
              className={`mt-2 text-center text-xs transition-colors duration-300 ${
                i <= activeStep ? "text-success" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-muted-foreground text-sm">
        No stored credentials. Tokens refresh automatically. Full audit trail in
        CloudTrail.
      </p>
    </Card>
  );
}

// Terminal demo with AsciinemaPlayer
export function TerminalDemo() {
  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <div className="group relative">
        <div className="absolute -inset-4 rounded-3xl bg-success/10 opacity-50 blur-2xl transition-opacity group-hover:opacity-70" />
        <div className="relative overflow-hidden rounded-xl border-2 border-success/30 shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-destructive" />
              <div className="h-3 w-3 rounded-full bg-warning" />
              <div className="h-3 w-3 rounded-full bg-success" />
            </div>
            <span className="ml-2 font-medium text-muted-foreground text-xs">
              terminal — wraps email init
            </span>
          </div>
          <div className="bg-terminal">
            <AsciinemaPlayer
              cols={80}
              fit="width"
              idleTimeLimit={1}
              loop={true}
              rows={24}
              speed={1.2}
              src={assetUrl("demos/email-init-short.cast")}
              terminalFontSize="12px"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
