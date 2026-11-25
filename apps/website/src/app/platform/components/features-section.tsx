import { BarChart3, Globe, History, Key, Shield, Users } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const features = [
  {
    icon: BarChart3,
    title: "Delivery Analytics",
    description: "Opens, clicks, bounces and complaints per message.",
  },
  {
    icon: History,
    title: "Message History",
    description: "Search and filter through your email history with timelines",
  },
  {
    icon: Users,
    title: "Contact Management",
    description: "Import contacts, track preferences, manage suppression lists",
  },
  {
    icon: Globe,
    title: "Domain Management",
    description: "Add domains, monitor DKIM/SPF/DMARC from one dashboard",
  },
  {
    icon: Shield,
    title: "Reputation Monitoring",
    description: "Track sender reputation, bounce rates, complaint ratios",
  },
  {
    icon: Key,
    title: "SMTP Credentials",
    description: "Generate credentials for legacy integrations",
  },
];

export function DashboardFeaturesSection() {
  return (
    <section className="pt-60 pb-20" id="features">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Compact header */}
        <div className="mb-10">
          <SectionKicker>Everything else</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Plus everything else you need
          </h2>
          <p className="mt-2 text-muted-foreground">Included in all plans</p>
        </div>

        {/* Compact feature grid */}
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
