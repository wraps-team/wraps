import { Badge } from "@wraps/ui/components/ui/badge";
import { Calendar, Filter, Send, Tag, Users } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { assetUrl } from "@/lib/utils";

const features = [
  {
    icon: Send,
    title: "Send to All",
    description: "Broadcast to your entire list instantly",
  },
  {
    icon: Filter,
    title: "Segments",
    description: "Target by properties like plan or location",
    badge: "Pro",
  },
  {
    icon: Calendar,
    title: "Schedule",
    description: "Pick a date and time for automatic sending",
    badge: "Pro",
  },
  {
    icon: Tag,
    title: "Topics",
    description: "Let contacts subscribe to what they care about",
    badge: "Pro",
  },
  {
    icon: Users,
    title: "Preference Center",
    description: "Hosted page for managing subscriptions",
    badge: "Pro",
  },
];

export function DashboardBroadcastsSection() {
  return (
    <section
      className="relative overflow-x-clip bg-muted/30 pt-32 pb-24"
      id="broadcasts"
    >
      {/* Diagonal transition at top - regular bg bleeding into premium */}
      <div
        className="absolute inset-x-0 top-0 h-20 bg-background"
        style={{
          clipPath: "polygon(0 0, 100% 0, 100% 100%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Chapter indicator */}
        <div className="mb-14">
          <SectionKicker>Reach</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Reach Your Audience
          </h2>
        </div>

        {/* Split layout: Screenshot left (overflow), content right */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Screenshot - overflows left */}
          <div className="relative lg:-ml-32 xl:-ml-48 2xl:-ml-64">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              {/* Light mode image */}
              <img
                alt="Broadcasts Dashboard - Light Mode"
                className="block w-full object-cover dark:hidden"
                decoding="async"
                loading="lazy"
                src={assetUrl("broadcasts-list-light.webp")}
              />
              {/* Dark mode image */}
              <img
                alt="Broadcasts Dashboard - Dark Mode"
                className="hidden w-full object-cover dark:block"
                decoding="async"
                loading="lazy"
                src={assetUrl("broadcasts-list-dark.webp")}
              />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-8">
            <p className="text-lg text-muted-foreground">
              Send newsletters, announcements, and marketing campaigns.
              Segments, topics, and scheduling included in Pro.
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

            {/* Upgrade hint */}
            <div className="rounded-lg border border-border bg-background/60 p-4">
              <p className="text-sm">
                <span className="font-medium text-foreground">
                  Pro ($29/mo):
                </span>{" "}
                <span className="text-muted-foreground">
                  Broadcasts, segments, scheduling, and topics
                </span>
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium text-foreground">
                  Business ($199/mo):
                </span>{" "}
                <span className="text-muted-foreground">
                  Everything in Pro plus unlimited AWS accounts and SSO + SCIM
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
