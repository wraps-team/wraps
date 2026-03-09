"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Calendar,
  Clock,
  Code,
  Eye,
  Filter,
  GitBranch,
  Infinity as InfinityIcon,
  LayoutGrid,
  MousePointerClick,
  Palette,
  Send,
  Sparkles,
  Tag,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assetUrl, cn } from "@/lib/utils";
import { trackEvent } from "@/utils/analytics";

type TabKey = "templates" | "broadcasts" | "automations" | "events";

const templateFeatures = [
  { icon: Sparkles, title: "AI-Powered", badge: "AI" },
  { icon: LayoutGrid, title: "Drag & Drop" },
  { icon: Eye, title: "Live Preview" },
  { icon: Code, title: "Export Options" },
  { icon: Palette, title: "Brand Kits" },
];

const broadcastFeatures = [
  { icon: Send, title: "Send to All" },
  { icon: Filter, title: "Segments", badge: "Starter" },
  { icon: Calendar, title: "Schedule", badge: "Starter" },
  { icon: Tag, title: "Topics", badge: "Starter" },
  { icon: Users, title: "Preference Center", badge: "Starter" },
];

const automationFeatures = [
  { icon: Sparkles, title: "AI-Powered", badge: "AI" },
  { icon: Zap, title: "Event Triggers" },
  { icon: Clock, title: "Wait Steps" },
  { icon: GitBranch, title: "Conditions" },
  { icon: MousePointerClick, title: "Actions" },
];

const eventFeatures = [
  { icon: InfinityIcon, title: "Unlimited Contacts" },
  { icon: Zap, title: "Custom Events" },
  { icon: Activity, title: "Email Tracking", badge: "Free" },
  { icon: Clock, title: "30d–1yr Retention" },
];

function TemplatesContent() {
  return (
    <div className="space-y-8">
      <div className="group relative">
        <div className="-translate-x-1/2 lg:-top-4 absolute top-2 left-1/2 mx-auto h-16 w-[70%] transform rounded-full bg-orange-500/10 blur-2xl lg:h-32" />
        <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
          <Image
            alt="Template Editor - Light Mode"
            className="block w-full rounded-xl object-cover dark:hidden"
            height={675}
            loading="lazy"
            src={assetUrl("template-editor-full-light.webp")}
            width={1200}
          />
          <Image
            alt="Template Editor - Dark Mode"
            className="hidden w-full rounded-xl object-cover dark:block"
            height={675}
            loading="lazy"
            src={assetUrl("template-editor-full-dark.webp")}
            width={1200}
          />
          <div className="absolute bottom-0 left-0 h-24 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-32" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap justify-center gap-3">
          {templateFeatures.map((feature) => (
            <div
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 transition-colors hover:border-orange-500/50"
              key={feature.title}
            >
              <feature.icon className="size-4 text-orange-500" />
              <span className="font-medium text-sm">{feature.title}</span>
              {feature.badge && (
                <Badge
                  className="bg-orange-500/10 text-orange-600 text-xs dark:text-orange-400"
                  variant="secondary"
                >
                  {feature.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BroadcastsContent() {
  return (
    <div className="space-y-8">
      <div className="group relative">
        <div className="-translate-x-1/2 lg:-top-4 absolute top-2 left-1/2 mx-auto h-16 w-[70%] transform rounded-full bg-orange-500/10 blur-2xl lg:h-32" />
        <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
          <Image
            alt="Broadcasts Dashboard - Light Mode"
            className="block w-full rounded-xl object-cover dark:hidden"
            height={675}
            loading="lazy"
            src={assetUrl("broadcasts-list-light.webp")}
            width={1200}
          />
          <Image
            alt="Broadcasts Dashboard - Dark Mode"
            className="hidden w-full rounded-xl object-cover dark:block"
            height={675}
            loading="lazy"
            src={assetUrl("broadcasts-list-dark.webp")}
            width={1200}
          />
          <div className="absolute bottom-0 left-0 h-24 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-32" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap justify-center gap-3">
          {broadcastFeatures.map((feature) => (
            <div
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 transition-colors hover:border-orange-500/50"
              key={feature.title}
            >
              <feature.icon className="size-4 text-orange-500" />
              <span className="font-medium text-sm">{feature.title}</span>
              {feature.badge && (
                <Badge
                  className="bg-orange-500/10 text-orange-600 text-xs dark:text-orange-400"
                  variant="secondary"
                >
                  {feature.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutomationsContent() {
  return (
    <div className="space-y-8">
      <div className="group relative">
        <div className="-translate-x-1/2 lg:-top-4 absolute top-2 left-1/2 mx-auto h-16 w-[70%] transform rounded-full bg-orange-500/10 blur-2xl lg:h-32" />
        <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
          <Image
            alt="Workflow Builder - Light Mode"
            className="block w-full rounded-xl object-cover dark:hidden"
            height={675}
            loading="lazy"
            src={assetUrl("automations-builder-light.avif")}
            width={1200}
          />
          <Image
            alt="Workflow Builder - Dark Mode"
            className="hidden w-full rounded-xl object-cover dark:block"
            height={675}
            loading="lazy"
            src={assetUrl("automations-builder-dark.avif")}
            width={1200}
          />
          <div className="absolute bottom-0 left-0 h-24 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-32" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap justify-center gap-3">
          {automationFeatures.map((feature) => (
            <div
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 transition-colors hover:border-orange-500/50"
              key={feature.title}
            >
              <feature.icon className="size-4 text-orange-500" />
              <span className="font-medium text-sm">{feature.title}</span>
              {feature.badge && (
                <Badge
                  className="bg-orange-500/10 text-orange-600 text-xs dark:text-orange-400"
                  variant="secondary"
                >
                  {feature.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const eventWorkflowExamples = [
  {
    event: "user.signed_up",
    workflow: "Welcome Series",
    steps: [
      "Welcome email",
      "Wait 1 day",
      "Getting started tips",
      "Wait 3 days",
      "Feature highlight",
    ],
  },
  {
    event: "trial.started",
    workflow: "Trial Onboarding",
    steps: [
      "Quick start guide",
      "Wait 2 days",
      "Check: activated?",
      "If no → help email",
      "Day 12 → upgrade CTA",
    ],
  },
  {
    event: "order.completed",
    workflow: "Post-Purchase",
    steps: [
      "Order confirmation",
      "Wait 7 days",
      "Review request",
      "Wait 30 days",
      "Reorder reminder",
    ],
  },
];

function EventWorkflowCard({
  example,
}: {
  example: (typeof eventWorkflowExamples)[0];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background">
      <div className="flex items-center gap-3 border-b bg-orange-500/5 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-orange-500">
          <Zap className="size-4 text-white" />
        </div>
        <div>
          <code className="font-mono font-semibold text-orange-500 text-sm">
            {example.event}
          </code>
          <p className="text-muted-foreground text-xs">triggers</p>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Workflow className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{example.workflow}</span>
        </div>
        <div className="space-y-2">
          {example.steps.map((step, index) => (
            <div className="flex items-center gap-2" key={step}>
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {index + 1}
              </div>
              <span className="text-muted-foreground text-xs">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventCodeExample() {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-red-500/80" />
          <div className="size-3 rounded-full bg-yellow-500/80" />
          <div className="size-3 rounded-full bg-green-500/80" />
        </div>
        <span className="ml-2 font-mono text-zinc-500 text-xs">
          your-app.ts
        </span>
      </div>
      <div className="p-4">
        <pre className="font-mono text-sm leading-relaxed">
          <span className="text-zinc-500">
            {"// Send an event when a user upgrades"}
          </span>
          {"\n"}
          <span className="text-purple-400">await</span>
          <span className="text-zinc-300"> client.</span>
          <span className="text-yellow-400">POST</span>
          <span className="text-zinc-300">(</span>
          <span className="text-green-400">'/v1/events/'</span>
          <span className="text-zinc-300">, {"{"}</span>
          {"\n"}
          <span className="text-zinc-300">
            {"  "}body: {"{"}
          </span>
          {"\n"}
          <span className="text-zinc-300">{"    "}name: </span>
          <span className="text-green-400">'plan.upgraded'</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">{"    "}contactEmail: </span>
          <span className="text-green-400">'jane@acme.co'</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">
            {"    "}properties: {"{"}{" "}
          </span>
          <span className="text-zinc-300">plan: </span>
          <span className="text-green-400">'pro'</span>
          <span className="text-zinc-300">{" }"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  }"}</span>
          {"\n"}
          <span className="text-zinc-300">{"})"}</span>
        </pre>
      </div>
    </div>
  );
}

function EventsContent() {
  return (
    <div className="space-y-8">
      <EventCodeExample />
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-muted-foreground text-sm font-medium">
          triggers workflows like
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {eventWorkflowExamples.map((example) => (
          <EventWorkflowCard example={example} key={example.event} />
        ))}
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap justify-center gap-3">
          {eventFeatures.map((feature) => (
            <div
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 transition-colors hover:border-orange-500/50"
              key={feature.title}
            >
              <feature.icon className="size-4 text-orange-500" />
              <span className="font-medium text-sm">{feature.title}</span>
              {feature.badge && (
                <Badge
                  className={cn(
                    "text-xs",
                    feature.badge === "Free"
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  )}
                  variant="secondary"
                >
                  {feature.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "automations", label: "Automations", icon: Workflow },
  { key: "events", label: "Tracked Events", icon: Activity },
  { key: "broadcasts", label: "Broadcasts", icon: Send },
  { key: "templates", label: "Templates", icon: LayoutGrid },
];

type GlowingTabProps = {
  activeIndex: number;
  onTabClick: (index: number) => void;
};

function GlowingTabBar({ activeIndex, onTabClick }: GlowingTabProps) {
  return (
    <div className="mb-8 flex flex-col items-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-xl dark:bg-orange-500/10" />
        <div className="relative inline-flex gap-1 rounded-full border border-orange-500/20 bg-background/80 p-1.5 shadow-lg backdrop-blur-sm dark:border-orange-500/30 dark:bg-background/50">
          {tabs.map((tab, index) => {
            const isActive = activeIndex === index;
            const Icon = tab.icon;
            return (
              <button
                className={cn(
                  "group relative flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 font-medium text-sm transition-all duration-300",
                  isActive
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105"
                    : "text-muted-foreground hover:bg-orange-500/10 hover:text-foreground dark:hover:bg-orange-500/20"
                )}
                key={tab.key}
                onClick={() => onTabClick(index)}
                type="button"
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-full bg-orange-500 blur-md opacity-50" />
                )}
                <Icon
                  className={cn(
                    "relative size-4 transition-transform duration-300",
                    isActive
                      ? "scale-110"
                      : "group-hover:scale-110 group-hover:text-orange-500"
                  )}
                />
                <span className="relative hidden sm:inline">{tab.label}</span>
                {!isActive && (
                  <div
                    className="absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-orange-500/10 to-transparent"
                    style={{ animationDelay: `${index * 0.3}s` }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ProductTabs() {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeTab = tabs[activeIndex].key;

  return (
    <div>
      <GlowingTabBar activeIndex={activeIndex} onTabClick={setActiveIndex} />

      <div className="min-h-[450px]">
        {activeTab === "templates" && <TemplatesContent />}
        {activeTab === "broadcasts" && <BroadcastsContent />}
        {activeTab === "automations" && <AutomationsContent />}
        {activeTab === "events" && <EventsContent />}
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Button asChild className="bg-orange-500 hover:bg-orange-600" size="lg">
          <a
            href="https://app.wraps.dev/auth?mode=signup"
            onClick={() =>
              trackEvent("cta_click", {
                location: "product_section",
                cta_text: "Start for free",
              })
            }
          >
            Start for free
            <ArrowRight className="ml-2 size-4" />
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/platform">Learn More</Link>
        </Button>
      </div>
    </div>
  );
}
