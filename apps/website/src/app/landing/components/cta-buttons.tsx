"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Github } from "@/components/ui/svgs/brand-icons";
import {
  CLOSING_CTA,
  CLOSING_CTA_LABELS,
  trackClosingCtaClick,
} from "@/lib/closing-cta";
import { CopyCommand } from "./copy-command";

/** One primary action, the command as a quiet alternative, two text links. */
export function CTAButtons() {
  return (
    <div className="flex flex-col items-center">
      <Button
        asChild
        className="w-full cursor-pointer sm:w-auto"
        size="lg"
        variant="brand"
      >
        <a
          href="https://app.wraps.dev/auth?mode=signup"
          onClick={() => trackClosingCtaClick("primary")}
        >
          {CLOSING_CTA_LABELS.primary}
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>

      <div className="mt-6 hidden flex-col items-center gap-2 sm:flex">
        <p className="text-muted-foreground text-xs">
          or set it up from your terminal
        </p>
        <CopyCommand
          command="npx @wraps.dev/cli email init"
          location={CLOSING_CTA.location}
          properties={{ cta_variant: CLOSING_CTA.variant }}
        />
      </div>

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <a
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="/docs/quickstart"
          onClick={() => trackClosingCtaClick("docs")}
        >
          {CLOSING_CTA_LABELS.docs}
        </a>
        <a
          className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="https://github.com/wraps-team/wraps"
          onClick={() => trackClosingCtaClick("github")}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Github aria-hidden="true" className="size-4" />
          {CLOSING_CTA_LABELS.github}
        </a>
      </p>
    </div>
  );
}
