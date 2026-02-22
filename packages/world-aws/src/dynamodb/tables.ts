export type TableNames = {
  runs: string;
  steps: string;
  events: string;
  hooks: string;
  waits: string;
  streams: string;
};

export const GSI = {
  runs: {
    workflowName: "gsi-workflow-name",
    status: "gsi-status",
  },
  steps: {
    run: "gsi-run",
  },
  events: {
    correlation: "gsi-correlation",
  },
  hooks: {
    run: "gsi-run",
    token: "gsi-token",
  },
  waits: {
    run: "gsi-run",
  },
  streams: {
    run: "gsi-run",
  },
} as const;

export function getTableNames(prefix: string): TableNames {
  return {
    runs: `${prefix}-runs`,
    steps: `${prefix}-steps`,
    events: `${prefix}-events`,
    hooks: `${prefix}-hooks`,
    waits: `${prefix}-waits`,
    streams: `${prefix}-streams`,
  };
}
