import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  ArrowUpRight,
  Clock5,
  CreditCard,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
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

/**
 * The four metrics as one panel with a ruled grid. The rules name each cell's
 * place at every breakpoint: one column on mobile, two at `sm`, four at `lg`.
 */
const CELL_RULES = [
  "",
  "border-t pl-0 sm:border-t-0 sm:border-l sm:pl-4",
  "border-t pl-0 lg:border-t-0 lg:border-l lg:pl-4",
  "border-t pl-0 sm:border-l sm:pl-4 lg:border-t-0",
];

export function StatCards() {
  return (
    <Panel label={<PanelTitle>Performance</PanelTitle>}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {performanceMetrics.map((metric, index) => (
          <div className={cn("py-3", CELL_RULES[index])} key={metric.title}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <metric.icon className="size-6 text-muted-foreground" />
                <Badge variant={metric.growth >= 0 ? "success" : "destructive"}>
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
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
