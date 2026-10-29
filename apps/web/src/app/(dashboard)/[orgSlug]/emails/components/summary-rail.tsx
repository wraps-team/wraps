"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
import { formatDistance } from "date-fns";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReputationLabel } from "@/lib/analytics-scope";

/**
 * "Updated N minutes ago", in a leaf of its own.
 *
 * The clock used to live in the parent card, so every tick re-rendered the
 * whole card - the chart included - to repaint one line of 12px text.
 * Isolating it means the chart re-renders only when the chart data changes.
 *
 * Starting at null keeps the server and first client render identical; the
 * interval matches `formatDistance`'s minute granularity, so no tick is spent
 * producing the string that is already on screen.
 */
export function UpdatedAgo({ generatedAt }: { generatedAt: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return null;
  }

  return (
    <>
      Updated{" "}
      {formatDistance(new Date(generatedAt), new Date(now), {
        addSuffix: true,
      })}
    </>
  );
}

/** The "Updated N minutes ago" paragraph at the end of a summary rail. */
export function UpdatedLine({ generatedAt }: { generatedAt: number }) {
  return (
    <p className="text-muted-foreground text-xs">
      <UpdatedAgo generatedAt={generatedAt} />
    </p>
  );
}

/**
 * The scope prose for the reputation figure, behind a disclosure.
 *
 * These two sentences are the reason the card had a layout problem: three or
 * four lines of 12px text explaining which population the rates describe, set
 * in a 176px column, generating more height than the chart beside them. They
 * still matter - a reader who assumes the bounce rate is window-scoped will
 * misread it - but they are reference material, not something to re-read on
 * every visit.
 *
 * A popover rather than a tooltip: a tooltip cannot be opened by touch.
 */
export function ReputationScope({
  reputation,
}: {
  reputation: ReputationLabel;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`What "${reputation.title}" measures`}
          className="-my-2"
          size="icon-sm"
          variant="ghost"
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      {/*
        Opens upward, into the header's whitespace. Anchored below or beside,
        the panel covered the two rates it exists to explain - the trigger sits
        in the middle of the rail, with the numbers under and after it.
      */}
      <PopoverContent align="start" className="w-72" side="top">
        <p className="text-sm">{reputation.detail}</p>
        {reputation.note ? (
          <p className="mt-2 text-muted-foreground text-sm">
            {reputation.note}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function Figure({
  label,
  value,
  aside,
}: {
  label: string;
  value: string;
  aside?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-semibold text-2xl leading-none tabular-nums">
          {value}
        </span>
        {aside ? (
          <span className="text-muted-foreground text-sm">{aside}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The rule between two populations in a rail. Hidden below 540px, where the
 * rail wraps and a vertical rule would sit between nothing.
 */
export function RailDivider() {
  return (
    <div
      aria-hidden="true"
      className="@[540px]/card:block hidden h-10 w-px bg-border"
    />
  );
}
