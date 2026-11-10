import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { EmailInboundReprocessOptions } from "../../types/index.js";
import {
  type DlqEventSummary,
  getInboundDlqUrl,
  INBOUND_REPROCESS_COMMAND,
  summarizeDlqBody,
} from "../../utils/email/inbound-dlq.js";
import {
  INBOUND_DLQ_NAME,
  INBOUND_PROCESSOR_FUNCTION_NAME,
} from "../../utils/email/inbound-names.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors, WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { ensureInteractive } from "../../utils/shared/prompts.js";

const DEFAULT_MAX = 100;
const BATCH_SIZE = 10;
/** Long polling, so a standard queue's partial sampling can't read as empty. */
const WAIT_SECONDS = 5;
/** Dry runs stop after this many receives in a row that show nothing new. */
const DRY_RUN_IDLE_RECEIVES = 2;
/** Holds a replayed message while its invoke and delete run. */
const REPLAY_VISIBILITY_SECONDS = 120;

type MessageReport = {
  messageId: string;
  /** When SQS accepted the message into the DLQ (ISO), or null. */
  sentTime: string | null;
  time: string | null;
  keys: string[];
  envelopeCount: number | null;
  shape: DlqEventSummary["shape"];
};

type ReplayReport = MessageReport & {
  /**
   * replayed: the processor accepted it and the message was deleted.
   * replayed-not-deleted: the processor accepted it but the delete failed, so
   * the message is still queued and a later run would replay it again.
   * failed: the hand-off was not accepted; the message stays queued.
   */
  outcome: "replayed" | "replayed-not-deleted" | "failed";
  /** Why the message is still queued. Absent when it was deleted. */
  error?: string;
};

/** An error that would repeat for every message; the run stops on it. */
class RunStopped extends Error {
  readonly cause: WrapsError;
  /** The message Lambda had already accepted when the run stopped, if any. */
  readonly handedOff?: ReplayReport;
  constructor(cause: WrapsError, handedOff?: ReplayReport) {
    super(cause.message);
    this.cause = cause;
    this.handedOff = handedOff;
  }
}

function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name ?? "";
}

function isAccessDenied(error: unknown): boolean {
  const name = errorName(error);
  return name === "AccessDeniedException" || name === "AccessDenied";
}

function missingProcessor(region: string): WrapsError {
  return new WrapsError(
    `The inbound processor ${INBOUND_PROCESSOR_FUNCTION_NAME} was not found in ${region}`,
    "INBOUND_NOT_DEPLOYED",
    `Run wraps email inbound init in ${region}, or pass --region for the region where inbound is deployed.`
  );
}

function lambdaDenied(): WrapsError {
  return new WrapsError(
    `Not allowed to invoke ${INBOUND_PROCESSOR_FUNCTION_NAME} (lambda:InvokeFunction)`,
    "LAMBDA_PERMISSION_DENIED",
    "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: wraps permissions --service email --json",
    "https://wraps.dev/docs/guides/aws-setup/permissions"
  );
}

function sqsDeleteDenied(): WrapsError {
  return new WrapsError(
    `Not allowed to delete messages from the dead-letter queue ${INBOUND_DLQ_NAME} (sqs:DeleteMessage)`,
    "SQS_PERMISSION_DENIED",
    "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: wraps permissions --service email --json",
    "https://wraps.dev/docs/guides/aws-setup/permissions"
  );
}

function sqsDenied(): WrapsError {
  return new WrapsError(
    `Not allowed to read the dead-letter queue ${INBOUND_DLQ_NAME} (sqs:GetQueueUrl, ReceiveMessage, DeleteMessage)`,
    "SQS_PERMISSION_DENIED",
    "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: wraps permissions --service email --json",
    "https://wraps.dev/docs/guides/aws-setup/permissions"
  );
}

function parseMax(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_MAX;
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw errors.invalidFlagUsage(
      `--max must be a whole number of at least 1 (got "${raw}")`,
      "Pass the most messages to handle in one run, for example: wraps email inbound reprocess --max 25"
    );
  }
  return Number(raw);
}

function report(message: Message): MessageReport {
  const summary = summarizeDlqBody(message.Body);
  const sent = Number(message.Attributes?.SentTimestamp);
  return {
    messageId: message.MessageId ?? "",
    sentTime:
      Number.isFinite(sent) && sent > 0 ? new Date(sent).toISOString() : null,
    time: summary.time,
    keys: summary.keys,
    envelopeCount: summary.envelopeCount,
    shape: summary.shape,
  };
}

function describeLine(r: MessageReport): string {
  const key = r.keys.length > 0 ? r.keys.join(", ") : "(no object key)";
  const envelope =
    r.envelopeCount === null
      ? "envelope n/a"
      : `${r.envelopeCount} envelope recipient${r.envelopeCount === 1 ? "" : "s"}`;
  return `${r.time ?? "unknown time"}  ${key}  ${envelope}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQueueMissing(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? "";
  return (
    name === "QueueDoesNotExist" ||
    name === "AWS.SimpleQueueService.NonExistentQueue"
  );
}

async function receive(
  sqs: SQSClient,
  queueUrl: string,
  maxMessages: number,
  visibilityTimeout: number
): Promise<Message[]> {
  try {
    const response = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: Math.min(BATCH_SIZE, maxMessages),
        MessageSystemAttributeNames: ["SentTimestamp"],
        VisibilityTimeout: visibilityTimeout,
        WaitTimeSeconds: WAIT_SECONDS,
      })
    );
    return response?.Messages ?? [];
  } catch (error) {
    throw isAccessDenied(error) ? sqsDenied() : error;
  }
}

/**
 * Peek at the DLQ without changing it. Receiving with a zero visibility
 * timeout leaves every message visible, and a standard queue returns a
 * sample, so the same message can come back and others can be missed. It
 * stops when the queue stops showing anything new: two receives in a row
 * with no unseen MessageId, or `max` messages seen.
 */
async function peek(
  sqs: SQSClient,
  queueUrl: string,
  max: number
): Promise<MessageReport[]> {
  const seen = new Set<string>();
  const reports: MessageReport[] = [];
  let idle = 0;
  while (reports.length < max && idle < DRY_RUN_IDLE_RECEIVES) {
    const batch = await receive(sqs, queueUrl, max - reports.length, 0);
    let fresh = 0;
    for (const message of batch) {
      const id = message.MessageId ?? "";
      if (seen.has(id) || reports.length >= max) {
        continue;
      }
      seen.add(id);
      reports.push(report(message));
      fresh++;
    }
    idle = fresh === 0 ? idle + 1 : 0;
  }
  return reports;
}

/**
 * Hand one message back to the processor and delete it only when Lambda
 * accepted the invoke (202).
 */
async function replayOne(
  sqs: SQSClient,
  lambda: LambdaClient,
  queueUrl: string,
  message: Message,
  region: string
): Promise<ReplayReport> {
  const base = report(message);
  if (!(message.Body && message.ReceiptHandle)) {
    return {
      ...base,
      outcome: "failed",
      error: "the message has no body or receipt handle",
    };
  }

  try {
    const invoked = await lambda.send(
      new InvokeCommand({
        FunctionName: INBOUND_PROCESSOR_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: new TextEncoder().encode(message.Body),
      })
    );
    if (invoked?.StatusCode !== 202) {
      return {
        ...base,
        outcome: "failed",
        error: `Lambda returned status ${invoked?.StatusCode ?? "none"}, not 202`,
      };
    }
  } catch (error) {
    // These repeat for every message, so stop instead of failing each one.
    if (errorName(error) === "ResourceNotFoundException") {
      throw new RunStopped(missingProcessor(region));
    }
    if (isAccessDenied(error)) {
      throw new RunStopped(lambdaDenied());
    }
    return { ...base, outcome: "failed", error: errorText(error) };
  }

  // Lambda has the event. A delete error from here on must not read as a
  // failed hand-off: replaying again would deliver the email twice.
  try {
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
  } catch (error) {
    const kept: ReplayReport = {
      ...base,
      outcome: "replayed-not-deleted",
      error: errorText(error),
    };
    // Every delete would fail the same way and each message would be handed
    // off and left queued, so stop at the first denial.
    if (isAccessDenied(error)) {
      throw new RunStopped(sqsDeleteDenied(), kept);
    }
    return kept;
  }
  return { ...base, outcome: "replayed" };
}

/**
 * The error a stopped run throws. It says what was already handed off, and
 * in --json carries the ids so the caller can tell which messages those were.
 */
function stoppedError(cause: WrapsError, results: ReplayReport[]): WrapsError {
  const handedOff = results.filter((r) => r.outcome !== "failed");
  const kept = results.filter((r) => r.outcome === "replayed-not-deleted");
  const n = handedOff.length;
  const keptNote =
    kept.length > 0
      ? ` ${kept.length} of them ${kept.length === 1 ? "is" : "are"} still queued although the processor took ${kept.length === 1 ? "it" : "them"}; do not replay ${kept.length === 1 ? "it" : "them"} (ids in the --json data, or leave ${kept.length === 1 ? "it" : "them"} to expire after 14 days).`
      : "";
  // Reuse the cause: its code is a literal where it was built, which the
  // error-code parity test relies on.
  cause.data = {
    handedOff: handedOff.map((r) => r.messageId),
    handedOffNotDeleted: kept.map((r) => r.messageId),
  };
  cause.message = `${cause.message}. Stopped after ${n} message${n === 1 ? "" : "s"} handed off to the processor; messages not handed off are still in the queue.${keptNote}`;
  return cause;
}

/**
 * Inbound Reprocess command - replay the inbound dead-letter queue.
 *
 * A run handles each MessageId at most once and stops at the first empty
 * receive: a replay that fails again re-enters the DLQ as a new message
 * minutes later, and must wait for the next run.
 */
export async function inboundReprocess(
  options: EmailInboundReprocessOptions
): Promise<void> {
  const json = isJsonMode();
  const dryRun = options.dryRun === true;

  // Flag checks first: nothing below should run on a bad invocation.
  const max = parseMax(options.max);
  if (json && !dryRun && !options.yes) {
    throw new WrapsError(
      "--yes is required with --json to replay and delete DLQ messages",
      "CONFIRMATION_REQUIRED",
      `Add --yes (or preview with --dry-run): ${INBOUND_REPROCESS_COMMAND} --json --yes`,
      "https://wraps.dev/docs/cli-reference"
    );
  }

  if (!json) {
    clack.intro(
      pc.bold(dryRun ? "Inbound DLQ (dry run)" : "Inbound Reprocess")
    );
  }

  await validateAWSCredentials();
  const region = options.region || (await getAWSRegion());

  const sqs = new SQSClient({ region });
  let queueUrl: string;
  try {
    queueUrl = await getInboundDlqUrl(sqs);
  } catch (error) {
    if (isQueueMissing(error)) {
      throw new WrapsError(
        `Inbound email is not deployed in ${region}: the dead-letter queue ${INBOUND_DLQ_NAME} does not exist`,
        "INBOUND_NOT_DEPLOYED",
        "Run wraps email inbound init in that region, or pass --region for the region where inbound is deployed."
      );
    }
    throw isAccessDenied(error) ? sqsDenied() : error;
  }

  if (dryRun) {
    const messages = await peek(sqs, queueUrl, max);
    if (json) {
      jsonSuccess("email.inbound.reprocess", {
        dryRun: true,
        region,
        max,
        messages,
        found: messages.length,
      });
      return;
    }
    if (messages.length === 0) {
      clack.log.success("The dead-letter queue is empty. Nothing to replay.");
      return;
    }
    console.log();
    for (const m of messages) {
      console.log(`  ${describeLine(m)}`);
    }
    console.log();
    clack.log.info(
      `${messages.length} message${messages.length === 1 ? "" : "s"} would be replayed${messages.length >= max ? ` (stopped at --max ${max}; the queue may hold more)` : ""}. Nothing was changed. Run ${pc.cyan(`${INBOUND_REPROCESS_COMMAND} --yes`)} to replay.`
    );
    return;
  }

  if (!options.yes) {
    ensureInteractive("Replay confirmation", "--yes");
    const proceed = await clack.confirm({
      message: `Replay up to ${max} dead-lettered message${max === 1 ? "" : "s"} through ${INBOUND_PROCESSOR_FUNCTION_NAME}? Each one is deleted from the queue once the processor accepts it.`,
    });
    if (clack.isCancel(proceed) || !proceed) {
      clack.cancel("Nothing was replayed.");
      return;
    }
  }

  const lambda = new LambdaClient({ region });
  const handled = new Set<string>();
  const results: ReplayReport[] = [];
  let capped = false;

  while (true) {
    if (handled.size >= max) {
      capped = true;
      break;
    }
    const batch = await receive(
      sqs,
      queueUrl,
      max - handled.size,
      REPLAY_VISIBILITY_SECONDS
    );
    if (batch.length === 0) {
      break;
    }
    let progressed = false;
    for (const message of batch) {
      const id = message.MessageId ?? "";
      if (handled.has(id) || handled.size >= max) {
        continue;
      }
      handled.add(id);
      progressed = true;
      let result: ReplayReport;
      try {
        result = await replayOne(sqs, lambda, queueUrl, message, region);
      } catch (error) {
        if (error instanceof RunStopped) {
          if (error.handedOff) {
            results.push(error.handedOff);
          }
          throw stoppedError(error.cause, results);
        }
        throw error;
      }
      results.push(result);
      if (!json) {
        const mark = {
          replayed: pc.green("replayed        "),
          "replayed-not-deleted": pc.yellow("replayed, kept  "),
          failed: pc.red("failed          "),
        }[result.outcome];
        console.log(
          `  ${mark} ${describeLine(result)}${result.error ? pc.dim(`  (${result.error})`) : ""}`
        );
      }
    }
    // A batch of already-handled messages (a delete that didn't take) would
    // loop forever; leave those for the visibility timeout and the next run.
    if (!progressed) {
      break;
    }
  }

  const replayed = results.filter((r) => r.outcome === "replayed").length;
  const notDeleted = results.filter(
    (r) => r.outcome === "replayed-not-deleted"
  ).length;
  const failed = results.length - replayed - notDeleted;

  if (json) {
    jsonSuccess("email.inbound.reprocess", {
      dryRun: false,
      region,
      max,
      found: results.length,
      replayed,
      replayedNotDeleted: notDeleted,
      failed,
      stoppedAtMax: capped,
      messages: results,
    });
    return;
  }

  console.log();
  if (results.length === 0) {
    clack.log.success("The dead-letter queue is empty. Nothing to replay.");
    return;
  }
  const parts = [`${replayed} replayed`];
  if (notDeleted > 0) {
    parts.push(`${notDeleted} replayed but not deleted`);
  }
  parts.push(`${failed} failed`);
  clack.log.info(
    `${results.length} handled: ${parts.join(", ")}${capped ? ` (stopped at --max ${max}; the queue may hold more)` : ""}.`
  );
  if (notDeleted > 0) {
    const kept = results.filter((r) => r.outcome === "replayed-not-deleted");
    const them = notDeleted === 1 ? "it" : "them";
    clack.log.warn(
      `${notDeleted} message${notDeleted === 1 ? " was" : "s were"} accepted by the processor but could not be deleted from the queue, so ${notDeleted === 1 ? "it is" : "they are"} still there:\n${kept
        .map(
          (r) =>
            `  ${r.messageId}  sent to the queue ${r.sentTime ?? "at an unknown time"}`
        )
        .join(
          "\n"
        )}\nThe processor already took ${them}. The next reprocess run would take ${them} from the queue and replay ${them} again, delivering the email twice. Delete ${them} from the SQS console (${INBOUND_DLQ_NAME}, Send and receive messages, poll, find the id) before running reprocess again, or leave ${them} to expire: the queue keeps messages 14 days.`
    );
  }
  if (failed > 0) {
    clack.log.warn(
      `${failed} message${failed === 1 ? "" : "s"} could not be handed to the processor and ${failed === 1 ? "is" : "are"} still in the queue; a later run can retry ${failed === 1 ? "it" : "them"}. A replay the processor accepts but fails again comes back later as a new message, so check ${pc.cyan(`aws logs tail /aws/lambda/${INBOUND_PROCESSOR_FUNCTION_NAME}`)} before replaying more.`
    );
  }
}
