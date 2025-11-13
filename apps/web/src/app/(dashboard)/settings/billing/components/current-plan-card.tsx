import { AlertTriangle, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type CurrentPlan = {
  planName: string;
  price: string;
  nextBilling: string;
  status: string;
  daysUsed: number;
  totalDays: number;
  progressPercentage: number;
  remainingDays: number;
  needsAttention: boolean;
  attentionMessage: string;
};

type CurrentPlanCardProps = {
  plan: CurrentPlan;
};

export function CurrentPlanCard({ plan }: CurrentPlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Plan</CardTitle>
        <CardDescription>
          You are currently on the {plan.planName}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            <span className="font-semibold">{plan.planName}</span>
            <Badge variant="secondary">{plan.status}</Badge>
          </div>
          <div className="text-right">
            <div className="font-bold text-2xl">{plan.price}</div>
            <div className="text-muted-foreground text-sm">
              Next billing: {plan.nextBilling}
            </div>
          </div>
        </div>

        {plan.needsAttention && (
          <Card className="border-neutral-200 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800">
            <CardContent>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <div className="space-y-1">
                  <p className="font-medium text-neutral-800 dark:text-neutral-400">
                    We need your attention!
                  </p>
                  <p className="text-neutral-700 text-sm dark:text-neutral-400">
                    {plan.attentionMessage}
                  </p>
                </div>
              </div>

              {/* Progress Section */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted-foreground text-sm">
                    Days
                  </span>
                  <span className="font-medium text-muted-foreground text-sm">
                    {plan.daysUsed} of {plan.totalDays} Days
                  </span>
                </div>
                <Progress className="h-2" value={plan.progressPercentage} />
                <p className="text-muted-foreground text-xs">
                  {plan.remainingDays} days remaining until your plan requires
                  update
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
