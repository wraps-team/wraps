"use client";

import {
  ArrowRight,
  Calendar,
  Clock,
  Filter,
  Mail,
  Send,
  Tag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionWrapper } from "./section-card";

const features = [
  {
    icon: Send,
    title: "Send to Everyone",
    description: "Send a broadcast to all contacts or filter by segments",
    plan: "Starter",
  },
  {
    icon: Calendar,
    title: "Schedule for Later",
    description: "Pick a date and time - we'll send it automatically",
    plan: "Pro",
  },
  {
    icon: Filter,
    title: "Segment Targeting",
    description: "Target contacts by properties like plan, location, or tags",
    plan: "Pro",
  },
  {
    icon: Tag,
    title: "Topic Subscriptions",
    description: "Let contacts subscribe to topics they care about",
    plan: "Pro",
  },
  {
    icon: Users,
    title: "Preference Center",
    description: "Hosted page for contacts to manage their preferences",
    plan: "Pro",
  },
  {
    icon: Clock,
    title: "Send History",
    description: "Track delivery, opens, and clicks for every broadcast",
    plan: "Starter",
  },
];

function PlaceholderImage({
  alt,
  icon: Icon,
}: {
  alt: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-muted-foreground/25 border-dashed bg-muted/50">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex aspect-square size-16 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
          <Icon className="size-8 text-orange-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{alt}</p>
          <p className="text-muted-foreground text-sm">
            Screenshot coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

export function BroadcastsSection() {
  return (
    <SectionWrapper
      badge="Broadcasts · Starter + Pro"
      description="Send newsletters, announcements, and marketing campaigns to your contacts. Schedule sends and target specific segments with Pro."
      id="broadcasts"
      premium
      title="Reach Your Audience"
    >
      {/* Hero Image - Broadcast List */}
      <div className="mb-16">
        <div className="group relative">
          {/* Background glow */}
          <div className="absolute top-2 left-1/2 mx-auto h-16 w-[70%] -translate-x-1/2 transform rounded-full bg-orange-500/10 blur-2xl lg:-top-4 lg:h-32" />

          <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
            {/* Placeholder for broadcast list screenshot */}
            <PlaceholderImage alt="Broadcast Dashboard" icon={Mail} />

            {/* Bottom fade effect */}
            <div className="absolute bottom-0 left-0 h-32 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-40" />
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="mb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              className="rounded-xl border bg-background p-6 transition-all hover:border-orange-500/50"
              key={feature.title}
            >
              <div className="mb-4 flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <feature.icon className="size-5 text-orange-500" />
              </div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    feature.plan === "Pro"
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {feature.plan}
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column: Compose + Schedule */}
      <div className="mb-16 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Compose Broadcast */}
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <Send className="size-5 text-orange-500" />
              </div>
              <h3 className="font-semibold text-xl">Compose & Send</h3>
            </div>
            <p className="text-muted-foreground">
              Pick a template, select your audience, and send. View real-time
              delivery stats as your broadcast goes out.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Choose from your saved templates
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Send to all contacts or specific segments
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Track delivery, opens, and clicks in real-time
              </li>
            </ul>
          </div>
          <PlaceholderImage alt="Compose Broadcast" icon={Send} />
        </div>

        {/* Schedule */}
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <Calendar className="size-5 text-orange-500" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-xl">Schedule Broadcasts</h3>
                <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-600 text-xs dark:text-orange-400">
                  Pro
                </span>
              </div>
            </div>
            <p className="text-muted-foreground">
              Pick the perfect time to reach your audience. Schedule broadcasts
              for any future date and time - we'll handle the rest.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Schedule for any future date and time
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Cancel or reschedule anytime before send
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Powered by AWS EventBridge Scheduler
              </li>
            </ul>
          </div>
          <PlaceholderImage alt="Schedule Broadcast" icon={Calendar} />
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Button
          asChild
          className="cursor-pointer bg-orange-500 hover:bg-orange-600"
          size="lg"
        >
          <a href="https://app.wraps.dev/auth?mode=signup&plan=pro">
            Start with Pro
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <Button asChild className="cursor-pointer" size="lg" variant="outline">
          <a href="#pricing">View Pricing</a>
        </Button>
      </div>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Basic broadcasts in Starter ($10/mo). Scheduling & segments in Pro
        ($30/mo).
      </p>
    </SectionWrapper>
  );
}
