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
import Link from "next/link";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AddressDetail,
  getAddressDetail,
  type ProblemSend,
} from "@/actions/address-detail";
import { getContactTimeline } from "@/actions/contacts-analytics";
import { Button } from "@/components/ui/button";
import {
  EMAIL_STATUS_LABELS,
  type EmailStatus,
  isEmailStatusSendable,
} from "@/lib/contacts";
import { SuppressConfirmDialog } from "../deliverability/components/suppress-confirm-dialog";
import { formatFullTimestamp } from "../lib/timestamps";
import { RemoveSuppressionButton } from "../suppressions/components/remove-suppression-button";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const EMAIL_STATUS_BADGE_VARIANT: Record<EmailStatus, BadgeVariant> = {
  active: "success",
  unsubscribed: "secondary",
  bounced: "destructive",
  soft_bounced: "warning",
  complained: "destructive",
  suppressed: "warning",
};

const RETRY_COPY = "Could not load this address. Try again.";

type SuppressionInfo = {
  awsAccountId: string;
  reason: "BOUNCE" | "COMPLAINT";
  lastUpdated: string; // ISO
};

export type AddressDetailSheetProps = {
  orgSlug: string;
  organizationId: string;
  address: string; // as shown in the row or the tab
  // Present only when opened from the suppressions page, where the SES entry
  // is known. Absent from the drill-down, which does not check SES.
  suppression: null | SuppressionInfo;
  onClose: () => void;
  onRemoved?: () => void; // called after a successful unsuppress
  /** From a review list: how SES lists the address. Absent elsewhere. */
  listedState?: "listed" | "not_listed" | "unknown";
  /** The accounts the Suppress confirmation can use. Suppress needs them. */
  accounts?: { id: string; name: string; region: string }[];
  /** The account and reason a Suppress uses, taken from the review row. */
  suppressTarget?: {
    awsAccountId: string | null;
    reason: "BOUNCE" | "COMPLAINT";
  };
  /** Called after a successful suppress, before the sheet closes. */
  onSuppressed?: () => void;
};

type ReadySuccess = Extract<AddressDetail, { success: true }>;

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: ReadySuccess };

type TimelineState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      labels: { id: string; label: string; at: number }[];
      unshowableHistory: boolean;
    };

function formatWhen(iso: string): string {
  return formatFullTimestamp(new Date(iso).getTime());
}

function sourceLabel(send: ProblemSend): string {
  if (send.sourceType === "batch") {
    return send.sourceName ? `Broadcast: ${send.sourceName}` : "Broadcast";
  }
  if (send.sourceType === "workflow") {
    return send.sourceName ? `Automation: ${send.sourceName}` : "Automation";
  }
  if (send.sourceType === "campaign") {
    return "Campaign";
  }
  return "Transactional";
}

function accountLine(send: ProblemSend, suppressionAccountId: string): string {
  if (!send.awsAccountId) {
    return "AWS account not recorded.";
  }
  return send.awsAccountId === suppressionAccountId
    ? "Sent from this AWS account."
    : "Sent from another AWS account.";
}

function timelineLabel(event: {
  type: string;
  sourceType?: string | null;
  eventName?: string | null;
  channel?: string;
}): string {
  if (event.type === "message") {
    if (event.sourceType === "batch") {
      return "Broadcast";
    }
    if (event.sourceType === "workflow") {
      return `Automation ${event.channel === "sms" ? "SMS" : "email"}`;
    }
    return event.channel === "sms" ? "SMS" : "Email";
  }
  switch (event.type) {
    case "contact_created":
      return "Contact created";
    case "workflow_started":
      return "Automation started";
    case "workflow_completed":
      return "Automation completed";
    case "workflow_failed":
      return "Automation failed";
    case "custom_event":
      return event.eventName ? `Event: ${event.eventName}` : "Event";
    default:
      return "Event";
  }
}

function complaintDateFrom(sends: ProblemSend[]): string | null {
  const complained = sends.find((send) => send.complainedAt);
  return complained?.complainedAt ? formatWhen(complained.complainedAt) : null;
}

/**
 * Suppress for an address that SES does not list (or cannot be checked). The
 * brand button only opens the confirmation; nothing reaches SES until the user
 * confirms there.
 */
function SuppressAddressSection({
  address,
  detail,
  organizationId,
  listedState,
  accounts,
  suppressTarget,
  onSuppressed,
  onClose,
}: {
  address: string;
  detail: ReadySuccess;
  organizationId: string;
  listedState: "not_listed" | "unknown";
  accounts: { id: string; name: string; region: string }[];
  suppressTarget?: {
    awsAccountId: string | null;
    reason: "BOUNCE" | "COMPLAINT";
  };
  onSuppressed?: () => void;
  onClose: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const target = {
    address,
    reason:
      suppressTarget?.reason ??
      (detail.totals.complaints > 0 ? "COMPLAINT" : "BOUNCE"),
    awsAccountId:
      suppressTarget?.awsAccountId ??
      detail.problemSends.find((send) => send.awsAccountId)?.awsAccountId ??
      null,
  } as const;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        {listedState === "unknown"
          ? "Could not check the SES suppression list for this address."
          : "This address is not on the SES suppression list."}
      </p>
      <div>
        <Button onClick={() => setConfirmOpen(true)} variant="brand">
          Suppress address
        </Button>
      </div>
      <SuppressConfirmDialog
        accounts={accounts}
        onDone={(result) => {
          if (result.failed === 0 && result.added > 0) {
            setConfirmOpen(false);
            onSuppressed?.();
            onClose();
          }
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        organizationId={organizationId}
        targets={[target]}
      />
    </section>
  );
}

function SuppressionSection({
  detail,
  address,
  orgSlug,
  organizationId,
  suppression,
  onRemoved,
  listedState,
  accounts,
  suppressTarget,
  onSuppressed,
  onClose,
}: {
  detail: ReadySuccess;
  address: string;
  orgSlug: string;
  organizationId: string;
  suppression: SuppressionInfo | null;
  onRemoved?: () => void;
  listedState?: "listed" | "not_listed" | "unknown";
  accounts?: { id: string; name: string; region: string }[];
  suppressTarget?: {
    awsAccountId: string | null;
    reason: "BOUNCE" | "COMPLAINT";
  };
  onSuppressed?: () => void;
  onClose: () => void;
}) {
  if (!suppression && listedState === "listed") {
    return (
      <section className="flex flex-col gap-2">
        <p className="text-sm">
          On the SES suppression list. Open the Suppressed tab to remove it.
        </p>
      </section>
    );
  }

  if (
    !suppression &&
    accounts &&
    (listedState === "not_listed" || listedState === "unknown")
  ) {
    return (
      <SuppressAddressSection
        accounts={accounts}
        address={address}
        detail={detail}
        listedState={listedState}
        onClose={onClose}
        onSuppressed={onSuppressed}
        organizationId={organizationId}
        suppressTarget={suppressTarget}
      />
    );
  }

  if (!suppression) {
    return (
      <section className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Not checked against the AWS suppression list here.
        </p>
        <Link
          className="text-sm underline underline-offset-4"
          href={`/${orgSlug}/emails/suppressions`}
        >
          Open Suppression List
        </Link>
      </section>
    );
  }

  const accountName = detail.suppressionAccount?.name ?? "this AWS account";
  const isComplaint = suppression.reason === "COMPLAINT";
  const complaintDate = complaintDateFrom(detail.problemSends);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        On the AWS suppression list for {accountName}, since{" "}
        {formatWhen(suppression.lastUpdated)}.
      </p>
      <div>
        <Badge variant={isComplaint ? "destructive" : "warning"}>
          {isComplaint ? "Complaint" : "Bounce"}
        </Badge>
      </div>
      {isComplaint ? (
        <p className="text-sm">
          Reported as spam
          {complaintDate ? ` on ${complaintDate}` : ""}.
        </p>
      ) : null}
      <div>
        <RemoveSuppressionButton
          awsAccountId={suppression.awsAccountId}
          email={address}
          onRemoved={onRemoved}
          organizationId={organizationId}
          reason={suppression.reason}
        />
      </div>
    </section>
  );
}

function ProblemSendItem({
  send,
  orgSlug,
  suppressionAccountId,
}: {
  send: ProblemSend;
  orgSlug: string;
  suppressionAccountId: string | null;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">{send.subject || "(no subject)"}</span>
      <span className="text-muted-foreground">
        {sourceLabel(send)}
        {send.templateName ? ` · ${send.templateName}` : ""}
      </span>
      <span className="text-muted-foreground">
        Sent {formatWhen(send.sentAt)}
      </span>
      <span>
        <strong className="font-medium">{send.problem.headline}</strong>
        {send.problem.detail ? ` ${send.problem.detail}` : ""}
      </span>
      {send.suppressedAt ? (
        <span className="text-muted-foreground">
          Suppressed on {formatWhen(send.suppressedAt)}.
        </span>
      ) : null}
      {suppressionAccountId !== null ? (
        <span className="text-muted-foreground">
          {accountLine(send, suppressionAccountId)}
        </span>
      ) : null}
      <Link
        className="text-sm underline underline-offset-4"
        href={`/${orgSlug}/emails/${send.id}`}
      >
        View email
      </Link>
    </li>
  );
}

function SendsSection({
  detail,
  orgSlug,
  suppressionAccountId,
}: {
  detail: ReadySuccess;
  orgSlug: string;
  suppressionAccountId: string | null;
}) {
  const { totals, problemSends, problemSendsHasMore } = detail;
  const hasSends = totals.sends > 0;
  const hasProblems = problemSends.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Problem sends</h3>
      {hasSends && !hasProblems ? (
        <p className="text-sm">
          {totals.sends} sends in your stored history. None bounced, complained,
          or were suppressed.
        </p>
      ) : null}
      {hasSends && hasProblems ? (
        <p className="text-sm">
          {totals.sends} sends to this address in your stored history,{" "}
          {totals.bounces} bounced, {totals.complaints} complained,{" "}
          {totals.suppressed} not sent.
        </p>
      ) : null}
      {!hasSends && detail.contact ? (
        <p className="text-sm">
          This contact has no sends in your stored history.
        </p>
      ) : null}
      {hasSends || detail.contact ? null : (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <h4 className="font-medium text-sm">Not found in your sends</h4>
          <p className="text-muted-foreground text-sm">
            No email to this address is in your stored send history. Your plan
            keeps {detail.retentionDays} days of email history, and older sends
            are deleted.
          </p>
        </div>
      )}
      {hasProblems ? (
        <ul className="flex flex-col gap-2">
          {problemSends.map((send) => (
            <ProblemSendItem
              key={send.id}
              orgSlug={orgSlug}
              send={send}
              suppressionAccountId={suppressionAccountId}
            />
          ))}
        </ul>
      ) : null}
      {problemSendsHasMore ? (
        <p className="text-muted-foreground text-sm">
          Showing the 25 most recent. Older sends are on the{" "}
          <Link
            className="underline underline-offset-4"
            href={`/${orgSlug}/emails`}
          >
            Emails page
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

function TimelineList({ timeline }: { timeline: TimelineState }) {
  if (timeline.status === "loading" || timeline.status === "idle") {
    return <Skeleton className="h-10 w-full" />;
  }
  if (timeline.status === "error") {
    return (
      <p className="text-muted-foreground text-sm">
        Could not load this contact&apos;s activity.
      </p>
    );
  }
  return (
    <>
      {timeline.labels.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {timeline.labels.map((item) => (
            <li className="flex justify-between gap-2" key={item.id}>
              <span>{item.label}</span>
              <span className="text-muted-foreground">
                {formatFullTimestamp(item.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {timeline.unshowableHistory ? (
        <p className="text-muted-foreground text-sm">
          Some earlier activity for this contact is no longer stored.
        </p>
      ) : null}
    </>
  );
}

function ContactSection({
  detail,
  orgSlug,
  timeline,
}: {
  detail: ReadySuccess;
  orgSlug: string;
  timeline: TimelineState;
}) {
  const { contact } = detail;
  if (!contact) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">Contact</h3>
        <p className="text-muted-foreground text-sm">
          No contact has this address.
        </p>
      </section>
    );
  }

  const status = contact.emailStatus;
  const isSendable = isEmailStatusSendable(status);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Contact</h3>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{contact.name}</span>
        {status ? (
          <Badge variant={EMAIL_STATUS_BADGE_VARIANT[status]}>
            {EMAIL_STATUS_LABELS[status]}
          </Badge>
        ) : null}
      </div>
      {!isSendable && status ? (
        <p className="text-sm">
          Wraps still treats this contact as{" "}
          {EMAIL_STATUS_LABELS[status].toLowerCase()}, so broadcasts and
          automations skip it.
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Created {formatWhen(contact.createdAt)}
      </p>
      {contact.createdBy ? (
        <p className="text-sm">
          Created by {contact.createdBy.name || contact.createdBy.email}. For
          contacts created through the API, this is the user who created the API
          key.
        </p>
      ) : (
        <p className="text-sm">Created by: not recorded.</p>
      )}
      {contact.creationRecord ? (
        <p className="text-sm">
          Added one at a time in the dashboard on{" "}
          {formatWhen(contact.creationRecord.at)}, by{" "}
          {contact.creationRecord.actorEmail ?? "an unknown user"}.
        </p>
      ) : (
        <p className="text-sm">How this contact was added is not recorded.</p>
      )}
      <div className="flex flex-col gap-2">
        <h4 className="font-medium text-sm">Recent activity</h4>
        <TimelineList timeline={timeline} />
      </div>
      <Link
        className="text-sm underline underline-offset-4"
        href={`/${orgSlug}/contacts?contactId=${contact.id}`}
      >
        Open contact
      </Link>
    </section>
  );
}

function headerLine(state: DetailState): string {
  if (state.status !== "ready") {
    return "Loading this address";
  }
  const lastProblemAt = state.detail.lastProblemAt;
  return lastProblemAt
    ? `Last problem ${formatWhen(lastProblemAt)}`
    : "No problems in stored history";
}

/**
 * Everything known about one address. Opened from a suppression row (with the
 * SES entry) or from the drill-down (without it). The parent mounts this only
 * while an address is open, so the open state is client state, never a URL.
 */
export function AddressDetailSheet({
  orgSlug,
  organizationId,
  address,
  suppression,
  onClose,
  onRemoved,
  listedState,
  accounts,
  suppressTarget,
  onSuppressed,
}: AddressDetailSheetProps) {
  const [detailState, setDetailState] = useState<DetailState>({
    status: "loading",
  });
  const [timeline, setTimeline] = useState<TimelineState>({ status: "idle" });
  // Each load gets an id. A response for an earlier load, or for an address
  // that is no longer open, is dropped.
  const latestLoad = useRef(0);

  const suppressedAwsAccountId = suppression?.awsAccountId ?? null;

  const load = useCallback(() => {
    latestLoad.current += 1;
    const loadId = latestLoad.current;
    setDetailState({ status: "loading" });
    getAddressDetail(organizationId, {
      address,
      suppressedAwsAccountId,
    }).then((result) => {
      if (loadId !== latestLoad.current) {
        return;
      }
      setDetailState(
        result.success
          ? { status: "ready", detail: result }
          : { status: "error", message: result.error }
      );
    });
  }, [organizationId, address, suppressedAwsAccountId]);

  useEffect(() => {
    load();
    return () => {
      // Invalidate the in-flight load when the address changes or unmounts.
      latestLoad.current += 1;
    };
  }, [load]);

  const contactId =
    detailState.status === "ready" ? detailState.detail.contact?.id : undefined;

  useEffect(() => {
    if (!contactId) {
      setTimeline({ status: "idle" });
      return;
    }
    let active = true;
    setTimeline({ status: "loading" });
    getContactTimeline(contactId, organizationId, { limit: 5 }).then(
      (result) => {
        if (!active) {
          return;
        }
        if (!result.success) {
          setTimeline({ status: "error" });
          return;
        }
        setTimeline({
          status: "ready",
          labels: result.events.map((event) => ({
            id: event.id,
            label: timelineLabel(event),
            at: new Date(event.timestamp).getTime(),
          })),
          unshowableHistory: result.history.hasUnshowableHistory,
        });
      }
    );
    return () => {
      active = false;
    };
  }, [contactId, organizationId]);

  const isLoading = detailState.status === "loading";

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="break-all font-mono text-base">
            {address}
          </SheetTitle>
          <SheetDescription>{headerLine(detailState)}</SheetDescription>
        </SheetHeader>

        <div aria-busy={isLoading} className="flex flex-col gap-6 px-4 pb-6">
          {detailState.status === "loading" ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {detailState.status === "error" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{detailState.message || RETRY_COPY}</p>
              <div>
                <Button onClick={load} size="sm" variant="outline">
                  Try again
                </Button>
              </div>
            </div>
          ) : null}

          {detailState.status === "ready" ? (
            <>
              <SuppressionSection
                accounts={accounts}
                address={address}
                detail={detailState.detail}
                listedState={listedState}
                onClose={onClose}
                onRemoved={onRemoved}
                onSuppressed={onSuppressed}
                organizationId={organizationId}
                orgSlug={orgSlug}
                suppression={suppression}
                suppressTarget={suppressTarget}
              />
              <SendsSection
                detail={detailState.detail}
                orgSlug={orgSlug}
                suppressionAccountId={suppressedAwsAccountId}
              />
              <ContactSection
                detail={detailState.detail}
                orgSlug={orgSlug}
                timeline={timeline}
              />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
