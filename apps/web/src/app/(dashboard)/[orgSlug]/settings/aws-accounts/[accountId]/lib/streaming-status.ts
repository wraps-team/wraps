import { formatRelativeTime } from "@/lib/utils";

export type StreamingStatus = {
  variant: "secondary" | "destructive" | "success";
  label: string;
  detail: string | null;
};

/**
 * Whether SES events are reaching Wraps. Timestamps are ISO strings so the
 * same function serves server and client components.
 */
export function getStreamingStatus({
  connected,
  lastEventReceivedAt,
  staleSince,
}: {
  connected: boolean;
  lastEventReceivedAt: string | null;
  staleSince: string | null;
}): StreamingStatus {
  const lastEvent = lastEventReceivedAt
    ? `Last event ${formatRelativeTime(new Date(lastEventReceivedAt))}`
    : null;

  if (!connected) {
    return { variant: "secondary", label: "Off", detail: null };
  }
  if (staleSince) {
    return { variant: "destructive", label: "Stopped", detail: lastEvent };
  }
  if (lastEventReceivedAt) {
    return { variant: "success", label: "Receiving", detail: lastEvent };
  }
  return {
    variant: "secondary",
    label: "Waiting for first event",
    detail: null,
  };
}
