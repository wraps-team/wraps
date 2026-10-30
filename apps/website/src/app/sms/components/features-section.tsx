"use client";

import {
  BarChart3,
  BellOff,
  Code2,
  Key,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const features = [
  {
    icon: Code2,
    title: "TypeScript SDK",
    description:
      "Simple, type-safe @wraps.dev/sms package. Send SMS with a single function call.",
    highlighted: true,
  },
  {
    icon: ShieldCheck,
    title: "Registration Checklist",
    description:
      "`wraps sms register` walks you through what toll-free registration needs and opens the AWS console at the right page. 10DLC is guidance only — you file it yourself.",
    highlighted: false,
  },
  {
    icon: Key,
    title: "Zero Stored Credentials",
    description:
      "OIDC authentication with your hosting provider. We never store your AWS credentials.",
    highlighted: false,
  },
  {
    icon: Layers,
    title: "Batch Sending",
    description:
      "`sendBatch()` fans one message out across many recipients and returns a per-recipient result, so a single failure doesn't lose the run.",
    highlighted: false,
  },
  {
    icon: BellOff,
    title: "Opt-Out List",
    description:
      "The stack deploys a managed AWS opt-out list. Check, add, and remove numbers from the SDK so STOP replies are honored automatically.",
    highlighted: false,
  },
  {
    icon: BarChart3,
    title: "Delivery Events & Dashboard",
    description:
      "Delivery events land in a DynamoDB table in your account. The dashboard reads them for volume, deliverability, and AWS spend limits.",
    highlighted: false,
  },
];

export function SmsFeaturesSection() {
  return (
    <section className="border-border border-t py-16 sm:py-24" id="features">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <SectionKicker>Features</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Built for developers
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to send SMS at scale, without the complexity.
          </p>
        </div>

        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div className="flex items-start gap-3" key={feature.title}>
              <feature.icon
                aria-hidden="true"
                className={`mt-0.5 size-5 shrink-0 ${
                  feature.highlighted
                    ? "text-brand-text"
                    : "text-muted-foreground"
                }`}
              />
              <div>
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
