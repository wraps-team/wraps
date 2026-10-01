"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { scanAWSAccountFeatures } from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import type { ClientAccount } from "../lib/client-account";

type EmailServicesProps = {
  awsAccountId: string;
  organizationId: string;
  orgSlug: string;
  region: string;
  features: ClientAccount["features"];
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <dt className="text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Off() {
  return <span className="text-muted-foreground">Off</span>;
}

function None() {
  return <span className="text-muted-foreground">None</span>;
}

function OnOff({ value }: { value: boolean }) {
  return value ? <>On</> : <Off />;
}

/**
 * What the last scan observed about email in this region, and nothing else.
 * A row appears only when the scan wrote the field behind it.
 */
export function EmailServices({
  awsAccountId,
  organizationId,
  orgSlug,
  region,
  features,
}: EmailServicesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const email = features?.email;
  const scannedAt = features?.scannedAt;

  const handleScan = () => {
    startTransition(async () => {
      setScanResult(null);
      const result = await scanAWSAccountFeatures(awsAccountId, organizationId);

      if (result.success) {
        setScanResult({
          success: true,
          message: "Features scanned successfully",
        });
        router.refresh();
      } else {
        setScanResult({ success: false, message: result.error });
      }

      // Clear message after 5 seconds
      setTimeout(() => setScanResult(null), 5000);
    });
  };

  const scanButton = (label: string) => (
    <Button
      disabled={isPending}
      onClick={handleScan}
      size="sm"
      variant="outline"
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Scanning...
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );

  const trackedEvents = email?.trackedEvents ?? [];
  const dedicatedIpCount = email?.dedicatedIpCount ?? 0;
  const managedIpCount = email?.managedDedicatedIpCount ?? 0;
  const sendingPools = [
    ...new Set((email?.sendingPoolBySet ?? []).map((s) => s.poolName)),
  ];
  const identities = email?.identities;
  const domainCount = (identities ?? []).filter(
    (i) => i.type === "DOMAIN"
  ).length;
  const addressCount = (identities ?? []).length - domainCount;

  // OPTIONAL (SES's default when the field is omitted) wraps click links in
  // the original link's protocol, so an https:// link resolves against a
  // tracking domain with no matching certificate — the recipient gets a
  // certificate warning instead of the landing page. Absent policy means the
  // row predates the scan field, which is unknown, not broken, so say
  // nothing extra in that case.
  const trackingHttpWarning =
    email?.customTrackingDomain &&
    email.trackingHttpsPolicy &&
    email.trackingHttpsPolicy !== "REQUIRE"
      ? "HTTP only — https:// links may show recipients a certificate warning"
      : null;

  const dedicatedIpSummary = [
    dedicatedIpCount > 0
      ? `${dedicatedIpCount} IP${dedicatedIpCount > 1 ? "s" : ""}${
          managedIpCount > 0 ? ` (${managedIpCount} managed)` : ""
        }`
      : null,
    sendingPools.length > 0 ? `Pool: ${sendingPools.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email · {region}</CardTitle>
        <CardDescription>
          What the last scan found in your AWS account
        </CardDescription>
        <CardAction className="flex items-center gap-3">
          {scannedAt && (
            <span className="text-muted-foreground text-xs">
              Scanned {formatRelativeTime(new Date(scannedAt))}
            </span>
          )}
          {email && scanButton("Rescan")}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {scanResult && (
          <p
            className={
              scanResult.success
                ? "text-muted-foreground text-sm"
                : "text-destructive text-sm"
            }
          >
            {scanResult.message}
          </p>
        )}

        {email ? (
          <dl className="space-y-3 text-sm">
            <Row label="Configuration set">
              {email.configSetName ?? <None />}
            </Row>
            <Row label="Event tracking">
              {trackedEvents.length > 0 ? trackedEvents.join(", ") : <Off />}
            </Row>
            {email.eventHistoryEnabled !== undefined && (
              <Row label="Event history">
                <OnOff value={email.eventHistoryEnabled} />
              </Row>
            )}
            <Row label="Tracking domain">
              {email.customTrackingDomain ? (
                <>
                  {email.customTrackingDomain}
                  {trackingHttpWarning && ` — ${trackingHttpWarning}`}
                </>
              ) : (
                <None />
              )}
            </Row>
            <Row label="Dedicated IPs">{dedicatedIpSummary || <None />}</Row>
            {email.archivingEnabled !== undefined && (
              <Row label="Archiving">
                <OnOff value={email.archivingEnabled} />
              </Row>
            )}
            <Row label="Inbound">{email.inboundBucketName ?? <Off />}</Row>
            {email.sandbox !== undefined && (
              <Row label="SES account">
                {email.sandbox ? "Sandbox" : "Production"}
              </Row>
            )}
            {identities && (
              <Row label="Sending identities">
                {`${domainCount} ${domainCount === 1 ? "domain" : "domains"}, ${addressCount} ${addressCount === 1 ? "address" : "addresses"}`}
                {" · "}
                <Link className="underline" href={`/${orgSlug}/emails/domains`}>
                  Manage domains
                </Link>
              </Row>
            )}
          </dl>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">Not scanned yet</p>
            {scanButton("Scan now")}
          </div>
        )}

        <div className="rounded-md bg-muted p-3">
          <p className="text-muted-foreground text-xs">
            Use{" "}
            <code className="rounded bg-muted-foreground/20 px-1">
              wraps email init
            </code>{" "}
            or{" "}
            <code className="rounded bg-muted-foreground/20 px-1">
              wraps email upgrade
            </code>{" "}
            to deploy additional features.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
