import { CloudOff, Inbox, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import { maskAwsAccountId } from "../../lib/list-query";
import type { EmailTimelineState } from "../lookup";
import { RetryButton } from "./retry-button";

/**
 * The three non-`ok` timeline states (audit finding F11).
 *
 * All three used to render the same sentence - "No events recorded yet" - so an
 * unreadable history, an undeployed event pipeline and a message whose events
 * have aged out of the customer's retention window were indistinguishable. Each
 * one now says which of the three happened, names the AWS account it happened
 * in, and offers the action that fixes it.
 */
type TimelineStateProps = {
  state: EmailTimelineState;
};

type StateCopy = {
  actions?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: string;
};

function describeTimeline(state: EmailTimelineState): StateCopy {
  const account = state.accountId
    ? ` (${maskAwsAccountId(state.accountId)})`
    : "";

  switch (state.status) {
    case "unavailable":
      return {
        actions: (
          <div className="flex flex-wrap items-center gap-3">
            <RetryButton label="Retry" />
            <span className="text-muted-foreground text-sm">
              Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                wraps email doctor
              </code>
            </span>
          </div>
        ),
        description: `Wraps couldn't read the event history in your AWS account${account}. The message details above come from Wraps' own record and are accurate — only the delivery timeline is missing. This is usually a permissions or region issue.`,
        icon: <CloudOff className="size-5 text-muted-foreground" />,
        title: "Event timeline unavailable",
      };
    case "not_deployed":
      return {
        description: (
          <>
            Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              wraps email deploy
            </code>{" "}
            to start recording delivery events.
          </>
        ),
        icon: <PlugZap className="size-5 text-muted-foreground" />,
        title: "Event history isn't deployed for this account",
      };
    default:
      return {
        description:
          "Your AWS account has no stored events for this message. Event history lives in your account and follows the retention you configured — AWS removes older events, Wraps doesn't.",
        icon: <Inbox className="size-5 text-muted-foreground" />,
        title: "No events recorded",
      };
  }
}

export function TimelineState({ state }: TimelineStateProps) {
  const copy = describeTimeline(state);

  return (
    <div className="flex gap-3 rounded-md border border-dashed p-4">
      <div className="mt-0.5 shrink-0">{copy.icon}</div>
      <div className="space-y-2">
        <p className="font-medium text-sm">{copy.title}</p>
        <p className="max-w-2xl text-muted-foreground text-sm">
          {copy.description}
        </p>
        {copy.actions}
      </div>
    </div>
  );
}
