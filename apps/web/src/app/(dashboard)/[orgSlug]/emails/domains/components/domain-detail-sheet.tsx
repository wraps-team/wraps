"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wraps/ui/components/ui/sheet";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SendingDomain } from "@/actions/domains";
import {
  type ConfigurationSetDetail,
  getConfigurationSetDetail,
} from "@/actions/domains";
import { DnsRecordsTable, VerificationBadge } from "./sending-domains-view";

type DomainDetailSheetProps = {
  domain: SendingDomain | null;
  onClose: () => void;
  open: boolean;
  orgSlug: string;
  organizationId: string;
};

type ConfigSetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; detail: ConfigurationSetDetail }
  | { status: "error"; error: string; unreachable: boolean };

function ConfigurationSetPanel({
  domain,
  organizationId,
  orgSlug,
}: {
  domain: SendingDomain;
  organizationId: string;
  orgSlug: string;
}) {
  const [state, setState] = useState<ConfigSetState>({ status: "idle" });
  const configurationSet = domain.configurationSet;

  useEffect(() => {
    if (!configurationSet) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    getConfigurationSetDetail(
      organizationId,
      domain.awsAccountId,
      configurationSet
    ).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.success) {
        setState({ status: "loaded", detail: result.detail });
      } else {
        setState({
          status: "error",
          error: result.error,
          unreachable: "unreachable" in result ? result.unreachable : false,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [configurationSet, organizationId, domain.awsAccountId]);

  if (!configurationSet) {
    return (
      <p className="text-muted-foreground text-sm">
        This identity has no configuration set attached, so opens, clicks, and
        delivery events are not tracked for it.
      </p>
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {state.error}
          {state.unreachable && (
            <>
              {" "}
              Check its connection under{" "}
              <Link
                className="underline underline-offset-4"
                href={`/${orgSlug}/settings/aws-accounts`}
              >
                AWS Accounts settings
              </Link>
              .
            </>
          )}
        </div>
      </div>
    );
  }

  const { detail } = state;

  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-3">
        <div>
          <dt className="text-muted-foreground text-xs">
            Click/open tracking domain
          </dt>
          <dd className="font-mono">
            {detail.trackingRedirectDomain ?? "Not configured"}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">HTTPS policy</dt>
          <dd>{detail.trackingHttpsPolicy ?? "Unknown"}</dd>
          {detail.trackingHttpsPolicy === "OPTIONAL" && (
            <div className="mt-1 flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 p-3 text-amber-700 text-xs dark:text-amber-400">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                SES wraps click links in the original link&apos;s protocol, so
                an https:// link resolves against this tracking domain with no
                matching certificate. Links can break in production until this
                is set to REQUIRE or REQUIRE_OPEN_ONLY.
              </span>
            </div>
          )}
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">TLS policy</dt>
          <dd>{detail.tlsPolicy ?? "Unknown"}</dd>
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">Sending enabled</dt>
          <dd>
            {detail.sendingEnabled === null
              ? "Unknown"
              : detail.sendingEnabled
                ? "Yes"
                : "No"}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">
            Reputation metrics enabled
          </dt>
          <dd>
            {detail.reputationMetricsEnabled === null
              ? "Unknown"
              : detail.reputationMetricsEnabled
                ? "Yes"
                : "No"}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">Suppressed reasons</dt>
          <dd>
            {detail.suppressedReasons.length > 0
              ? detail.suppressedReasons.join(", ")
              : "None"}
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="mb-2 font-semibold text-xs">Event destinations</h4>
        {detail.eventDestinations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No event destinations configured — this is why delivery events for
            this identity would not appear in the dashboard.
          </p>
        ) : (
          <div className="space-y-3">
            {detail.eventDestinations.map((destination) => (
              <div className="rounded-lg border p-3" key={destination.name}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{destination.name}</span>
                  <Badge
                    variant={destination.enabled ? "secondary" : "outline"}
                  >
                    {destination.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {destination.destinationType}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {destination.matchingEventTypes.map((eventType) => (
                    <Badge
                      className="font-mono text-xs"
                      key={eventType}
                      variant="outline"
                    >
                      {eventType}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DomainDetailSheet({
  domain,
  onClose,
  open,
  orgSlug,
  organizationId,
}: DomainDetailSheetProps) {
  if (!domain) {
    return null;
  }

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            {domain.identity}
          </SheetTitle>
          <SheetDescription>
            Sending identity details, DNS records, and configuration set
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-6 px-4 pb-4 overflow-y-auto">
          <div>
            <h4 className="mb-2 font-semibold text-xs">Identity</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Status:</dt>
                <dd>
                  <VerificationBadge domain={domain} />
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Type:</dt>
                <dd>{domain.identityType ?? "Unknown"}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Region:</dt>
                <dd>{domain.region}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">DKIM:</dt>
                <dd>{domain.dkim?.status ?? "Not configured"}</dd>
              </div>
              {domain.mailFromDomain && (
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-muted-foreground">MAIL FROM:</dt>
                  <dd className="font-mono">{domain.mailFromDomain.domain}</dd>
                  <dd className="text-muted-foreground">
                    ({domain.mailFromDomain.status ?? "Unknown"})
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-xs">
              DNS records to publish
            </h4>
            <DnsRecordsTable domain={domain} />
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-xs">Configuration set</h4>
            <ConfigurationSetPanel
              domain={domain}
              key={domain.identity}
              organizationId={organizationId}
              orgSlug={orgSlug}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
