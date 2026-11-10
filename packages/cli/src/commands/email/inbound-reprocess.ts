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
import { errors } from "../../utils/shared/errors.js";
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
  time: string | null;
  keys: string[];
  envelopeCount: number | null;
  shape: DlqEventSummary["shape"];
};

type ReplayReport = MessageReport & {
  outcome: "replayed" | "failed";
  /** Why a message stayed in the DLQ. Present only when it failed. */
  error?: string;
};

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
  return {
    messageId: message.MessageId ?? "",
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
  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(BATCH_SIZE, maxMessages),
      VisibilityTimeout: visibilityTimeout,
      WaitTimeSeconds: WAIT_SECONDS,
    })
  );
  return response?.Messages ?? [];
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
  message: Message
): Promise<ReplayReport> {
  const base = report(message);
  try {
    if (!(message.Body && message.ReceiptHandle)) {
      throw new Error("the message has no body or receipt handle");
    }
    const invoked = await lambda.send(
      new InvokeCommand({
        FunctionName: INBOUND_PROCESSOR_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: new TextEncoder().encode(message.Body),
      })
    );
    if (invoked?.StatusCode !== 202) {
      throw new Error(
        `Lambda returned status ${invoked?.StatusCode ?? "none"}, not 202`
      );
    }
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
    return { ...base, outcome: "replayed" };
  } catch (error) {
    return { ...base, outcome: "failed", error: errorText(error) };
  }
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
    throw errors.invalidFlagUsage(
      "--yes is required with --json to replay and delete DLQ messages",
      `Add --yes (or preview with --dry-run): ${INBOUND_REPROCESS_COMMAND} --json --yes`
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
      throw errors.invalidFlagUsage(
        `The dead-letter queue ${INBOUND_DLQ_NAME} does not exist in ${region}`,
        "Inbound email isn't deployed in this region. Check --region, or enable it with: wraps email inbound init"
      );
    }
    throw error;
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
      const result = await replayOne(sqs, lambda, queueUrl, message);
      results.push(result);
      if (!json) {
        const mark =
          result.outcome === "replayed"
            ? pc.green("replayed")
            : pc.red("failed  ");
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
  const failed = results.length - replayed;

  if (json) {
    jsonSuccess("email.inbound.reprocess", {
      dryRun: false,
      region,
      max,
      found: results.length,
      replayed,
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
  clack.log.info(
    `${results.length} handled: ${replayed} replayed, ${failed} failed${capped ? ` (stopped at --max ${max}; the queue may hold more)` : ""}.`
  );
  if (failed > 0) {
    clack.log.warn(
      `Failed messages stay in the queue. A replay that fails again re-enters it as a new message after Lambda's retries, so check ${pc.cyan(`aws logs tail /aws/lambda/${INBOUND_PROCESSOR_FUNCTION_NAME}`)} before running this again.`
    );
  }
}
