"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Check, X } from "lucide-react";
import { motion, useInView } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { PRICING_TIERS } from "@/config/pricing";
import { FadeIn } from "./animations";

// Get prices from config
const freeTier = PRICING_TIERS.find((t) => t.id === "free")!;
const proTier = PRICING_TIERS.find((t) => t.id === "pro")!;
const businessTier = PRICING_TIERS.find((t) => t.id === "business")!;

const comparisonFeatures = [
  {
    feature: "Hosted dashboard",
    free: true,
    pro: true,
    business: true,
  },
  {
    feature: "CLI + SDK",
    free: true,
    pro: true,
    business: true,
  },
  {
    feature: "Workflows",
    free: "2",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    feature: "AI generations",
    free: "10/mo",
    pro: "250/mo",
    business: "1,000/mo",
  },
  {
    feature: "Contacts",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    feature: "Templates",
    free: true,
    pro: true,
    business: true,
  },
  {
    feature: "Team members",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    feature: "Topics, segments & broadcasts",
    free: false,
    pro: true,
    business: true,
  },
  {
    feature: "Cross-channel cascades",
    free: false,
    pro: true,
    business: true,
  },
  {
    feature: "Event tracking",
    free: false,
    pro: true,
    business: true,
  },
  {
    feature: "AI workflow generation",
    free: false,
    pro: false,
    business: true,
  },
  {
    feature: "Behavioral segments",
    free: false,
    pro: false,
    business: true,
  },
  {
    feature: "AWS accounts",
    free: "1",
    pro: "3",
    business: "Unlimited",
  },
  {
    feature: "Dashboard history",
    free: "30 days",
    pro: "90 days",
    business: "1 year",
  },
  {
    feature: "Support",
    free: "Community",
    pro: "Email",
    business: "Priority",
  },
];

// Premium background class - use this on all premium sections
// Light mode: warm neutral stone tint
// Dark mode: slightly lighter than base (white overlay)
export const premiumBgClass = "bg-stone-100/50 dark:bg-white/[0.06]";

// Terminal-style transition between sections
function TerminalTransition() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div className="relative py-16" ref={ref}>
      <div className="mx-auto max-w-2xl px-4">
        {/* Terminal window */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="overflow-hidden rounded-lg border border-zinc-800 bg-[#0a0a0a] shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          {/* Terminal header */}
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-red-500/80" />
              <div className="size-3 rounded-full bg-yellow-500/80" />
              <div className="size-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-mono text-zinc-500 text-xs">
              ~/wraps
            </span>
          </div>

          {/* Terminal content */}
          <div className="p-4 font-mono text-sm">
            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <span className="text-green-500">$</span>
              <span className="text-zinc-300"> wraps platform</span>
            </motion.div>

            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="mt-2 text-zinc-500"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.6 }}
            >
              ✓ CLI + SDK installed
            </motion.div>

            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="text-zinc-500"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.8 }}
            >
              ✓ Infrastructure deployed
            </motion.div>

            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="mt-2 text-orange-500"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 1.0 }}
            >
              → Add templates, broadcasts, and automations...
            </motion.div>

            <motion.div
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              className="mt-3 flex items-center"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: 1.3 }}
            >
              <span className="text-green-500">$</span>
              <span className="ml-1 h-4 w-2 animate-pulse bg-zinc-300" />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Animated table row
function TableRow({
  row,
  index,
  isLast,
}: {
  row: (typeof comparisonFeatures)[0];
  index: number;
  isLast: boolean;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className={`grid grid-cols-4 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-6 ${
        isLast ? "" : "border-b"
      }`}
      initial={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <div className="text-sm">{row.feature}</div>
      <div className="flex justify-center">
        {typeof row.free === "string" ? (
          <span className="text-muted-foreground text-xs sm:text-sm">
            {row.free}
          </span>
        ) : row.free ? (
          <>
            <Check aria-hidden="true" className="size-5 text-green-500" />
            <span className="sr-only">Included</span>
          </>
        ) : (
          <>
            <X aria-hidden="true" className="size-5 text-muted-foreground/30" />
            <span className="sr-only">Not included</span>
          </>
        )}
      </div>
      <div className="flex justify-center">
        {typeof row.pro === "string" ? (
          <span className="text-foreground text-xs sm:text-sm">{row.pro}</span>
        ) : row.pro ? (
          <>
            <Check aria-hidden="true" className="size-5 text-green-500" />
            <span className="sr-only">Included</span>
          </>
        ) : (
          <>
            <X aria-hidden="true" className="size-5 text-muted-foreground/30" />
            <span className="sr-only">Not included</span>
          </>
        )}
      </div>
      <div className="flex justify-center">
        {typeof row.business === "string" ? (
          <span className="font-medium text-orange-500 text-xs sm:text-sm">
            {row.business}
          </span>
        ) : row.business ? (
          <>
            <Check aria-hidden="true" className="size-5 text-green-500" />
            <span className="sr-only">Included</span>
          </>
        ) : (
          <>
            <X aria-hidden="true" className="size-5 text-muted-foreground/30" />
            <span className="sr-only">Not included</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

export function UpgradeSection() {
  const tableRef = useRef<HTMLDivElement>(null);
  const isTableInView = useInView(tableRef, { once: true, margin: "-100px" });

  return (
    <section className="relative pt-16">
      {/* Header */}
      <FadeIn className="pb-12 text-center">
        <p className="mb-2 font-medium text-orange-500 text-sm">
          Ready for More?
        </p>
        <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
          Compare Plans
        </h2>
        <p className="mx-auto max-w-2xl text-pretty text-muted-foreground">
          Start free with 1,000 messages/month. Upgrade when you need more
          volume, batch sending, or marketing features.
        </p>
      </FadeIn>

      {/* Table section */}
      <div className="relative">
        {/* Diagonal background transition */}
        <div
          className="pointer-events-none absolute inset-0 bg-stone-100/50 dark:bg-white/[0.06]"
          style={{
            clipPath: "polygon(0 31%, 100% 10%, 100% 100%, 0 100%)",
          }}
        />
        <div className="relative pb-2">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl" ref={tableRef}>
              <motion.div
                animate={
                  isTableInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }
                }
                className="overflow-hidden rounded-2xl border bg-background shadow-lg"
                initial={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                {/* Table Header */}
                <div className="grid grid-cols-4 border-b bg-muted/50 px-4 py-4 sm:px-6">
                  <div className="font-medium text-muted-foreground text-sm">
                    Feature
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-green-600 text-sm dark:text-green-400">
                      Free
                    </span>
                    <p className="text-muted-foreground text-xs">
                      ${freeTier.price}/mo
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm">Pro</span>
                    <p className="text-muted-foreground text-xs">
                      ${proTier.price}/mo
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-orange-500 text-sm">
                      Business
                    </span>
                    <p className="text-muted-foreground text-xs">
                      ${businessTier.price}/mo
                    </p>
                  </div>
                </div>

                {/* Table Rows */}
                {isTableInView &&
                  comparisonFeatures.map((row, index) => (
                    <TableRow
                      index={index}
                      isLast={index === comparisonFeatures.length - 1}
                      key={row.feature}
                      row={row}
                    />
                  ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              className="border-green-500/50 bg-background text-green-700 hover:bg-green-500/10 dark:text-green-400"
              size="lg"
              variant="outline"
            >
              <a href="https://app.wraps.dev/auth?mode=signup&plan=free">
                Start Free
              </a>
            </Button>
            <Button
              asChild
              className="bg-orange-500 hover:bg-orange-600"
              size="lg"
            >
              <Link href="/platform">
                See Platform Details
                <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Terminal transition */}
        <TerminalTransition />
      </div>
    </section>
  );
}
