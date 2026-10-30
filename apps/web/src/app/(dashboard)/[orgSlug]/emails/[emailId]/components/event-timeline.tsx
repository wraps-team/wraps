import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";

type EventTimelineProps = {
  children: React.ReactNode;
  eventCount: number;
};

/**
 * The lifecycle events are read from the customer's DynamoDB history table, so
 * the panel carries the `own` border.
 */
export function EventTimeline({ children, eventCount }: EventTimelineProps) {
  return (
    <Panel
      description="Lifecycle of this email from send to delivery"
      label={
        <PanelTitle className="flex items-center gap-2">
          Email Events
          <span className="font-normal text-muted-foreground">
            ({eventCount})
          </span>
        </PanelTitle>
      }
    >
      <div className="space-y-2">{children}</div>
    </Panel>
  );
}
