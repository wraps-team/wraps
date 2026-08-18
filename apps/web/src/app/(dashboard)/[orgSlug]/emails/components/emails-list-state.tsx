"use client";

import {
  CircleAlert,
  FilterX,
  Inbox,
  Loader2,
  Lock,
  RotateCw,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { EmailsListStateKind } from "../lib/analytics";
import {
  describeActiveFilters,
  nextWiderRange,
  rangeLabel,
} from "../lib/list-state";

const PRODUCTION_ACCESS_DOCS =
  "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html";

export type EmailsListStateProps = {
  days: number;
  isRetrying?: boolean;
  kind: Exclude<EmailsListStateKind, "ok">;
  onClearFilters?: () => void;
  onRetry?: () => void;
  onWidenRange?: (days: number) => void;
  orgSlug: string;
  /** `true` in the SES sandbox, `false` in production, `null` never scanned. */
  sandboxStatus: boolean | null;
  search?: string;
  status?: string;
};

function ErrorState({
  isRetrying,
  onRetry,
}: Pick<EmailsListStateProps, "isRetrying" | "onRetry">) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Couldn't load your messages</EmptyTitle>
        <EmptyDescription>
          The request for your message history failed. This is a problem
          reaching Wraps, not a change in your sending. Nothing has been lost.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button disabled={isRetrying} onClick={onRetry} size="sm">
          {isRetrying ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="mr-2 h-4 w-4" />
          )}
          {isRetrying ? "Retrying..." : "Retry"}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function FilteredState({
  days,
  onClearFilters,
  onWidenRange,
  search,
  status,
}: Pick<
  EmailsListStateProps,
  "days" | "onClearFilters" | "onWidenRange" | "search" | "status"
>) {
  const wider = nextWiderRange(days);
  const hasExplicitFilter = Boolean(search || status);

  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FilterX className="size-6" />
        </EmptyMedia>
        <EmptyTitle>
          {describeActiveFilters({ days, search, status })}
        </EmptyTitle>
        <EmptyDescription>
          Other messages may sit outside this window or this status.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {wider && onWidenRange ? (
            <Button onClick={() => onWidenRange(wider)} size="sm">
              Search {rangeLabel(wider)}
            </Button>
          ) : null}
          {hasExplicitFilter && onClearFilters ? (
            <Button onClick={onClearFilters} size="sm" variant="outline">
              Clear filters
            </Button>
          ) : null}
        </div>
      </EmptyContent>
    </Empty>
  );
}

function SandboxState({ orgSlug }: Pick<EmailsListStateProps, "orgSlug">) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Your AWS account is in the SES sandbox</EmptyTitle>
        <EmptyDescription>
          AWS starts every new account in the sandbox, where SES accepts mail
          only to addresses you have verified. Sends to anyone else are
          rejected, which is why there is nothing here yet. Requesting
          production access is the one step that changes it, and AWS usually
          answers within 24 hours.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm">
            <a
              href={PRODUCTION_ACCESS_DOCS}
              rel="noopener noreferrer"
              target="_blank"
            >
              Request production access
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${orgSlug}`}>Send a test to a verified address</Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

function NeverSentState({
  orgSlug,
  sandboxStatus,
}: Pick<EmailsListStateProps, "orgSlug" | "sandboxStatus">) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox className="size-6" />
        </EmptyMedia>
        <EmptyTitle>No messages yet</EmptyTitle>
        <EmptyDescription>
          Every email your application sends through Wraps lands here, with its
          delivery, open, click and bounce events attached. Send one and it
          shows up within seconds.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link href={`/${orgSlug}`}>Send your first email</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a
              href="https://wraps.dev/docs/quickstart/email"
              rel="noopener noreferrer"
              target="_blank"
            >
              View documentation
            </a>
          </Button>
        </div>
        {sandboxStatus === null ? (
          <p className="max-w-md text-muted-foreground text-xs">
            Wraps has not read this account's SES settings yet. If a send is
            rejected, the account is probably still in the SES sandbox - scan
            features on the AWS account to find out.
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}

/**
 * One component, four states (audit F1 + F6).
 *
 * Kept together deliberately: the defect being fixed is that a fetch failure,
 * a never-sent organization, a filtered-out window and a sandboxed account all
 * rendered the same sentence. Splitting these across files is how they drift
 * back into agreeing with each other.
 */
export function EmailsListState(props: EmailsListStateProps): ReactNode {
  switch (props.kind) {
    case "error":
      return (
        <ErrorState isRetrying={props.isRetrying} onRetry={props.onRetry} />
      );
    case "empty-filtered":
      return (
        <FilteredState
          days={props.days}
          onClearFilters={props.onClearFilters}
          onWidenRange={props.onWidenRange}
          search={props.search}
          status={props.status}
        />
      );
    case "empty-sandbox":
      return <SandboxState orgSlug={props.orgSlug} />;
    default:
      return (
        <NeverSentState
          orgSlug={props.orgSlug}
          sandboxStatus={props.sandboxStatus}
        />
      );
  }
}
