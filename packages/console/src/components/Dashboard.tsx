import { Activity, Mail, TrendingUp, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Dashboard() {
  // TODO: Replace with real data from SSE connection
  const stats = [
    {
      title: "Emails Sent (24h)",
      value: "1,234",
      change: "+12%",
      icon: Mail,
    },
    {
      title: "Delivery Rate",
      value: "99.2%",
      change: "+0.5%",
      icon: TrendingUp,
    },
    {
      title: "Active Domains",
      value: "3",
      change: "",
      icon: Users,
    },
    {
      title: "API Requests",
      value: "12.5k",
      change: "+8%",
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stat.value}</div>
              {stat.change && (
                <p className="text-muted-foreground text-xs">
                  {stat.change} from last month
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Email Metrics</CardTitle>
            <CardDescription>
              Performance over the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              Chart will go here (Recharts)
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest email events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div className="flex items-center" key={i}>
                  <div className="ml-4 space-y-1">
                    <p className="font-medium text-sm leading-none">
                      Email sent to user@example.com
                    </p>
                    <p className="text-muted-foreground text-sm">
                      2 minutes ago
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-green-600 text-xs">
                    Delivered
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain Status */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Verification Status</CardTitle>
          <CardDescription>
            DKIM, SPF, and DMARC configuration for your domains
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["example.com", "app.example.com", "mail.example.com"].map(
              (domain) => (
                <div className="flex items-center justify-between" key={domain}>
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{domain}</p>
                    <p className="text-muted-foreground text-xs">
                      DKIM: Verified • SPF: Verified • DMARC: Verified
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-muted-foreground text-xs">
                      Verified
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
