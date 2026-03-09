"use client";

import { Calendar, Filter, Send, Tag, Users } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
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
    badge: "Starter",
  },
  {
    icon: Calendar,
    title: "Schedule",
    description: "Pick a date and time for automatic sending",
    badge: "Starter",
  },
  {
    icon: Tag,
    title: "Topics",
    description: "Let contacts subscribe to what they care about",
    badge: "Starter",
  },
  {
    icon: Users,
    title: "Preference Center",
    description: "Hosted page for managing subscriptions",
    badge: "Starter",
  },
];

export function DashboardBroadcastsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      className="relative overflow-x-clip bg-stone-100/50 pt-32 pb-24 dark:bg-white/[0.06]"
      id="broadcasts"
      ref={ref}
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
        <motion.div
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          className="mb-16 flex items-center gap-4"
          initial={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
            2
          </div>
          <div>
            <p className="font-medium text-orange-500 text-sm">Chapter Two</p>
            <h2 className="font-bold text-2xl tracking-tight sm:text-3xl">
              Reach Your Audience
            </h2>
          </div>
        </motion.div>

        {/* Split layout: Screenshot left (overflow), content right */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Screenshot - overflows left */}
          <motion.div
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            className="group relative lg:-ml-32 xl:-ml-48 2xl:-ml-64"
            initial={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Background glow */}
            <div className="absolute -inset-4 rounded-3xl bg-orange-500/10 blur-2xl opacity-50" />

            <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
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
          </motion.div>

          {/* Content */}
          <motion.div
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            className="space-y-8"
            initial={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <p className="text-lg text-muted-foreground">
              Send newsletters, announcements, and marketing campaigns.
              Segments, topics, and scheduling included in Starter.
            </p>

            {/* Features as list */}
            <div className="space-y-4">
              {features.map((feature, index) => (
                <motion.div
                  animate={
                    isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                  }
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  key={feature.title}
                  transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
                    <feature.icon className="size-4 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{feature.title}</span>
                      {feature.badge && (
                        <Badge
                          className="bg-orange-500/10 text-orange-600 text-xs dark:text-orange-400"
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
                </motion.div>
              ))}
            </div>

            {/* Upgrade hint */}
            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <p className="text-sm">
                <span className="font-medium text-orange-600 dark:text-orange-400">
                  Starter ($19/mo):
                </span>{" "}
                <span className="text-muted-foreground">
                  Broadcasts, segments, scheduling, and topics
                </span>
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium text-orange-600 dark:text-orange-400">
                  Growth ($79/mo):
                </span>{" "}
                <span className="text-muted-foreground">
                  Everything in Starter plus AI workflows and 3 AWS accounts
                </span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
