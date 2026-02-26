"use client";

import { createContext, useContext } from "react";

type Topic = {
  id: string;
  name: string;
};

type Segment = {
  id: string;
  name: string;
};

type AutomationDataContextValue = {
  topics: Topic[];
  segments: Segment[];
};

const AutomationDataContext = createContext<AutomationDataContextValue>({
  topics: [],
  segments: [],
});

export function AutomationDataProvider({
  topics,
  segments,
  children,
}: {
  topics: Topic[];
  segments: Segment[];
  children: React.ReactNode;
}) {
  return (
    <AutomationDataContext.Provider value={{ topics, segments }}>
      {children}
    </AutomationDataContext.Provider>
  );
}

export function useAutomationData() {
  return useContext(AutomationDataContext);
}

/** @deprecated Use `AutomationDataProvider` instead */
export const WorkflowDataProvider = AutomationDataProvider;
/** @deprecated Use `useAutomationData` instead */
export const useWorkflowData = useAutomationData;
