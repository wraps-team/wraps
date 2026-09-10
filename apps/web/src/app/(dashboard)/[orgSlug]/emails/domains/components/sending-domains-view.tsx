"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  GlobeIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  ListSendingDomainsResult,
  SendingDomain,
} from "@/actions/domains";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dnsRecordsFor } from "@/lib/dns-records";
import { AddDomainForm } from "./add-domain-form";
import { DomainDetailSheet } from "./domain-detail-sheet";

type SendingDomainsViewProps = {
  orgSlug: string;
  organizationId: string;
  result: ListSendingDomainsResult;
};

export function VerificationBadge({ domain }: { domain: SendingDomain }) {
  if (domain.verifiedForSending) {
    return (
      <Badge className="gap-1 border-green-600/30 bg-green-600/10 text-green-600 dark:text-green-400">
        <CheckCircle2Icon className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  if (domain.verificationStatus === "FAILED") {
    return (
      <Badge className="gap-1" variant="destructive">
        <XCircleIcon className="h-3 w-3" />
        Verification failed
      </Badge>
    );
  }
  if (domain.verificationStatus === "PENDING") {
    return (
      <Badge className="gap-1" variant="secondary">
        <ClockIcon className="h-3 w-3" />
        Pending verification
      </Badge>
    );
  }
  return (
    <Badge variant="outline">{domain.verificationStatus ?? "Unknown"}</Badge>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      aria-label={copied ? "Copied" : "Copy value"}
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={handleCopy}
      type="button"
    >
      {copied ? (
        <CheckCircle2Icon className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function DnsRecordsTable({ domain }: { domain: SendingDomain }) {
  const records = dnsRecordsFor(domain);

  if (records.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No outstanding DNS records for this identity.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Purpose</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={`${record.kind}-${record.name}-${record.value}`}>
            <TableCell className="font-mono text-xs">{record.type}</TableCell>
            <TableCell className="max-w-xs truncate font-mono text-xs">
              {record.name}
            </TableCell>
            <TableCell className="max-w-xs">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-xs">
                  {record.value}
                </span>
                <CopyButton value={record.value} />
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {record.purpose}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SendingDomainsView({
  orgSlug,
  organizationId,
  result,
}: SendingDomainsViewProps) {
  const [selectedDomain, setSelectedDomain] = useState<SendingDomain | null>(
    null
  );
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  if (!result.success) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
        <AlertTriangleIcon className="h-4 w-4 shrink-0" />
        {result.error}
      </div>
    );
  }

  const { domains, unreachableAccountIds } = result;

  return (
    <div className="space-y-4">
      <AddDomainForm organizationId={organizationId} />

      {unreachableAccountIds.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/10 p-3 text-amber-700 text-sm dark:text-amber-400">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {unreachableAccountIds.length === 1
              ? "1 AWS account"
              : `${unreachableAccountIds.length} AWS accounts`}{" "}
            could not be read, so its domains are not shown here. Check its
            connection under{" "}
            <Link
              className="underline underline-offset-4"
              href={`/${orgSlug}/settings/aws-accounts`}
            >
              AWS Accounts settings
            </Link>
            .
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon className="size-6" />
            </EmptyMedia>
            <EmptyTitle>No sending identities yet</EmptyTitle>
            <EmptyDescription>
              This AWS account has no SES sending identities yet. Add one with
              the CLI (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                wraps email domains add
              </code>
              ), then come back here to see its DNS records. The{" "}
              <Link
                className="underline underline-offset-4"
                href={`/${orgSlug}/setup`}
              >
                setup page
              </Link>{" "}
              has the full deploy-and-connect walkthrough.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead>MAIL FROM</TableHead>
                <TableHead>Config set</TableHead>
                <TableHead>DNS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => {
                const recordCount = dnsRecordsFor(domain).length;
                const openDetails = () => {
                  setSelectedDomain(domain);
                  setDetailSheetOpen(true);
                };
                return (
                  // audit-pattern (WCAG 2.1.1, Level A): copied from
                  // segments-table.tsx — this row opens a details sheet, and
                  // there is no URL for a sending domain to link to, so the
                  // row itself is the operable control. The
                  // e.target === e.currentTarget guard stops a keydown from
                  // bubbling out of a control nested in the row.
                  <TableRow
                    aria-label={`View details for ${domain.identity}`}
                    className="cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    key={domain.identity}
                    onClick={openDetails}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) {
                        return;
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetails();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <TableCell className="font-mono text-sm">
                      {domain.identity}
                    </TableCell>
                    <TableCell>{domain.identityType ?? "Unknown"}</TableCell>
                    <TableCell>
                      <VerificationBadge domain={domain} />
                    </TableCell>
                    <TableCell>
                      {domain.dkim?.status ?? "Not configured"}
                    </TableCell>
                    <TableCell>
                      {domain.mailFromDomain?.status ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {domain.configurationSet ?? "None"}
                    </TableCell>
                    <TableCell>
                      {recordCount > 0
                        ? `${recordCount} record${recordCount === 1 ? "" : "s"}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DomainDetailSheet
        domain={selectedDomain}
        onClose={() => setDetailSheetOpen(false)}
        open={detailSheetOpen}
        organizationId={organizationId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
