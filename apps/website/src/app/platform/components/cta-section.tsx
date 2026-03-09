"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export function DashboardCtaSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-24" ref={ref}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          className="relative overflow-hidden rounded-2xl bg-foreground px-8 py-16 text-center text-background"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          {/* Background glow */}
          <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl" />

          <motion.div
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            className="relative"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="mb-4 flex items-center justify-center gap-2 text-orange-400">
              <Sparkles className="size-4" />
              <span className="font-medium text-sm">Start Your Journey</span>
            </div>

            <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
              Build. Send. Automate.
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-background/70">
              Your AWS handles sending. We handle the DX. Unlimited contacts,
              infrastructure you own. Start free or $19/mo for the Wraps
              Platform.
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                asChild
                className="bg-orange-500 text-white hover:bg-orange-600"
                size="lg"
              >
                <a href="https://app.wraps.dev/auth?mode=signup">
                  Get Started
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
              <Button
                asChild
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
                size="lg"
                variant="outline"
              >
                <a href="#pricing">View Pricing</a>
              </Button>
            </div>

            {/* Journey reminder */}
            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="mt-8 flex items-center justify-center gap-6 text-background/50 text-xs"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <span>1. Build templates</span>
              <span className="text-background/30">→</span>
              <span>2. Send broadcasts</span>
              <span className="text-background/30">→</span>
              <span>3. Automate workflows</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
