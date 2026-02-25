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

type WorkflowDataContextValue = {
  topics: Topic[];
  segments: Segment[];
};

const WorkflowDataContext = createContext<WorkflowDataContextValue>({
  topics: [],
  segments: [],
});

export function WorkflowDataProvider({
  topics,
  segments,
  children,
}: {
  topics: Topic[];
  segments: Segment[];
  children: React.ReactNode;
}) {
  return (
    <WorkflowDataContext.Provider value={{ topics, segments }}>
      {children}
    </WorkflowDataContext.Provider>
  );
}

export function useWorkflowData() {
  return useContext(WorkflowDataContext);
}
