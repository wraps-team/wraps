"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  browserTimeZone,
  buildDrilldownHref,
  type DrilldownMetric,
} from "@/lib/analytics-drilldown-window";

/**
 * "View causes" in a rate card's header. The timezone is read after mount, so
 * the server markup does not carry the server's zone.
 */
export function ViewCausesLink({
  orgSlug,
  metric,
  days,
}: {
  orgSlug: string;
  metric: DrilldownMetric;
  days: number;
}) {
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    setTz(browserTimeZone());
  }, []);
  return (
    <Link
      className="self-center text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
      href={buildDrilldownHref(orgSlug, { metric, days, tz })}
    >
      View causes
    </Link>
  );
}
