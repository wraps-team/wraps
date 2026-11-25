import { Box, KeyRound, Layers, Lock, Package, Zap } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const features = [
  {
    icon: Lock,
    title: "Sends from your AWS",
    description:
      "The SDK calls SES directly in your AWS account. Sends go straight from your app to your own sending setup.",
  },
  {
    icon: Package,
    title: "TypeScript-First",
    description:
      "Strict types, autocomplete, and compile-time validation. Ship with confidence.",
  },
  {
    icon: KeyRound,
    title: "Flexible Auth",
    description:
      "AWS credential chain, OIDC federation (Vercel, GitHub Actions), or explicit credentials.",
  },
  {
    icon: Layers,
    title: "React Email",
    description:
      "Build templates with React components. Built on React Email for consistent rendering across major clients — Gmail, Outlook, Apple Mail.",
  },
  {
    icon: Zap,
    title: "Batch Operations",
    description:
      "Send to 100 recipients, track multiple events, or manage contacts in bulk with single calls.",
  },
  {
    icon: Box,
    title: "No Wraps lock-in",
    description:
      "Thin wrappers around AWS services. Stop using Wraps anytime — your SES templates and sending setup stay.",
  },
];

export function SdkFeaturesSection() {
  return (
    <section className="relative bg-muted/30 py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <SectionKicker>Production</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Built for production
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Ship emails and SMS with the same rigor as your application code
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-4 transition-colors hover:border-brand/40"
                key={feature.title}
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div>
                  <h3 className="font-medium text-sm">{feature.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
