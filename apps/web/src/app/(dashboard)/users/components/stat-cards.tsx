import {
  ArrowUpRight,
  Clock5,
  CreditCard,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const performanceMetrics = [
  {
    title: "Total Users",
    current: "$2.4M",
    previous: "$1.8M",
    growth: 33.3,
    icon: Users,
  },
  {
    title: "Paid Users",
    current: "12.5K",
    previous: "9.2K",
    growth: 35.9,
    icon: CreditCard,
  },
  {
    title: "Active Users",
    current: "8.9k",
    previous: "6.7k",
    growth: 32.8,
    icon: UserCheck,
  },
  {
    title: "Pending Users",
    current: "17%",
    previous: "24%",
    growth: -8.0,
    icon: Clock5,
  },
];

export function StatCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {performanceMetrics.map((metric, index) => (
        <Card className="border" key={index}>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <metric.icon className="size-6 text-muted-foreground" />
              <Badge
                className={cn(
                  metric.growth >= 0
                    ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400"
                )}
                variant="outline"
              >
                {metric.growth >= 0 ? (
                  <>
                    <TrendingUp className="me-1 size-3" />
                    {metric.growth >= 0 ? "+" : ""}
                    {metric.growth}%
                  </>
                ) : (
                  <>
                    <TrendingDown className="me-1 size-3" />
                    {metric.growth}%
                  </>
                )}
              </Badge>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-muted-foreground text-sm">
                {metric.title}
              </p>
              <div className="font-bold text-2xl">{metric.current}</div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span>from {metric.previous}</span>
                <ArrowUpRight className="size-3" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
