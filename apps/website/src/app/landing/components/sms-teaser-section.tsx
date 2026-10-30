"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Check, Globe, Mail, MessageSquare } from "lucide-react";

const services = [
  {
    icon: Mail,
    name: "Email",
    tagline: "Transactional & Marketing",
    aws: "AWS SES",
    price: "$0.10 / 1k emails (à la carte)",
    features: ["Open & click tracking", "Bounce handling", "DKIM signing"],
    status: "available",
    href: "/docs/quickstart/email",
    cta: "Get Started",
  },
  {
    icon: Globe,
    name: "CDN",
    tagline: "Global Asset Delivery",
    aws: "AWS CloudFront",
    price: "$0.085 / GB",
    features: ["Edge caching", "Custom domains", "SSL certificates"],
    status: "available",
    href: "/docs/quickstart/cdn",
    cta: "Get Started",
  },
  {
    icon: MessageSquare,
    name: "SMS",
    tagline: "Text Notifications",
    aws: "AWS End User Messaging",
    price: "Pay per message",
    features: ["Two-way messaging", "Delivery receipts", "Number management"],
    status: "available",
    href: "/docs/quickstart/sms",
    cta: "Get Started",
  },
];

export function SmsTeaserSection() {
  return (
    <section className="border-y py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="mb-2 font-medium text-brand-text text-sm">
            Platform Vision
          </p>
          <h2 className="mb-3 font-bold text-2xl tracking-tight sm:text-3xl">
            Start with Email. Expand When Ready.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Wraps is building infrastructure wrappers for the AWS services
            developers actually use. Same model every time: one CLI command,
            TypeScript SDK, dashboard, you own everything.
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid gap-6 sm:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            const isAvailable = service.status === "available";

            return (
              <div
                className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all ${
                  isAvailable
                    ? "border-border bg-card hover:border-brand/50 hover:shadow-xl hover:shadow-brand/5"
                    : "border-border bg-muted/50"
                }`}
                key={service.name}
              >
                {/* Large background icon */}
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 transition-opacity ${
                    isAvailable
                      ? "opacity-6 group-hover:opacity-10"
                      : "opacity-3"
                  }`}
                >
                  <Icon
                    className={`size-40 ${
                      isAvailable ? "text-brand-text" : "text-foreground"
                    }`}
                  />
                </div>

                {/* Header */}
                <div className="relative border-b border-border p-5 pb-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div
                      className={`flex size-11 items-center justify-center rounded-xl ${
                        isAvailable
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-5" />
                    </div>
                    {isAvailable ? (
                      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-3xs font-medium text-success">
                        <Check className="size-2.5" />
                        Available
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand/10 px-2 py-1 text-3xs font-medium text-brand-text">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <h3
                    className={`font-bold text-2xl ${
                      isAvailable ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {service.name}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {service.tagline}
                  </p>
                </div>

                {/* Body */}
                <div className="relative flex flex-1 flex-col p-5">
                  {/* AWS Badge */}
                  <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-md bg-accent px-2 py-1">
                    <span className="font-mono text-3xs text-muted-foreground">
                      {service.aws}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <span
                      className={`font-semibold text-lg ${
                        isAvailable
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {service.price}
                    </span>
                  </div>

                  {/* Features */}
                  <ul className="mb-6 flex-1 space-y-2">
                    {service.features.map((feature) => (
                      <li
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                        key={feature}
                      >
                        <Check
                          className={`size-3.5 ${
                            isAvailable
                              ? "text-brand-text"
                              : "text-muted-foreground"
                          }`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {isAvailable ? (
                    <Button asChild className="w-full" variant="brand">
                      <a href={service.href}>
                        {service.cta}
                        <ArrowRight className="ml-1.5 size-4" />
                      </a>
                    </Button>
                  ) : (
                    <Button asChild className="w-full" variant="outline">
                      <a href={service.href}>
                        {service.cta}
                        <ArrowRight className="ml-1.5 size-4" />
                      </a>
                    </Button>
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
