"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  type ToolCta,
  type ToolCtaContext,
  type ToolId,
  trackToolCtaClick,
  trackToolCtaView,
} from "@/lib/tool-cta";

/**
 * The one signup box for every free tool page. What it says comes from `lib/tool-cta`;
 * this only draws it and reports views and clicks. Never gates a tool.
 */
export function ToolSignupBox({
  tool,
  cta,
  layout = "row",
}: {
  tool: ToolId;
  cta: ToolCta;
  /** `stacked` puts the buttons under the text, for narrow columns such as the docs. */
  layout?: "row" | "stacked";
}) {
  const pagePath = usePathname() ?? "";
  const context: ToolCtaContext = { tool, state: cta.state, pagePath };
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // One impression per tool and state, when at least half the box is on screen. A new
  // state (a different domain was checked) is a new impression.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackToolCtaView({ tool, state: cta.state, pagePath });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tool, cta.state, pagePath]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div ref={ref}>
      <Card className="border-border bg-card">
        <CardContent>
          <div
            className={
              layout === "row"
                ? "flex flex-col gap-5 md:flex-row md:items-center"
                : "flex flex-col gap-5"
            }
          >
            <div className="flex-1 space-y-3">
              <h3 className="font-heading font-semibold text-xl tracking-tight">
                {cta.headline}
              </h3>
              <p className="text-muted-foreground">{cta.body}</p>
              {cta.command && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 py-1.5 pr-1.5 pl-3">
                  <code className="overflow-x-auto whitespace-nowrap font-mono text-foreground text-sm">
                    {cta.command}
                  </code>
                  <Button
                    aria-label="Copy command"
                    onClick={() => {
                      navigator.clipboard.writeText(cta.command ?? "");
                      setCopied(true);
                      trackToolCtaClick(context, "copy");
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {copied ? (
                      <Check
                        aria-hidden="true"
                        className="size-4 text-success"
                      />
                    ) : (
                      <Copy aria-hidden="true" className="size-4" />
                    )}
                    <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              )}
            </div>
            <div
              className={
                layout === "row"
                  ? "flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row"
                  : "flex flex-col gap-3 sm:flex-row"
              }
            >
              <Button asChild size="lg" variant="brand">
                <a
                  href={cta.primary.href}
                  onClick={() => trackToolCtaClick(context, "primary")}
                >
                  {cta.primary.label}
                  <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link
                  href={cta.secondary.href}
                  onClick={() => trackToolCtaClick(context, "secondary")}
                >
                  {cta.secondary.label}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
