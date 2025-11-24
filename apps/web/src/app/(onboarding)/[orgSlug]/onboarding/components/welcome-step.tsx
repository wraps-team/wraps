import { DollarSignIcon, RocketIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WelcomeStepProps = {
  onNext: () => void;
  onSkip: () => void;
};

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <RocketIcon className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-3xl">Welcome to Wraps!</CardTitle>
        <CardDescription className="text-base">
          Let's get you set up with production-ready email infrastructure in
          just a few minutes.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Value Props */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center space-y-2 rounded-lg border bg-card p-4 text-center">
            <ShieldCheckIcon className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Full Ownership</h3>
            <p className="text-muted-foreground text-sm">
              Infrastructure deployed to your AWS account. No vendor lock-in.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-2 rounded-lg border bg-card p-4 text-center">
            <DollarSignIcon className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Transparent Pricing</h3>
            <p className="text-muted-foreground text-sm">
              Pay AWS directly. $0.10 per 1,000 emails. No hidden fees.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-2 rounded-lg border bg-card p-4 text-center">
            <RocketIcon className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Great DX</h3>
            <p className="text-muted-foreground text-sm">
              Beautiful dashboard, TypeScript SDK, 30-second setup.
            </p>
          </div>
        </div>

        {/* What's Next */}
        <div className="space-y-3 rounded-lg bg-muted/50 p-4">
          <h3 className="font-semibold">What's next?</h3>
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground text-sm">
            <li>Install the Wraps CLI</li>
            <li>Connect your AWS account</li>
            <li>Deploy your email infrastructure</li>
            <li>Choose your plan</li>
            <li>Start sending emails</li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <Button onClick={onSkip} variant="ghost">
            Skip setup for now
          </Button>
          <Button onClick={onNext} size="lg">
            Get Started
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
