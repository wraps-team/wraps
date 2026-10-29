import { redirect } from "next/navigation";
import { hubHref, parseHubDays } from "@/lib/emails-hub";

type AnalyticsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    days?: string;
  }>;
};

// Kept for stored links: the analytics charts now live on the Deliverability
// tab of the `/emails` hub, and that tab reads the same `days` window.
export default async function AnalyticsPage({
  params,
  searchParams,
}: AnalyticsPageProps) {
  const { orgSlug } = await params;
  const { days } = await searchParams;
  redirect(
    hubHref(orgSlug, {
      tab: "deliverability",
      days: parseHubDays(days),
    })
  );
}
