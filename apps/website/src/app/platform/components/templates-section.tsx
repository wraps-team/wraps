"use client";

import {
  CheckCircle,
  Code,
  Eye,
  LayoutGrid,
  Palette,
  Sparkles,
} from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { assetUrl } from "@/lib/utils";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Generate emails from prompts",
    badge: "AI",
  },
  {
    icon: LayoutGrid,
    title: "React Email",
    description: "20+ typed components",
  },
  {
    icon: CheckCircle,
    title: "Every Client",
    description: "React Email powered",
  },
  {
    icon: Eye,
    title: "Live Preview",
    description: "Desktop, tablet, mobile",
  },
  {
    icon: Code,
    title: "Export",
    description: "HTML, JSON, React",
  },
  {
    icon: Palette,
    title: "Brand Kits",
    description: "Auto-apply your styles",
  },
];

export function DashboardTemplatesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      className="relative overflow-x-clip py-24"
      id="templates"
      ref={ref}
    >
      {/* Chapter indicator */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          className="mb-16 flex items-center gap-4"
          initial={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
            1
          </div>
          <div>
            <p className="font-medium text-orange-500 text-sm">Chapter One</p>
            <h2 className="font-bold text-2xl tracking-tight sm:text-3xl">
              Build Templates
            </h2>
          </div>
        </motion.div>
      </div>

      {/* Full-width screenshot - larger on desktop */}
      <motion.div
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:max-w-7xl lg:px-8 xl:max-w-[90rem]"
        initial={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="group relative">
          {/* Background glow */}
          <div className="-translate-x-1/2 absolute -top-8 left-1/2 mx-auto h-32 w-[80%] transform rounded-full bg-orange-500/10 blur-3xl" />

          <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
            {/* Light mode image */}
            <img
              alt="Template Editor - Light Mode"
              className="block w-full object-cover dark:hidden"
              decoding="async"
              loading="lazy"
              src={assetUrl("template-editor-full-light.webp")}
            />
            {/* Dark mode image */}
            <img
              alt="Template Editor - Dark Mode"
              className="hidden w-full object-cover dark:block"
              decoding="async"
              loading="lazy"
              src={assetUrl("template-editor-full-dark.webp")}
            />

            {/* Bottom fade effect */}
            <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-background via-background/80 to-transparent" />
          </div>
        </div>
      </motion.div>

      {/* Content below screenshot */}
      <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6 lg:px-8">
        <motion.p
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="mx-auto mb-10 max-w-2xl text-center text-lg text-muted-foreground"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          AI-first editor with raw code access. Built on React Email for
          pixel-perfect rendering across Gmail, Outlook, Apple Mail, and every
          other client.
        </motion.p>

        {/* Feature Pills */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {features.map((feature, index) => (
            <motion.div
              animate={
                isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }
              }
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 transition-colors hover:border-orange-500/50"
              initial={{ opacity: 0, scale: 0.9 }}
              key={feature.title}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
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
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          className="mt-8 text-center text-muted-foreground text-sm"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          Included in all plans — even Free
        </motion.p>
      </div>
    </section>
  );
}
