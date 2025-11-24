"use client";

import { CheckCircle2Icon, CopyIcon, ServerIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

type DeployStepProps = {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function DeployStep({ onNext, onBack, onSkip }: DeployStepProps) {
  const [copied, setCopied] = useState(false);
  const [hasDeployed, setHasDeployed] = useState(false);
  const deployCommand = "wraps email init";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(deployCommand);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ServerIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Deploy Your Email Infrastructure</CardTitle>
            <CardDescription>
              Run one command to deploy everything to AWS
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Deploy Command */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Run the deployment command</h3>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-secondary p-4">
              <code className="text-sm">{deployCommand}</code>
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
          <p className="text-muted-foreground text-sm">
            The CLI will guide you through selecting a region, choosing a
            configuration preset, and deploying your infrastructure.
          </p>
        </div>

        {/* What Gets Deployed? */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">
            What infrastructure gets deployed?
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Amazon SES</p>
                <p className="text-muted-foreground text-xs">
                  Email sending service with DKIM configuration
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">DynamoDB</p>
                <p className="text-muted-foreground text-xs">
                  Email event storage and history
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Lambda Functions</p>
                <p className="text-muted-foreground text-xs">
                  Event processors for tracking
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">EventBridge</p>
                <p className="text-muted-foreground text-xs">
                  Real-time email event routing
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Estimate */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <h3 className="font-semibold text-sm">Estimated monthly costs</h3>
          <div className="space-y-1 text-muted-foreground text-sm">
            <p>
              <strong>Emails:</strong> $0.10 per 1,000 emails (AWS SES)
            </p>
            <p>
              <strong>Infrastructure:</strong> ~$2-5/mo for most apps
            </p>
            <p>
              <strong>Free tier:</strong> First 62,000 emails/month are free for
              new AWS accounts
            </p>
          </div>
        </div>

        {/* Confirmation */}
        <div className="flex items-center space-x-2">
          <Checkbox
            checked={hasDeployed}
            id="deployed"
            onCheckedChange={(checked) => setHasDeployed(checked as boolean)}
          />
          <label
            className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            htmlFor="deployed"
          >
            I've successfully deployed my email infrastructure
          </label>
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
        <Button disabled={!hasDeployed} onClick={onNext}>
          Next: Choose Plan
        </Button>
      </CardFooter>
    </Card>
  );
}
