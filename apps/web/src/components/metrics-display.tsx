"use client";

import type { MetricDataResult } from "@aws-sdk/client-cloudwatch";

interface MetricsDisplayProps {
  metrics: Record<string, MetricDataResult[]>;
}

export function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  // Calculate totals from the metric data
  const calculateTotal = (data: MetricDataResult[]): number => {
    if (!data || data.length === 0) return 0;
    const values = data[0]?.Values || [];
    return values.reduce((sum, val) => sum + (val || 0), 0);
  };

  const sends = calculateTotal(metrics.sends);
  const deliveries = calculateTotal(metrics.deliveries);
  const bounces = calculateTotal(metrics.bounces);
  const complaints = calculateTotal(metrics.complaints);

  const deliveryRate =
    sends > 0 ? ((deliveries / sends) * 100).toFixed(2) : "0";
  const bounceRate = sends > 0 ? ((bounces / sends) * 100).toFixed(2) : "0";
  const complaintRate =
    sends > 0 ? ((complaints / sends) * 100).toFixed(2) : "0";

  const metricCards = [
    {
      label: "Total Sent",
      value: sends.toLocaleString(),
      color: "blue",
    },
    {
      label: "Delivered",
      value: deliveries.toLocaleString(),
      subValue: `${deliveryRate}% delivery rate`,
      color: "green",
    },
    {
      label: "Bounces",
      value: bounces.toLocaleString(),
      subValue: `${bounceRate}% bounce rate`,
      color: "yellow",
    },
    {
      label: "Complaints",
      value: complaints.toLocaleString(),
      subValue: `${complaintRate}% complaint rate`,
      color: "red",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metricCards.map((card) => (
        <div
          className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
          key={card.label}
        >
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">{card.label}</p>
            <div
              className={`h-2 w-2 rounded-full ${
                card.color === "blue"
                  ? "bg-blue-500"
                  : card.color === "green"
                    ? "bg-green-500"
                    : card.color === "yellow"
                      ? "bg-yellow-500"
                      : "bg-red-500"
              }`}
            />
          </div>
          <div className="mt-2">
            <p className="font-bold text-2xl">{card.value}</p>
            {card.subValue && (
              <p className="mt-1 text-muted-foreground text-xs">
                {card.subValue}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
