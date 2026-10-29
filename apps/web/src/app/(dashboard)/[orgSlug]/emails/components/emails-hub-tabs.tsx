import Link from "next/link";
import { type HubDays, type HubTab, hubHref } from "@/lib/emails-hub";
import { cn } from "@/lib/utils";

const TABS: { tab: HubTab; label: string }[] = [
  { tab: "activity", label: "Activity" },
  { tab: "engagement", label: "Engagement" },
  { tab: "deliverability", label: "Deliverability" },
];

type EmailsHubTabsProps = {
  orgSlug: string;
  tab: HubTab;
  days: HubDays;
};

/**
 * Tab links for the `/emails` hub. Switching tabs keeps the page range and
 * drops every other param, so a status or search filter never leaks into a
 * tab it does not apply to.
 */
export function EmailsHubTabs({ orgSlug, tab, days }: EmailsHubTabsProps) {
  return (
    <nav aria-label="Emails sections" className="px-4 lg:px-6">
      <ul className="inline-flex gap-1 rounded-lg bg-muted p-0.75">
        {TABS.map((item) => {
          const active = item.tab === tab;
          return (
            <li key={item.tab}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-sm transition-colors focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
                href={hubHref(orgSlug, { tab: item.tab, days })}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
