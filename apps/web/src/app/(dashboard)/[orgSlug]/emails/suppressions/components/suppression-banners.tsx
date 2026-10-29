import { Ban, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import Link from "next/link";
import { CliCommand } from "@/components/cli-command";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * The console role needs its permissions rewritten to grant SES suppression
 * read/delete. Every account connected before this shipped hits this state —
 * see plan 296's "consent cost" section. Wording mirrors the shipped
 * IAMConfiguration card
 * (settings/aws-accounts/[accountId]/components/iam-configuration.tsx)
 * rather than inventing new copy; the CLI is presented first because, unlike
 * that settings card, most connected accounts have no CloudFormation stack
 * to update at all.
 */
export function DeniedState({
  orgSlug,
  iamRoleHref,
}: {
  orgSlug: string;
  iamRoleHref: string;
}) {
  return (
    <Empty className="max-w-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Wraps needs updated permissions</EmptyTitle>
        <EmptyDescription>
          Browsing and removing suppressions needs SES suppression-list access
          that this AWS account&apos;s console role does not grant yet. Rewrite
          its permissions with one of the two routes below.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex w-full flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
              <Terminal className="size-4" />
              If you connected with the CLI
            </h4>
            <CliCommand command="wraps platform update-role" />
            <p className="mt-2 text-muted-foreground text-xs">
              Run this on the machine that deployed your Wraps infrastructure,
              in the same AWS account and region — it exits with &quot;No Wraps
              deployment found&quot; otherwise.
            </p>
          </div>

          <div className="text-center text-muted-foreground text-sm">or</div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
              <RefreshCw className="size-4" />
              If you deployed the role with CloudFormation
            </h4>
            <p className="text-muted-foreground text-xs">
              Open the <code className="font-mono">wraps-console-access</code>{" "}
              stack, choose <strong>Update</strong> →{" "}
              <strong>Replace existing template</strong>, and keep the External
              ID as-is. Details, including the template URL, are on the
              account&apos;s{" "}
              <Link className="underline underline-offset-4" href={iamRoleHref}>
                Role access
              </Link>{" "}
              card.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/${orgSlug}/settings/aws-accounts`}>
              View AWS Accounts settings
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export function DeniedAccountsBanner({
  orgSlug,
  count,
}: {
  orgSlug: string;
  count: number;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {count === 1 ? "1 AWS account" : `${count} AWS accounts`} need their
        console role permissions refreshed, so their suppressions are not shown
        here. Run <code className="font-mono">wraps platform update-role</code>{" "}
        for that account, or see{" "}
        <Link
          className="underline underline-offset-4"
          href={`/${orgSlug}/settings/aws-accounts`}
        >
          AWS Accounts settings
        </Link>
        .
      </div>
    </div>
  );
}

export function UnreachableAccountsBanner({
  orgSlug,
  count,
}: {
  orgSlug: string;
  count: number;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {count === 1 ? "1 AWS account" : `${count} AWS accounts`} could not be
        read, so its suppressions are not shown here. Check its connection under{" "}
        <Link
          className="underline underline-offset-4"
          href={`/${orgSlug}/settings/aws-accounts`}
        >
          AWS Accounts settings
        </Link>
        .
      </div>
    </div>
  );
}

export function NothingSuppressedState() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Ban className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Nothing suppressed</EmptyTitle>
        <EmptyDescription>
          Good news — SES has not suppressed any addresses for this account.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
