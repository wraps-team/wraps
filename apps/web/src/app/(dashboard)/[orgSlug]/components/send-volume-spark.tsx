"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { ArrowRightIcon, MailIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart } from "recharts";
import { useProductsStore } from "@/stores/products-store";
import { useVolumeData } from "../emails/analytics/hooks/use-analytics";
import { useSMSVolumeData } from "../sms/analytics/hooks/use-sms-analytics";

const chartConfig = {
  email: {
    label: "Email",
    theme: {
      light: "oklch(0.45 0.15 250)",
      dark: "oklch(0.65 0.15 250)",
    },
  },
  sms: {
    label: "SMS",
    theme: {
      light: "oklch(0.55 0.18 155)",
      dark: "oklch(0.65 0.18 155)",
    },
  },
} satisfies ChartConfig;

export function SendVolumeSpark({
  orgSlug,
  days = 30,
}: {
  orgSlug: string;
  days?: number;
}) {
  const productsStatus = useProductsStore((s) => s.status);
  const isEmailEnabled = productsStatus?.emailEnabled ?? false;
  const isSMSEnabled = productsStatus?.smsEnabled ?? false;

  const { data: emailVolume, isLoading: emailLoading } = useVolumeData(
    orgSlug,
    days
  );
  const { data: smsVolume, isLoading: smsLoading } = useSMSVolumeData(
    orgSlug,
    days
  );

  // Show a channel when it's flagged enabled OR when it has real send data.
  // The enabled flag is derived from infra discovery (e.g. a detected SES
  // config set) and can be false for accounts that still send, so gating on
  // the flag alone hides a channel that has actual volume.
  const hasEmailData = emailVolume?.some((d) => d.sent > 0) ?? false;
  const hasSMSData = smsVolume?.some((d) => d.sent > 0) ?? false;
  const showEmail = isEmailEnabled || hasEmailData;
  const showSMS = isSMSEnabled || hasSMSData;

  const isLoading = emailLoading || smsLoading;

  const chartData = mergeVolumeData(
    showEmail ? emailVolume : undefined,
    showSMS ? smsVolume : undefined
  );

  const emailTotal = chartData.reduce((sum, d) => sum + d.email, 0);
  const smsTotal = chartData.reduce((sum, d) => sum + d.sms, 0);
  const totalSent = emailTotal + smsTotal;

  const prevHalf = chartData.slice(0, Math.floor(chartData.length / 2));
  const currHalf = chartData.slice(Math.floor(chartData.length / 2));
  const prevTotal = prevHalf.reduce((sum, d) => sum + d.email + d.sms, 0);
  const currTotal = currHalf.reduce((sum, d) => sum + d.email + d.sms, 0);
  const trend =
    prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 100) : 0;

  const showBothChannels = showEmail && showSMS;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Send Volume</CardTitle>
          <div className="flex items-center gap-3">
            {showEmail && (
              <Link
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                href={`/${orgSlug}/emails/analytics`}
              >
                Email analytics
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            )}
            {showSMS && (
              <Link
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                href={`/${orgSlug}/sms/analytics`}
              >
                SMS analytics
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
        {!isLoading && (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight">
                {totalSent.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                last {days} days
              </span>
              {trend !== 0 && (
                <span
                  className={
                    trend > 0
                      ? "text-xs text-green-600 dark:text-green-400"
                      : "text-xs text-red-600 dark:text-red-400"
                  }
                >
                  {trend > 0 ? "+" : ""}
                  {trend}%
                </span>
              )}
            </div>
            {showBothChannels && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.45_0.15_250)] dark:bg-[oklch(0.65_0.15_250)]" />
                  <MailIcon className="h-3 w-3" />
                  {emailTotal.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[oklch(0.55_0.18_155)] dark:bg-[oklch(0.65_0.18_155)]" />
                  <MessageSquareIcon className="h-3 w-3" />
                  {smsTotal.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {isLoading ? (
          <Skeleton className="h-[80px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[80px] items-center justify-center text-muted-foreground text-xs">
            No send data yet
          </div>
        ) : (
          <ChartContainer
            className="aspect-auto h-[80px] w-full"
            config={chartConfig}
          >
            <AreaChart accessibilityLayer data={chartData}>
              <defs>
                <linearGradient id="emailFill" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-email)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-email)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="smsFill" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-sms)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-sms)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel={false}
                    indicator="line"
                    labelFormatter={(_value, payload) => {
                      const date = payload?.[0]?.payload?.date;
                      if (!date) return "";
                      return new Date(`${date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      );
                    }}
                  />
                }
              />
              {showEmail && (
                <Area
                  dataKey="email"
                  fill="url(#emailFill)"
                  stackId="volume"
                  stroke="var(--color-email)"
                  strokeWidth={1.5}
                  type="monotone"
                />
              )}
              {showSMS && (
                <Area
                  dataKey="sms"
                  fill="url(#smsFill)"
                  stackId="volume"
                  stroke="var(--color-sms)"
                  strokeWidth={1.5}
                  type="monotone"
                />
              )}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function mergeVolumeData(
  emailData?: { date: string; sent: number }[],
  smsData?: { date: string; sent: number }[]
): { date: string; email: number; sms: number }[] {
  const byDate = new Map<string, { email: number; sms: number }>();

  if (emailData) {
    for (const d of emailData) {
      const entry = byDate.get(d.date) ?? { email: 0, sms: 0 };
      entry.email += d.sent;
      byDate.set(d.date, entry);
    }
  }
  if (smsData) {
    for (const d of smsData) {
      const entry = byDate.get(d.date) ?? { email: 0, sms: 0 };
      entry.sms += d.sent;
      byDate.set(d.date, entry);
    }
  }

  return Array.from(byDate.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
