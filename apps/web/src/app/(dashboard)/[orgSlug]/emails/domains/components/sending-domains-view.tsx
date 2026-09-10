"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
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

type SendingDomainsViewProps = {
  orgSlug: string;
  organizationId: string;
  result: ListSendingDomainsResult;
};

function VerificationBadge({ domain }: { domain: SendingDomain }) {
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

function DnsRecordsTable({ domain }: { domain: SendingDomain }) {
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

function DomainCard({ domain }: { domain: SendingDomain }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-mono text-base">
            {domain.identity}
          </CardTitle>
          <VerificationBadge domain={domain} />
        </div>
        <CardDescription>
          {domain.identityType ?? "Unknown type"} · {domain.region}
          {domain.configurationSet ? ` · ${domain.configurationSet}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">DKIM:</span>
          <span>{domain.dkim?.status ?? "Not configured"}</span>
        </div>
        {domain.mailFromDomain && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">MAIL FROM:</span>
            <span className="font-mono">{domain.mailFromDomain.domain}</span>
            <span className="text-muted-foreground">
              ({domain.mailFromDomain.status ?? "Unknown"})
            </span>
          </div>
        )}
        <div>
          <h4 className="mb-2 font-semibold text-xs">DNS records to publish</h4>
          <DnsRecordsTable domain={domain} />
        </div>
      </CardContent>
    </Card>
  );
}

export function SendingDomainsView({
  orgSlug,
  organizationId,
  result,
}: SendingDomainsViewProps) {
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
        <div className="grid gap-4">
          {domains.map((domain) => (
            <DomainCard domain={domain} key={domain.identity} />
          ))}
        </div>
      )}
    </div>
  );
}
