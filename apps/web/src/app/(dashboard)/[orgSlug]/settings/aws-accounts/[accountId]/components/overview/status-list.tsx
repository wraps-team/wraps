import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { LEVEL_BADGE_VARIANT, type RoleStatus } from "../../lib/role-status";
import { getStreamingStatus } from "../../lib/streaming-status";

type StatusListProps = {
  orgSlug: string;
  accountId: string;
  region: string;
  roleStatus: RoleStatus;
  webhookConnected: boolean;
  lastEventReceivedAt: string | null;
  staleSince: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  /** ISO time of the last full scan, or null if never scanned. */
  scannedAt: string | null;
};

function Row({
  label,
  badge,
  detail,
  href,
  linkText,
}: {
  label: string;
  badge: React.ReactNode;
  detail: string | null;
  href: string;
  linkText: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <span className="w-48 shrink-0 font-medium text-sm">{label}</span>
      {badge}
      {detail && (
        <span className="min-w-0 text-muted-foreground text-sm">{detail}</span>
      )}
      <Link
        className="ml-auto text-sm underline underline-offset-4"
        href={href}
      >
        {linkText}
      </Link>
    </li>
  );
}

/**
 * Where this account stands, from persisted columns only. The role row leads:
 * it is account-scoped, and the rest is regional.
 */
export function StatusList({
  orgSlug,
  accountId,
  region,
  roleStatus,
  webhookConnected,
  lastEventReceivedAt,
  staleSince,
  emailEnabled,
  smsEnabled,
  scannedAt,
}: StatusListProps) {
  const base = `/${orgSlug}/settings/aws-accounts/${accountId}`;
  const streaming = getStreamingStatus({
    connected: webhookConnected,
    lastEventReceivedAt,
    staleSince,
  });
  const services = [emailEnabled ? "Email" : null, smsEnabled ? "SMS" : null]
    .filter(Boolean)
    .join(" + ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          <Row
            badge={
              <Badge variant={LEVEL_BADGE_VARIANT[roleStatus.level]}>
                {roleStatus.label}
              </Badge>
            }
            detail={roleStatus.detail || null}
            href={`${base}/connection`}
            label="Role access"
            linkText="Connection →"
          />
          <Row
            badge={<Badge variant={streaming.variant}>{streaming.label}</Badge>}
            detail={streaming.detail}
            href={`${base}/connection`}
            label={`Event streaming · ${region}`}
            linkText="Connection →"
          />
          <Row
            badge={
              <Badge variant="secondary">
                {services || "Nothing detected"}
              </Badge>
            }
            detail={
              scannedAt
                ? `scanned ${formatRelativeTime(new Date(scannedAt))}`
                : "not scanned yet"
            }
            href={`${base}/services`}
            label={`Infrastructure · ${region}`}
            linkText="Services →"
          />
        </ul>
      </CardContent>
    </Card>
  );
}
