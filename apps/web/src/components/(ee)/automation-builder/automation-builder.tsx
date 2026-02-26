"use client";

import type {
  Automation,
  AutomationStep,
  AutomationTransition,
} from "@wraps/db";
import { ReactFlowProvider } from "@xyflow/react";
import { useRef } from "react";
import { AIDesignPanel } from "./ai-design-panel";
import { AutomationCanvas } from "./automation-canvas";
import { AutomationDataProvider } from "./automation-data-context";
import { AutomationPropertiesPanel } from "./automation-properties-panel";
import { AutomationSettingsPanel } from "./automation-settings-panel";
import { AutomationToolbar } from "./automation-toolbar";
import {
  useAutomationStore,
  useSettingsPanelOpen,
} from "./use-automation-store";

type Topic = {
  id: string;
  name: string;
};

type Segment = {
  id: string;
  name: string;
};

type AwsAccount = {
  id: string;
  name: string;
  region: string;
  smsEnabled?: boolean;
};

type OrgDefaults = {
  defaultAwsAccountId: string | null;
  defaultFrom: string | null;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
  defaultSenderId: string | null;
} | null;

type AutomationBuilderProps = {
  automation: Automation;
  organizationId: string;
  orgSlug: string;
  topics: Topic[];
  segments: Segment[];
  awsAccounts: AwsAccount[];
  orgDefaults: OrgDefaults;
  userRole: string;
};

export function AutomationBuilder({
  automation,
  organizationId,
  orgSlug,
  topics,
  segments,
  awsAccounts,
  orgDefaults,
  userRole,
}: AutomationBuilderProps) {
  const setAutomation = useAutomationStore((state) => state.setAutomation);
  const settingsPanelOpen = useSettingsPanelOpen();
  const setSettingsPanelOpen = useAutomationStore(
    (state) => state.setSettingsPanelOpen
  );
  const selectedNodeId = useAutomationStore((state) => state.selectedNodeId);

  // Initialize store with automation data once (and on automation ID change)
  const initializedForId = useRef<string | null>(null);
  if (initializedForId.current !== automation.id) {
    initializedForId.current = automation.id;
    setAutomation(automation);

    // Auto-open settings panel for new automations (only trigger node, no transitions)
    const steps = automation.steps as AutomationStep[];
    const transitions = automation.transitions as AutomationTransition[];
    if (steps.length <= 1 && transitions.length === 0) {
      setSettingsPanelOpen(true);
    }
  }

  return (
    <ReactFlowProvider>
      <AutomationDataProvider segments={segments} topics={topics}>
        <div className="flex h-full flex-col">
          <AutomationToolbar
            automation={automation}
            organizationId={organizationId}
            orgSlug={orgSlug}
          />
          <div className="flex flex-1 overflow-hidden">
            <AIDesignPanel automationId={automation.id} orgSlug={orgSlug} />
            <AutomationCanvas
              smsEnabled={awsAccounts.some((a) => a.smsEnabled)}
            />
            {settingsPanelOpen && !selectedNodeId ? (
              <AutomationSettingsPanel
                automation={automation}
                awsAccounts={awsAccounts}
                onClose={() => setSettingsPanelOpen(false)}
                organizationId={organizationId}
                orgDefaults={orgDefaults}
                orgSlug={orgSlug}
              />
            ) : (
              <AutomationPropertiesPanel
                orgSlug={orgSlug}
                segments={segments}
                topics={topics}
              />
            )}
          </div>
        </div>
      </AutomationDataProvider>
    </ReactFlowProvider>
  );
}
