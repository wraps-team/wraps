"use client";

import {
  BookOpenIcon,
  CheckCircle2Icon,
  CodeIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SuccessStepProps = {
  onComplete: () => void;
};

export function SuccessStep({ onComplete }: SuccessStepProps) {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2Icon className="h-10 w-10 text-green-500" />
        </div>
        <CardTitle className="text-3xl">You're All Set!</CardTitle>
        <CardDescription className="text-base">
          Your email infrastructure is ready. Here's what to do next.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Next Steps */}
        <div className="space-y-4">
          <h3 className="font-semibold">Next Steps</h3>

          <div className="grid gap-4">
            <a
              className="flex items-start gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              href="/docs/quickstart"
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
              href="/docs/domains"
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
              onClick={onComplete}
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
              {`import { Wraps } from '@wraps.dev/email';

const wraps = new Wraps();

await wraps.emails.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});`}
            </code>
          </pre>
        </div>

        {/* Support */}
        <div className="space-y-2 rounded-lg bg-muted/50 p-4">
          <h3 className="font-semibold text-sm">Need help?</h3>
          <p className="text-muted-foreground text-sm">
            Check out our{" "}
            <a
              className="underline hover:text-foreground"
              href="/docs"
              rel="noopener"
              target="_blank"
            >
              documentation
            </a>
            , join our{" "}
            <a
              className="underline hover:text-foreground"
              href="https://discord.gg/wraps"
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
      </CardContent>

      <CardFooter className="flex justify-center">
        <Button className="w-full sm:w-auto" onClick={onComplete} size="lg">
          Continue to Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
}
