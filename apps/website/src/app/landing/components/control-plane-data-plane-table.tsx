import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { AwsDynamodbIcon } from "@/components/ui/svgs/awsDynamodbIcon";
import { AwsEventbridgeIcon } from "@/components/ui/svgs/awsEventbridgeIcon";
import { AwsLambdaIcon } from "@/components/ui/svgs/awsLambdaIcon";
import { AwsSesIcon } from "@/components/ui/svgs/awsSesIcon";
import { AwsSqsIcon } from "@/components/ui/svgs/awsSqsIcon";

const controlPlaneItems = [
  "Dashboard and analytics UI",
  "Visual template editor and template storage",
  "Workflow builder and automation state",
  "Contacts, segments, topics",
  "Broadcast scheduling and orchestration",
];

const dataPlaneItems: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text: string;
}[] = [
  {
    icon: AwsSesIcon,
    label: "SES",
    text: "Sending, domain identity, sender reputation",
  },
  {
    icon: AwsEventbridgeIcon,
    label: "EventBridge",
    text: "Real-time event capture",
  },
  {
    icon: AwsSqsIcon,
    label: "SQS + dead letter queue",
    text: "Reliable event delivery",
  },
  {
    icon: AwsLambdaIcon,
    label: "Lambda",
    text: "Event processing",
  },
  {
    icon: AwsDynamodbIcon,
    label: "DynamoDB",
    text: "Delivery history and engagement events",
  },
];

/**
 * The what-lives-where table: control plane (Wraps-hosted) vs. data plane
 * (customer's AWS account). Centerpiece of /byoc and the homepage
 * architecture section: shared here so both stay in sync.
 */
export function ControlPlaneDataPlaneTable({
  caption,
}: {
  caption?: ReactNode;
}) {
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background/50 p-6">
          <div className="mb-5 flex items-baseline justify-between gap-2">
            <h3 className="font-heading font-semibold text-lg">
              Control plane
            </h3>
            <span className="font-mono text-2xs text-muted-foreground uppercase tracking-widest">
              Wraps-hosted
            </span>
          </div>
          <ul className="space-y-3">
            {controlPlaneItems.map((item) => (
              <li className="flex items-start gap-3" key={item}>
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand-text"
                />
                <span className="text-foreground text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border-2 border-brand/30 border-dashed bg-brand/5 p-6">
          <div className="mb-5 flex items-baseline justify-between gap-2">
            <h3 className="font-heading font-semibold text-lg">Data plane</h3>
            <span className="font-mono text-2xs text-muted-foreground uppercase tracking-widest">
              Your AWS account
            </span>
          </div>
          <ul className="space-y-3">
            {dataPlaneItems.map(({ icon: Icon, label, text }) => (
              <li className="flex items-start gap-3" key={label}>
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="text-foreground text-sm">
                  <span className="font-medium">{label}:</span> {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {caption ? (
        <p className="mt-6 text-muted-foreground text-sm">{caption}</p>
      ) : null}
    </div>
  );
}
