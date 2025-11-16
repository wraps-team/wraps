import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EventTimelineProps = {
  children: React.ReactNode;
  eventCount: number;
};

export function EventTimeline({ children, eventCount }: EventTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Email Events
          <span className="font-normal text-base text-muted-foreground">
            ({eventCount})
          </span>
        </CardTitle>
        <CardDescription>
          Lifecycle of this email from send to delivery
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}
