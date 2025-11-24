"use client";

import { CheckCircle2Icon, CopyIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CliInstallStepProps = {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function CliInstallStep({
  onNext,
  onBack,
  onSkip,
}: CliInstallStepProps) {
  const [copied, setCopied] = useState(false);
  const installCommand = "npm install -g @wraps.dev/cli";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TerminalIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Install the Wraps CLI</CardTitle>
            <CardDescription>
              The CLI deploys infrastructure to your AWS account
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Install Command */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">1. Run the install command</h3>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-secondary p-4">
              <code className="text-sm">{installCommand}</code>
            </pre>
            <Button
              className="absolute top-2 right-2"
              onClick={handleCopy}
              size="icon"
              variant="outline"
            >
              {copied ? (
                <CheckCircle2Icon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Verification */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">
            2. Verify the installation (optional)
          </h3>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-secondary p-4">
              <code className="text-sm">wraps --version</code>
            </pre>
          </div>
          <p className="text-muted-foreground text-sm">
            You should see the version number if the installation was
            successful.
          </p>
        </div>

        {/* What's the CLI? */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <h3 className="font-semibold text-sm">What does the CLI do?</h3>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
            <li>Deploys AWS SES, DynamoDB, Lambda, and EventBridge</li>
            <li>Configures domain verification (DKIM, SPF, DMARC)</li>
            <li>Sets up event tracking and email history</li>
            <li>
              All infrastructure stays in <strong>your</strong> AWS account
            </li>
          </ul>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={onBack} variant="outline">
            Back
          </Button>
          <Button onClick={onSkip} variant="ghost">
            Skip
          </Button>
        </div>
        <Button onClick={onNext}>Next: Connect AWS</Button>
      </CardFooter>
    </Card>
  );
}
