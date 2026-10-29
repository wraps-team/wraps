import Link from "next/link";
import { underlineTabClass } from "@/components/underline-tabs";
import { type HubDays, type HubTab, hubHref } from "@/lib/emails-hub";

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
      <ul className="flex gap-6 border-b">
        {TABS.map((item) => {
          const active = item.tab === tab;
          return (
            <li key={item.tab}>
              <Link
                aria-current={active ? "page" : undefined}
                className={underlineTabClass(active)}
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
