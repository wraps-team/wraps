import { redirect } from "next/navigation";
import {
  type DrilldownSearchParams,
  hubHref,
  mapDrilldownParams,
  parseHubDays,
} from "@/lib/emails-hub";

type DrilldownPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<DrilldownSearchParams>;
};

// Kept for stored links and notification emails.
export default async function DrilldownPage({
  params,
  searchParams,
}: DrilldownPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  redirect(
    hubHref(orgSlug, {
      tab: "deliverability",
      days: parseHubDays(sp.days),
      extra: mapDrilldownParams(sp),
    })
  );
}
