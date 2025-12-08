import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type QuotaDisplayProps = {
  quota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
};

export function QuotaDisplay({ quota }: QuotaDisplayProps) {
  const usagePercent = (quota.sentLast24Hours / quota.max24HourSend) * 100;
  const status =
    usagePercent > 90
      ? "destructive"
      : usagePercent > 70
        ? "warning"
        : "default";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          SES Quota
          <Badge
            variant={status === "destructive" ? "destructive" : "secondary"}
          >
            {usagePercent.toFixed(1)}% used
          </Badge>
        </CardTitle>
        <CardDescription>24-hour sending limits</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Emails sent</span>
            <span className="font-medium">
              {quota.sentLast24Hours.toLocaleString()} /{" "}
              {quota.max24HourSend.toLocaleString()}
            </span>
          </div>
          <Progress className="h-2" value={usagePercent} />
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-muted-foreground text-sm">Max send rate</span>
          <span className="font-medium text-sm">
            {quota.maxSendRate} emails/sec
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
