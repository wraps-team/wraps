// Reserved: owned by the timeline spec. Hidden until that spec sets enabled to true.
import type { DrilldownTab } from "./tab-contract";

export default {
  id: "timeline",
  label: "Timeline",
  enabled: false,
  Component: () => null,
} satisfies DrilldownTab;
