"use client";

import type { topicSettings } from "@wraps/db";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { UnderlineTabs } from "@/components/underline-tabs";
import type { TopicWithMeta } from "@/lib/topics";
import { DoubleOptInSettings } from "./double-opt-in-settings";
import {
  TOPICS_TAB_ID_PREFIX,
  TOPICS_TAB_LABEL,
  TOPICS_TABS,
  topicsTabParser,
} from "./lib/tabs";
import { PreferenceCenterSettings } from "./preference-center-settings";
import { TopicsTable } from "./topics-table";

type TopicSettingsType = typeof topicSettings.$inferSelect;

type TopicsTabsProps = {
  /** The page heading, kept in one block with the tabs so they sit under it. */
  heading: ReactNode;
  orgSlug: string;
  organizationId: string;
  topics: TopicWithMeta[];
  userRole: string;
  settings: TopicSettingsType | null;
  verifiedDomains: string[];
  brandColor: string | null;
  orgName: string;
  orgLogo: string | null;
};

export function TopicsTabs({
  heading,
  orgSlug,
  organizationId,
  topics,
  userRole,
  settings,
  verifiedDomains,
  brandColor,
  orgName,
  orgLogo,
}: TopicsTabsProps) {
  const [activeTab, setActiveTab] = useQueryState("tab", topicsTabParser);

  return (
    <>
      {/* One block so the tabs sit under the description, as on /emails. */}
      <div className="flex flex-col gap-3">
        {heading}
        <div className="px-4 lg:px-6">
          <UnderlineTabs
            idPrefix={TOPICS_TAB_ID_PREFIX}
            label="Topics sections"
            onValueChange={setActiveTab}
            tabs={TOPICS_TABS.map((tab) => ({
              value: tab,
              label: TOPICS_TAB_LABEL[tab],
            }))}
            value={activeTab}
          />
        </div>
      </div>

      <div
        aria-labelledby={`${TOPICS_TAB_ID_PREFIX}-${activeTab}`}
        className="@container/main px-4 lg:px-6"
        role="tabpanel"
      >
        {activeTab === "list" ? (
          <TopicsTable
            organizationId={organizationId}
            orgSlug={orgSlug}
            topics={topics}
            userRole={userRole}
          />
        ) : null}

        {activeTab === "double-opt-in" ? (
          <DoubleOptInSettings
            organizationId={organizationId}
            settings={settings}
            verifiedDomains={verifiedDomains}
          />
        ) : null}

        {activeTab === "preference-center" ? (
          <PreferenceCenterSettings
            brandColor={brandColor}
            organizationId={organizationId}
            orgLogo={orgLogo}
            orgName={orgName}
            orgSlug={orgSlug}
            settings={settings}
          />
        ) : null}
      </div>
    </>
  );
}
