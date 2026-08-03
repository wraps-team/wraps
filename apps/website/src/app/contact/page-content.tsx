"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowUpRight, BookOpen, Mail, MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { Github } from "@/components/ui/svgs/brand-icons";

const Cal = dynamic(() => import("@calcom/embed-react"), {
  ssr: false,
  loading: () => null,
});

const CAL_LINK = "wraps/get-started-with-wraps";
const CAL_PAGE_URL = `https://cal.com/${CAL_LINK}`;

/** How long the embed may stay blank before we surface a direct link. */
const SLOW_LOAD_MS = 8000;

type EmbedState = "loading" | "ready" | "failed";

type Channel = {
  icon: typeof MessageCircle;
  title: string;
  description: string;
  action: string;
  href: string;
  external?: boolean;
};

const channels: Channel[] = [
  {
    icon: MessageCircle,
    title: "Discord Community",
    description:
      "Join our active community for quick help and discussions with other developers.",
    action: "Join Discord",
    href: "https://discord.gg/pdgAa6xAWF",
    external: true,
  },
  {
    icon: Github,
    title: "GitHub Issues",
    description:
      "Report bugs, request features, or contribute to our open source repository.",
    action: "View on GitHub",
    href: "https://github.com/wraps-team/wraps/issues",
    external: true,
  },
  {
    icon: Mail,
    title: "Email Support",
    description:
      "Prefer email? Send us the details and we'll get back to you directly.",
    action: "support@wraps.dev",
    href: "mailto:support@wraps.dev",
    external: true,
  },
  {
    icon: BookOpen,
    title: "Documentation",
    description:
      "Browse our comprehensive guides, tutorials, and component documentation.",
    action: "View Docs",
    href: "/docs",
  },
];

function ChannelCard({ channel }: { channel: Channel }) {
  const Icon = channel.icon;
  const body = (
    <>
      <Icon
        aria-hidden="true"
        className="mb-3 size-5 text-foreground transition-colors group-hover:text-orange-500"
      />
      <h3 className="mb-1.5 font-heading font-semibold text-[15px] text-foreground">
        {channel.title}
      </h3>
      <p className="mb-3 text-[13.5px] text-muted-foreground leading-[1.55]">
        {channel.description}
      </p>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em] transition-colors group-hover:text-orange-500">
        {channel.action}
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </span>
    </>
  );

  const className =
    "group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-orange-500/40";

  if (channel.external) {
    return (
      <a
        className={className}
        href={channel.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {body}
      </a>
    );
  }

  return (
    <Link className={className} href={channel.href}>
      {body}
    </Link>
  );
}

/**
 * Placeholder that holds the booking column's space while the Cal.com iframe
 * boots. Without it the right column renders as an empty void for several
 * seconds and the page reads as broken.
 */
function BookingPlaceholder({
  state,
  slow,
}: {
  state: EmbedState;
  slow: boolean;
}) {
  const unavailable = state === "failed" || slow;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col gap-4 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
        {unavailable ? "calendar unavailable" : "loading calendar"}
      </div>

      <div className="grid flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-5 w-40 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted motion-safe:animate-pulse" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 28 }, (_, i) => `cell-${i}`).map((cell) => (
            <div
              className="aspect-square rounded bg-muted motion-safe:animate-pulse"
              key={cell}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BookingPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbedState>("loading");
  const [slow, setSlow] = useState(false);
  const [calTheme, setCalTheme] = useState<"dark" | "light" | null>(null);

  // The embed bakes its theme into the iframe URL at mount, so it can only be
  // rendered once the app's theme is settled — otherwise a dark-mode visitor
  // gets a white calendar. The root class is the source of truth the theme
  // provider writes to.
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setCalTheme(root.classList.contains("dark") ? "dark" : "light");

    const timer = setTimeout(read, 0);
    const observer = new MutationObserver(read);
    observer.observe(root, { attributeFilter: ["class"], attributes: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // The embed reports its own status on the <cal-inline> element it injects
  // (loading="done" | "failed"). Watching the DOM keeps us out of Cal's global
  // init queue, which conflicts with the component's own initialization.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const readStatus = () => {
      const status = container
        .querySelector("cal-inline")
        ?.getAttribute("loading");
      if (status === "done") {
        setState("ready");
        return true;
      }
      if (status === "failed") {
        setState("failed");
        return true;
      }
      return false;
    };

    if (readStatus()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (readStatus()) {
        observer.disconnect();
      }
    });
    observer.observe(container, {
      attributeFilter: ["loading"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const isReady = state === "ready";
  const degraded = state === "failed" || (slow && !isReady);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-3">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-orange-500"
          />
          book · intro call
        </span>
      </div>

      <div
        aria-busy={!isReady}
        className="relative min-h-[620px]"
        ref={containerRef}
      >
        {isReady ? null : <BookingPlaceholder slow={slow} state={state} />}

        {calTheme ? (
          <Cal
            calLink={CAL_LINK}
            className={`relative min-h-[620px] w-full overflow-hidden transition-opacity duration-300 motion-reduce:transition-none ${
              isReady ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            config={{ layout: "month_view", theme: calTheme }}
            key={calTheme}
          />
        ) : null}
      </div>

      {/* Always available: the embed is a third-party iframe and can be slow
          or blank, so the direct booking link is never more than one click
          away. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-t px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {degraded
            ? "Calendar not loading? Open the booking page directly."
            : "Prefer the full page? Book from cal.com instead."}
        </p>
        <Button
          asChild
          className={
            degraded
              ? "cursor-pointer bg-orange-500 text-white hover:bg-orange-600"
              : "cursor-pointer"
          }
          size="sm"
          variant={degraded ? "default" : "outline"}
        >
          <a href={CAL_PAGE_URL} rel="noopener noreferrer" target="_blank">
            Open booking page
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function ContactPageContent() {
  return (
    <section className="py-16 sm:py-20" id="contact">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-orange-500"
            />
            <span>wraps · contact</span>
          </div>

          <h1 className="mb-4 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
            Book a call <span className="text-orange-500">with us</span>
          </h1>

          <p className="text-lg text-muted-foreground">
            Schedule a time to chat about your email infrastructure needs. We'll
            help you get started with Wraps.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:order-2 lg:col-span-2">
            <BookingPanel />
          </div>

          <div className="lg:order-1">
            <SectionKicker>Other ways to reach us</SectionKicker>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {channels.map((channel) => (
                <ChannelCard channel={channel} key={channel.title} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
