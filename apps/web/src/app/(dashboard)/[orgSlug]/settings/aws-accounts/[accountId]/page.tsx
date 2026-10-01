import { loadAccountPage } from "./lib/load-account";

type AWSAccountPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
  searchParams: Promise<{
    region?: string | string[];
  }>;
};

export default async function AWSAccountPage({
  params,
  searchParams,
}: AWSAccountPageProps) {
  const { orgSlug, accountId } = await params;
  const { region } = await searchParams;

  // An array is "present but not equal" and redirects like any other mismatch.
  await loadAccountPage({
    orgSlug,
    accountId,
    tab: "",
    region,
    require: "view",
  });

  // Phase 7 puts the health summary here; everything else has moved to a tab.
  return (
    <p className="text-muted-foreground text-sm">
      Use the tabs above to see this account's services, connection and
      settings.
    </p>
  );
}
