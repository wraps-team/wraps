import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Clock,
  GitBranch,
  MousePointerClick,
  Sparkles,
  Zap,
} from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { assetUrl } from "@/lib/utils";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Generate workflows from natural language prompts",
    badge: "AI",
  },
  {
    icon: Zap,
    title: "Event Triggers",
    description: "Start workflows from signups, purchases, or custom events",
  },
  {
    icon: Clock,
    title: "Wait Steps",
    description: "Add delays between actions — hours, days, or weeks",
  },
  {
    icon: GitBranch,
    title: "Conditions",
    description: "Branch based on contact properties or behavior",
  },
  {
    icon: MousePointerClick,
    title: "Actions",
    description: "Send emails, update contacts, trigger webhooks",
  },
];

export function DashboardAutomationsSection() {
  return (
    <section className="relative overflow-x-clip pt-20" id="automations">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Chapter indicator */}
        <div className="mb-14">
          <SectionKicker>Scale</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Automate Your Growth
          </h2>
        </div>

        {/* Split layout: Content left, screenshot right (flipped from Ch. 2) */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Content */}
          <div className="order-2 space-y-8 lg:order-1">
            <p className="text-lg text-muted-foreground">
              Build automated email sequences triggered by events, time delays,
              or conditions. Define in TypeScript or generate with AI.
            </p>

            {/* Features as list */}
            <div className="space-y-4">
              {features.map((feature) => (
                <div className="flex items-start gap-3" key={feature.title}>
                  <feature.icon
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{feature.title}</span>
                      {feature.badge && (
                        <Badge
                          className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]"
                          variant="secondary"
                        >
                          {feature.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tier hints */}
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm">
                <span className="font-medium text-foreground">Free:</span>{" "}
                <span className="text-muted-foreground">
                  1 workflow included
                </span>
              </p>
              <p className="text-sm">
                <span className="font-medium text-foreground">
                  Pro ($29/mo):
                </span>{" "}
                <span className="text-muted-foreground">
                  Unlimited workflows
                </span>
              </p>
            </div>
          </div>

          {/* Screenshot - overflows right */}
          <div className="relative order-1 lg:-mr-32 xl:-mr-48 2xl:-mr-64 lg:order-2">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              {/* Light mode image */}
              <img
                alt="Workflow Builder - Light Mode"
                className="block w-full object-cover dark:hidden"
                decoding="async"
                loading="lazy"
                src={assetUrl("automations-builder-light.avif")}
              />
              {/* Dark mode image */}
              <img
                alt="Workflow Builder - Dark Mode"
                className="hidden w-full object-cover dark:block"
                decoding="async"
                loading="lazy"
                src={assetUrl("automations-builder-dark.avif")}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
