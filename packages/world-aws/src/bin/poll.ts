/**
 * SQS poller for local development and e2e testing.
 *
 * Polls SQS queues (workflows + steps) and forwards messages to the local dev
 * server's workflow/step endpoints via HTTP. This bridges the gap between
 * the AWS world (SQS-based queue) and a local Next.js dev server.
 *
 * Usage:
 *   npx world-aws-poll --url http://localhost:3000
 *   WORKFLOW_LOCAL_BASE_URL=http://localhost:3000 npx world-aws-poll
 */
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { type AWSWorldConfig, resolveConfig } from "../config.js";

const SQS_MAX_DELAY_SECONDS = 900;

function getQueueUrl(
  region: string,
  accountId: string,
  queueName: string,
  endpoint?: string
): string {
  if (endpoint) {
    return `${endpoint}/000000000000/${queueName}`;
  }
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

async function processMessage(
  sqsClient: SQSClient,
  queueUrl: string,
  receiptHandle: string,
  body: string,
  baseUrl: string,
  region: string
): Promise<void> {
  const parsed = JSON.parse(body);
  const { queueName, message, headers: msgHeaders } = parsed;

  const isStep = queueName?.startsWith("__wkf_step_");
  const pathname = isStep ? "step" : "flow";
  const url = `${baseUrl}/.well-known/workflow/v1/${pathname}`;

  const attempt = parsed.attempt ?? 1;
  const messageId = parsed.messageId ?? "unknown";

  // Send the full wrapped body that our createQueueHandler expects:
  // { queueName, message, messageId, attempt }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(msgHeaders ?? {}),
    },
    body: JSON.stringify(parsed),
  });

  if (response.ok) {
    // Check for timeoutSeconds (workflow sleep)
    const text = await response.text();
    if (text) {
      try {
        const result = JSON.parse(text);
        if (result.timeoutSeconds && result.timeoutSeconds > 0) {
          const delaySeconds = Math.min(
            result.timeoutSeconds,
            SQS_MAX_DELAY_SECONDS
          );
          console.log(
            `  [sleep] Re-queuing with ${delaySeconds}s delay (requested: ${result.timeoutSeconds}s)`
          );
          await sqsClient.send(
            new SendMessageCommand({
              QueueUrl: queueUrl,
              MessageBody: body,
              DelaySeconds: delaySeconds,
            })
          );
        }
      } catch {
        // Not JSON, ignore
      }
    }

    // Delete the message from SQS (processed successfully)
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );
    return;
  }

  const errorText = await response.text();

  // 503 with timeoutSeconds means workflow sleep
  if (response.status === 503) {
    try {
      const result = JSON.parse(errorText);
      if (result.timeoutSeconds) {
        const delaySeconds = Math.min(
          result.timeoutSeconds,
          SQS_MAX_DELAY_SECONDS
        );
        console.log(
          `  [sleep] Re-queuing with ${delaySeconds}s delay (requested: ${result.timeoutSeconds}s)`
        );
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: body,
            DelaySeconds: delaySeconds,
          })
        );
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
          })
        );
        return;
      }
    } catch {
      // Not JSON, fall through to error
    }
  }

  // Make the message visible again for retry
  console.error(
    `  [error] ${pathname} handler returned ${response.status}: ${errorText.slice(0, 200)}`
  );
  await sqsClient.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: 1,
    })
  );
}

async function pollQueue(
  sqsClient: SQSClient,
  queueUrl: string,
  queueLabel: string,
  baseUrl: string,
  region: string,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
          VisibilityTimeout: 30,
        })
      );

      if (!response.Messages || response.Messages.length === 0) {
        continue;
      }

      console.log(
        `[${queueLabel}] Received ${response.Messages.length} message(s)`
      );

      await Promise.allSettled(
        response.Messages.map(async (msg) => {
          if (!msg.Body || !msg.ReceiptHandle) return;
          try {
            const parsed = JSON.parse(msg.Body);
            console.log(
              `  [${queueLabel}] Processing: ${parsed.queueName ?? "unknown"}`
            );
            await processMessage(
              sqsClient,
              queueUrl,
              msg.ReceiptHandle!,
              msg.Body,
              baseUrl,
              region
            );
            console.log(`  [${queueLabel}] Done`);
          } catch (e) {
            console.error(
              `  [${queueLabel}] Failed:`,
              e instanceof Error ? e.message : e
            );
          }
        })
      );
    } catch (e) {
      if (signal.aborted) break;
      console.error(
        `[${queueLabel}] Poll error:`,
        e instanceof Error ? e.message : e
      );
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function main() {
  const configOverride: AWSWorldConfig = {};
  let baseUrl =
    process.env.WORKFLOW_LOCAL_BASE_URL ?? "http://localhost:3000";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === "--region" && args[i + 1]) {
      configOverride.region = args[++i];
    } else if (args[i] === "--prefix" && args[i + 1]) {
      configOverride.tablePrefix = args[++i];
      configOverride.queuePrefix = args[i];
    } else if (args[i] === "--endpoint" && args[i + 1]) {
      configOverride.endpoint = args[++i];
    }
  }

  const config = resolveConfig(configOverride);
  const accountId = process.env.AWS_ACCOUNT_ID;
  if (!accountId && !config.endpoint) {
    console.error(
      "AWS_ACCOUNT_ID is required for SQS queue URL construction"
    );
    process.exit(1);
  }

  const sqsClient = new SQSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    maxAttempts: 5,
  });

  const workflowsQueueUrl = getQueueUrl(
    config.region,
    accountId ?? "000000000000",
    `${config.queuePrefix}-workflows`,
    config.endpoint
  );
  const stepsQueueUrl = getQueueUrl(
    config.region,
    accountId ?? "000000000000",
    `${config.queuePrefix}-steps`,
    config.endpoint
  );

  console.log("Starting SQS poller...");
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Region: ${config.region}`);
  console.log(`  Workflows queue: ${workflowsQueueUrl}`);
  console.log(`  Steps queue: ${stepsQueueUrl}`);
  console.log("");

  const controller = new AbortController();
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    controller.abort();
  });
  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    controller.abort();
  });

  await Promise.all([
    pollQueue(
      sqsClient,
      workflowsQueueUrl,
      "workflows",
      baseUrl,
      config.region,
      controller.signal
    ),
    pollQueue(
      sqsClient,
      stepsQueueUrl,
      "steps",
      baseUrl,
      config.region,
      controller.signal
    ),
  ]);

  sqsClient.destroy();
  console.log("Poller stopped.");
}

main().catch((e) => {
  console.error("Poller failed:", e);
  process.exit(1);
});
