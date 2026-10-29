import { redirect } from "next/navigation";
import { hubHref } from "@/lib/emails-hub";

type SuppressionsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

// Kept for stored links and notification emails: the Suppressed list now
// lives under the Deliverability tab of the `/emails` hub.
export default async function SuppressionsPage({
  params,
}: SuppressionsPageProps) {
  const { orgSlug } = await params;
  redirect(
    hubHref(orgSlug, {
      tab: "deliverability",
      extra: { list: "suppressed" },
    })
  );
}
