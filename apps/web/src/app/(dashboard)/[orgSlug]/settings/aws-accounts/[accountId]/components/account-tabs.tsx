"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = {
  segment: string | null;
  label: string;
  href: string;
  manageOnly?: boolean;
};

// Later phases append to this array.
const TABS: readonly Tab[] = [
  { segment: null, label: "Overview", href: "" },
  { segment: "services", label: "Services", href: "/services" },
  { segment: "connection", label: "Connection", href: "/connection" },
  { segment: "access", label: "Access", href: "/access", manageOnly: true },
];

type AccountTabsProps = {
  baseHref: string;
  canManage: boolean;
};

/**
 * Route-based tabs: each tab is a real URL. The Radix Tabs component is client
 * state and has the wrong semantics for navigation, so this borrows only its
 * look (see packages/ui tabs.tsx).
 */
export function AccountTabs({ baseHref, canManage }: AccountTabsProps) {
  const activeSegment = useSelectedLayoutSegment();

  return (
    <nav
      aria-label="Account sections"
      className="inline-flex h-9 w-fit max-w-full items-center overflow-x-auto rounded-lg bg-muted p-0.75 text-muted-foreground"
    >
      {TABS.filter((tab) => canManage || !tab.manageOnly).map((tab) => {
        const active = tab.segment === activeSegment;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1 font-medium text-foreground text-sm transition-colors focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-muted-foreground",
              active &&
                "bg-background shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground"
            )}
            href={`${baseHref}${tab.href}`}
            key={tab.label}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
