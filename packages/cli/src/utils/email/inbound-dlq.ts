/**
 * The inbound processor's dead-letter queue.
 *
 * Lambda writes a failed asynchronous invocation's event to the DLQ as the
 * message body, unchanged (AWS Lambda docs, "Adding a dead-letter queue":
 * "Lambda sends the event to the dead-letter queue as-is, with additional
 * information in attributes"). The body is therefore the SES Lambda-action
 * event or, for deployments on the legacy trigger, the S3 notification, and
 * can be handed straight back to the processor as its payload.
 */

import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { INBOUND_DLQ_NAME } from "./inbound-names.js";

export const INBOUND_REPROCESS_COMMAND = "wraps email inbound reprocess";

/** The parts of an SES-action or S3-notification record that are read here. */
type DlqEventRecord = {
  eventSource?: string;
  eventTime?: string;
  ses?: {
    mail?: { messageId?: string };
    receipt?: { timestamp?: string; recipients?: string[] };
  };
  s3?: { object?: { key?: string } };
};

/** What `reprocess` prints about one dead-lettered event. */
export type DlqEventSummary = {
  shape: "ses" | "s3" | "unknown";
  /** ISO time from the event, or null when the body names none. */
  time: string | null;
  /** The raw object key of each record (`mail/{messageId}` or the S3 key). */
  keys: string[];
  /** Recipients SES matched, summed over records. Null for S3-shaped events. */
  envelopeCount: number | null;
};

const UNKNOWN_EVENT: DlqEventSummary = {
  shape: "unknown",
  time: null,
  keys: [],
  envelopeCount: null,
};

function toIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * Read the key, time and envelope count out of a DLQ body. Never throws: a
 * body that isn't an event the processor knows comes back as `unknown`, and
 * the replay then lets Lambda reject or process it.
 */
export function summarizeDlqBody(body: string | undefined): DlqEventSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body ?? "");
  } catch {
    return UNKNOWN_EVENT;
  }
  const records = (parsed as { Records?: unknown } | null)?.Records;
  if (!Array.isArray(records) || records.length === 0) {
    return UNKNOWN_EVENT;
  }

  const keys: string[] = [];
  let time: string | null = null;
  let envelopeCount = 0;
  let sawSes = false;
  let sawS3 = false;

  for (const record of records as DlqEventRecord[]) {
    if (record?.eventSource === "aws:ses" && record.ses) {
      sawSes = true;
      const messageId = record.ses.mail?.messageId;
      if (typeof messageId === "string") {
        keys.push(`mail/${messageId}`);
      }
      const recipients = record.ses.receipt?.recipients;
      envelopeCount += Array.isArray(recipients) ? recipients.length : 0;
      time ??= toIso(record.ses.receipt?.timestamp);
    } else if (record?.s3?.object?.key) {
      sawS3 = true;
      const raw = String(record.s3.object.key).replace(/\+/g, " ");
      try {
        keys.push(decodeURIComponent(raw));
      } catch {
        keys.push(raw);
      }
      time ??= toIso(record.eventTime);
    }
  }

  if (sawSes) {
    return { shape: "ses", time, keys, envelopeCount };
  }
  if (sawS3) {
    return { shape: "s3", time, keys, envelopeCount: null };
  }
  return UNKNOWN_EVENT;
}

/** Resolve the DLQ URL. Throws the SDK's error (QueueDoesNotExist, AccessDenied). */
export async function getInboundDlqUrl(client: SQSClient): Promise<string> {
  const { QueueUrl } = await client.send(
    new GetQueueUrlCommand({ QueueName: INBOUND_DLQ_NAME })
  );
  if (!QueueUrl) {
    throw new Error(`No URL returned for queue ${INBOUND_DLQ_NAME}`);
  }
  return QueueUrl;
}

export type InboundDlqDepth =
  | { depth: number; error?: undefined }
  | { depth: null; error: "not-found" | "access-denied" | "unreadable" };

/**
 * Approximate number of messages waiting in the DLQ. When it can't be read
 * the result says why (missing queue, no permission, anything else) instead
 * of throwing: status must not fail on this.
 */
export async function getInboundDlqDepth(
  region: string
): Promise<InboundDlqDepth> {
  try {
    const client = new SQSClient({ region });
    const queueUrl = await getInboundDlqUrl(client);
    const { Attributes } = await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["ApproximateNumberOfMessages"],
      })
    );
    const depth = Number(Attributes?.ApproximateNumberOfMessages);
    return Number.isFinite(depth)
      ? { depth }
      : { depth: null, error: "unreadable" };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (
      name === "QueueDoesNotExist" ||
      name === "AWS.SimpleQueueService.NonExistentQueue"
    ) {
      return { depth: null, error: "not-found" };
    }
    if (name === "AccessDenied" || name === "AccessDeniedException") {
      return { depth: null, error: "access-denied" };
    }
    return { depth: null, error: "unreadable" };
  }
}
