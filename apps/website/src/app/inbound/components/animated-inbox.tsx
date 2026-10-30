"use client";

import { Inbox, Mail, Paperclip, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const sampleEmails = [
  {
    id: 1,
    from: "customer@example.com",
    subject: "Order #12345 Question",
    preview: "Hi, I have a question about my recent order...",
    hasAttachment: false,
    isSpam: false,
    time: "2m ago",
  },
  {
    id: 2,
    from: "support@partner.io",
    subject: "Integration Request",
    preview: "We'd like to discuss API integration options...",
    hasAttachment: true,
    isSpam: false,
    time: "5m ago",
  },
  {
    id: 3,
    from: "noreply@service.com",
    subject: "Receipt for Payment #9876",
    preview: "Thank you for your payment. Attached is your receipt...",
    hasAttachment: true,
    isSpam: false,
    time: "12m ago",
  },
  {
    id: 4,
    from: "lead@prospect.co",
    subject: "Interested in your product",
    preview: "I saw your demo and would love to learn more...",
    hasAttachment: false,
    isSpam: false,
    time: "18m ago",
  },
];

const allIndexes = sampleEmails.map((_, index) => index);

export function AnimatedInbox() {
  const [visibleEmails, setVisibleEmails] = useState<number[]>([]);
  const [animatingEmail, setAnimatingEmail] = useState<number | null>(null);

  useEffect(() => {
    // Reduced motion: show the full inbox immediately, never loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleEmails(allIndexes);
      return;
    }

    const showEmails = () => {
      sampleEmails.forEach((_, index) => {
        setTimeout(() => {
          setAnimatingEmail(index);
          setTimeout(() => {
            setVisibleEmails((prev) => [...prev, index]);
            setAnimatingEmail(null);
          }, 300);
        }, index * 400);
      });
    };

    showEmails();

    const interval = setInterval(() => {
      setVisibleEmails([]);
      setAnimatingEmail(null);
      setTimeout(showEmails, 500);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
      {/* Inbox header */}
      <div className="flex items-center justify-between border-border border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Inbox aria-hidden="true" className="size-3.5 text-brand-text" />
          <span className="font-mono text-muted-foreground text-xs">
            inbox@yourapp.com
          </span>
        </div>
        <span className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
          {visibleEmails.length} emails
        </span>
      </div>

      {/* Email list */}
      <div className="relative min-h-[280px] bg-background/40 p-2">
        {sampleEmails.map((email, index) => {
          const isVisible = visibleEmails.includes(index);
          const isAnimating = animatingEmail === index;

          return (
            <div
              className={cn(
                "mb-2 rounded-lg border border-transparent p-3 transition-all duration-300",
                isVisible && "translate-x-0 border-border bg-card opacity-100",
                !isVisible && isAnimating && "translate-x-8 opacity-50",
                !(isVisible || isAnimating) && "translate-x-full opacity-0",
                isVisible && "hover:border-brand/30 hover:bg-brand/5"
              )}
              key={email.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-foreground text-xs">
                      {email.from}
                    </span>
                    {email.hasAttachment && (
                      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    {!email.isSpam && (
                      <ShieldCheck className="size-3 shrink-0 text-success" />
                    )}
                  </div>
                  <p className="mb-0.5 truncate font-medium text-sm">
                    {email.subject}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {email.preview}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-muted-foreground text-xs">
                  {email.time}
                </span>
              </div>
            </div>
          );
        })}

        {/* Incoming email indicator */}
        {animatingEmail !== null && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center">
            <div className="size-2 animate-ping rounded-full bg-brand" />
          </div>
        )}
      </div>
    </div>
  );
}
