"use client";

import type { LucideIcon } from "lucide-react";
import { HardDrive, Mail, MessageSquare, Terminal } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { CopyButton } from "@/components/ui/shadcn-io/copy-button";

type Service = {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  command: string;
  features: string[];
  consoleFeature?: string;
  status: string;
};

const services: Service[] = [
  {
    id: "email",
    name: "Email",
    icon: Mail,
    description: "Production-ready transactional email via AWS SES",
    command: "wraps email init",
    features: [
      "SES configuration & domain verification",
      "DKIM, SPF, DMARC setup guidance",
      "EventBridge + SQS event pipeline",
      "DynamoDB for email history",
      "Lambda for event processing",
      "Bounce & complaint handling",
      "Inbound email receiving (wraps email inbound init)",
      "Reply with threading (wraps email reply init)",
    ],
    status: "available",
  },
  {
    id: "cdn",
    name: "CDN",
    icon: HardDrive,
    description: "S3 + CloudFront CDN for global asset delivery",
    command: "wraps cdn init",
    features: [
      "S3 bucket with CORS configured",
      "CloudFront CDN distribution",
      "Custom domain & SSL certificate",
      "Origin Access Control",
      "Pay AWS directly (~$2/mo at typical starter usage)",
    ],
    consoleFeature: "Browser-based image optimization",
    status: "available",
  },
  {
    id: "sms",
    name: "SMS",
    icon: MessageSquare,
    description: "Toll-free SMS via AWS End User Messaging",
    command: "wraps sms init",
    features: [
      "End User Messaging configuration",
      "Toll-free number provisioning",
      "10DLC registration support",
      "SMS event tracking",
      "Opt-out handling (STOP/START)",
      "Delivery receipts via SNS event pipeline",
    ],
    status: "beta",
  },
];

export function CliServicesSection() {
  return (
    <section className="py-16 sm:py-24" id="services">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-12 flex flex-col items-center text-center">
          <SectionKicker>Services</SectionKicker>
          <p className="text-lg text-muted-foreground">
            One command deploys production-ready AWS infrastructure.{" "}
            <span className="text-foreground">The sending setup is yours.</span>
          </p>
        </div>

        {/* Service cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <div
                className="relative overflow-hidden rounded-xl border border-border bg-card"
                key={service.id}
              >
                {/* Header */}
                <div className="border-border border-b px-6 py-6">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background">
                      <Icon className="size-5 text-foreground" />
                    </div>
                    <h3 className="font-heading font-semibold text-foreground text-xl tracking-tight">
                      {service.name}
                    </h3>
                    {service.status === "beta" && (
                      <span className="rounded-none border border-border px-2 py-0.5 font-mono text-3xs text-muted-foreground uppercase tracking-eyebrow">
                        Beta
                      </span>
                    )}
                  </div>
                  <p className="mb-4 text-muted-foreground text-sm">
                    {service.description}
                  </p>
                  <div className="flex items-center justify-between overflow-hidden rounded-lg border border-border bg-background px-3 py-2">
                    <code className="flex items-center gap-2 font-mono text-foreground text-sm">
                      <Terminal className="size-3.5 text-muted-foreground" />
                      {service.command}
                    </code>
                    <CopyButton
                      content={service.command}
                      size="sm"
                      variant="ghost"
                    />
                  </div>
                </div>

                {/* Features */}
                <div className="p-6">
                  <p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
                    What gets deployed
                  </p>
                  <ul className="space-y-2">
                    {service.features.map((feature) => (
                      <li
                        className="flex items-start gap-2 text-sm"
                        key={feature}
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {service.consoleFeature && (
                    <>
                      <p className="mt-6 mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
                        In the local console
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span>{service.consoleFeature}</span>
                        </li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
