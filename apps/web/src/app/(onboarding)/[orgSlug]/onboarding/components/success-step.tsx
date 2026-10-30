"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CodeIcon,
  LayoutDashboardIcon,
  TerminalIcon,
} from "lucide-react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

function NeedHelpBlock() {
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-4">
      <h3 className="font-semibold text-sm">Need help?</h3>
      <p className="text-muted-foreground text-sm">
        Check out our{" "}
        <a
          className="underline hover:text-foreground"
          href="https://wraps.dev/docs"
          rel="noopener"
          target="_blank"
        >
          documentation
        </a>
        , join our{" "}
        <a
          className="underline hover:text-foreground"
          href="https://discord.gg/pdgAa6xAWF"
          rel="noopener noreferrer"
          target="_blank"
        >
          Discord community
        </a>
        , or{" "}
        <a
          className="underline hover:text-foreground"
          href="mailto:support@wraps.dev"
        >
          email support
        </a>
        .
      </p>
    </div>
  );
}

type SuccessStepProps = {
  onComplete: () => void;
  onBack: () => void;
  organizationId: string;
  isConnected?: boolean;
};

export function SuccessStep({
  onComplete,
  onBack,
  organizationId,
  isConnected = false,
}: SuccessStepProps) {
  const handleComplete = () => {
    posthog.capture("onboarding_completed", {
      step: 5,
      step_name: "Success",
      organization_id: organizationId,
      infrastructure_connected: isConnected,
    });
    onComplete();
  };

  const handleNextStepClick = (action: string) => {
    posthog.capture("onboarding_next_step_clicked", {
      step: 5,
      step_name: "Success",
      organization_id: organizationId,
      action,
    });
  };

  const handleGoBack = () => {
    posthog.capture("onboarding_step_back", {
      step: 5,
      step_name: "Success",
      organization_id: organizationId,
    });
    onBack();
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <AlertTriangleIcon className="h-10 w-10 text-warning" />
          </div>
          <CardTitle className="text-3xl">Setup Incomplete</CardTitle>
          <CardDescription className="text-base">
            Your AWS infrastructure is not connected yet.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Infrastructure required</AlertTitle>
            <AlertDescription>
              Without connecting your AWS infrastructure, the dashboard cannot
              display analytics, track email events, or send emails. You will
              need to complete this step before using Wraps.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">
              Connect using the CLI (recommended)
            </h3>
            <div className="space-y-2 rounded-lg bg-secondary p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <TerminalIcon className="h-3.5 w-3.5" />
                Run these commands in your terminal
              </div>
              <pre className="text-sm">
                <code>{`npm install -g @wraps.dev/cli
wraps auth login
wraps email init
wraps platform connect`}</code>
              </pre>
            </div>
          </div>

          <NeedHelpBlock />
        </CardContent>

        <CardFooter className="flex items-center justify-between">
          <Button onClick={handleGoBack} size="lg" variant="outline">
            Go back and connect
          </Button>
          <Button onClick={handleComplete} variant="ghost">
            Continue to dashboard anyway
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2Icon className="h-10 w-10 text-success" />
        </div>
        <CardTitle className="text-3xl">You're All Set!</CardTitle>
        <CardDescription className="text-base">
          Your email infrastructure is deployed and connected. Here's what to do
          next.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Next Steps */}
        <div className="space-y-4">
          <h3 className="font-semibold">Next Steps</h3>

          <div className="grid gap-4">
            <a
              className="flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              href="https://wraps.dev/docs/quickstart/email"
              onClick={() => handleNextStepClick("install_sdk")}
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <CodeIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">
                  Install the TypeScript SDK
                </h4>
                <p className="mt-1 text-muted-foreground text-sm">
                  Add{" "}
                  <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                    @wraps.dev/email
                  </code>{" "}
                  to your project and start sending emails in minutes
                </p>
              </div>
            </a>

            <a
              className="flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              href="https://wraps.dev/docs/guides/domain-verification"
              onClick={() => handleNextStepClick("verify_domain")}
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <BookOpenIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">Verify your domain</h4>
                <p className="mt-1 text-muted-foreground text-sm">
                  Configure DNS records (DKIM, SPF, DMARC) to ensure high
                  deliverability
                </p>
              </div>
            </a>

            <button
              className="flex w-full items-start gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              onClick={() => {
                handleNextStepClick("explore_dashboard");
                handleComplete();
              }}
              type="button"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <LayoutDashboardIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">
                  Explore your dashboard
                </h4>
                <p className="mt-1 text-muted-foreground text-sm">
                  View email analytics, manage domains, and monitor your
                  infrastructure
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Quick Start Code */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Quick Start Example</h3>
          <pre className="overflow-x-auto rounded-lg bg-secondary p-4">
            <code className="text-xs">
              {`import { WrapsEmail } from '@wraps.dev/email';

const wraps = new WrapsEmail();

await wraps.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});`}
            </code>
          </pre>
        </div>

        <NeedHelpBlock />
      </CardContent>

      <CardFooter className="flex justify-center">
        <Button className="w-full sm:w-auto" onClick={handleComplete} size="lg">
          Continue to Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
}
