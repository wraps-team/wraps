"use client";

import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const metrics = [
  {
    title: "Total Revenue",
    value: "$54,230",
    description: "Monthly revenue",
    change: "+12%",
    trend: "up",
    icon: DollarSign,
    footer: "Trending up this month",
    subfooter: "Revenue for the last 6 months",
  },
  {
    title: "Active Customers",
    value: "2,350",
    description: "Total active users",
    change: "+5.2%",
    trend: "up",
    icon: Users,
    footer: "Strong user retention",
    subfooter: "Engagement exceeds targets",
  },
  {
    title: "Total Orders",
    value: "1,247",
    description: "Orders this month",
    change: "-2.1%",
    trend: "down",
    icon: ShoppingCart,
    footer: "Down 2% this period",
    subfooter: "Order volume needs attention",
  },
  {
    title: "Conversion Rate",
    value: "3.24%",
    description: "Average conversion",
    change: "+8.3%",
    trend: "up",
    icon: BarChart3,
    footer: "Steady performance increase",
    subfooter: "Meets conversion projections",
  },
];

export function MetricsOverview() {
  return (
    <div className="grid @5xl:grid-cols-4 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 dark:*:data-[slot=card]:bg-card">
      {metrics.map((metric) => {
        const TrendIcon = metric.trend === "up" ? TrendingUp : TrendingDown;

        return (
          <Card className="cursor-pointer" key={metric.title}>
            <CardHeader>
              <CardDescription>{metric.title}</CardDescription>
              <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
                {metric.value}
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  <TrendIcon className="h-4 w-4" />
                  {metric.change}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {metric.footer} <TrendIcon className="size-4" />
              </div>
              <div className="text-muted-foreground">{metric.subfooter}</div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
