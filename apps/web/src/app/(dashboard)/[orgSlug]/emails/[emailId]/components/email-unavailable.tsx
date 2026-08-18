import { CircleAlert, Clock, CloudOff, KeyRound, ShieldX } from "lucide-react";
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
import type { EmailLookupErrorKind, EmailLookupFailure } from "../lookup";
import { RetryButton } from "./retry-button";

type EmailUnavailableProps = {
  emailId: string;
  failure: Exclude<EmailLookupFailure, { reason: "not-found" }>;
  orgSlug: string;
};

type FailureCopy = {
  action?: { href: string; label: string };
  canRetry: boolean;
  description: ReactNode;
  icon: ReactNode;
  title: string;
};

function describeLookupError(
  kind: EmailLookupErrorKind,
  orgSlug: string
): FailureCopy {
  switch (kind) {
    case "credentials":
      return {
        action: {
          href: `/${orgSlug}/settings/aws-accounts`,
          label: "Check AWS account",
        },
        canRetry: true,
        description:
          "Wraps could not get temporary credentials for the role in your AWS account, so the message history is unreadable right now. Your message itself is unaffected — only this view is.",
        icon: <KeyRound className="size-6" />,
        title: "Couldn't authenticate with your AWS account",
      };
    case "permission":
      return {
        action: {
          href: `/${orgSlug}/settings/aws-accounts`,
          label: "Check AWS account",
        },
        canRetry: true,
        description:
          "AWS denied the request for this message's history. The connected role no longer has read access to the wraps-email-history table in your account.",
        icon: <ShieldX className="size-6" />,
        title: "AWS denied access to your message history",
      };
    case "history-unavailable":
      return {
        canRetry: true,
        description:
          "The wraps-email-history table wasn't found in the connected AWS account or region, so per-message events can't be read.",
        icon: <CloudOff className="size-6" />,
        title: "Message history isn't available in this AWS account",
      };
    default:
      return {
        canRetry: true,
        description:
          "Looking up this message failed. The error has been logged — retrying often works.",
        icon: <CircleAlert className="size-6" />,
        title: "We couldn't load this message",
      };
  }
}

function describeFailure(
  failure: EmailUnavailableProps["failure"],
  orgSlug: string
): FailureCopy {
  switch (failure.reason) {
    case "no-aws-account":
      return {
        action: {
          href: `/${orgSlug}/emails/setup`,
          label: "Connect an AWS account",
        },
        canRetry: false,
        description:
          "Message history lives in the AWS account Wraps deploys into, and this organization doesn't have one connected yet.",
        icon: <CloudOff className="size-6" />,
        title: "No AWS account connected",
      };
    case "not-sent":
      return {
        canRetry: true,
        description: (
          <>
            Wraps has a record of this message — “{failure.subject}” to{" "}
            {failure.recipient} — but no send timestamp, so there are no
            delivery events yet. Current status: {failure.status}.
          </>
        ),
        icon: <Clock className="size-6" />,
        title: "This message hasn't been sent yet",
      };
    default:
      return describeLookupError(failure.kind, orgSlug);
  }
}

export function EmailUnavailable({
  emailId,
  failure,
  orgSlug,
}: EmailUnavailableProps) {
  const copy = describeFailure(failure, orgSlug);

  return (
    <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
      <Empty className="max-w-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{copy.icon}</EmptyMedia>
          <EmptyTitle>{copy.title}</EmptyTitle>
          <EmptyDescription>{copy.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
            {emailId}
          </code>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {copy.canRetry ? <RetryButton /> : null}
            {copy.action ? (
              <Button asChild size="sm" variant="outline">
                <Link href={copy.action.href}>{copy.action.label}</Link>
              </Button>
            ) : null}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
