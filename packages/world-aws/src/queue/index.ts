import type { SQSClient } from "@aws-sdk/client-sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ulid } from "ulid";
import type { ResolvedConfig } from "../config.js";
import { wrapAWSError } from "../errors.js";

export function createQueue(sqsClient: SQSClient, config: ResolvedConfig) {
  function getQueueUrl(sqsQueueName: string): string {
    if (config.endpoint) {
      return `${config.endpoint}/000000000000/${sqsQueueName}`;
    }
    const accountId = process.env.AWS_ACCOUNT_ID;
    if (!accountId) {
      throw new Error(
        "AWS_ACCOUNT_ID environment variable is required for SQS queue URL construction. " +
          "Set AWS_ACCOUNT_ID or use WORKFLOW_AWS_WORKFLOWS_QUEUE_URL / WORKFLOW_AWS_STEPS_QUEUE_URL directly."
      );
    }
    return `https://sqs.${config.region}.amazonaws.com/${accountId}/${sqsQueueName}`;
  }

  return {
    async getDeploymentId(): Promise<string> {
      return config.deploymentId;
    },

    async queue(
      queueName: string,
      message: unknown,
      opts?: {
        deploymentId?: string;
        idempotencyKey?: string;
        headers?: Record<string, string>;
        delaySeconds?: number;
      }
    ): Promise<{ messageId: string }> {
      const isStep = queueName.startsWith("__wkf_step_");
      const queueUrl = isStep
        ? (process.env.WORKFLOW_AWS_STEPS_QUEUE_URL ??
          getQueueUrl(`${config.queuePrefix}-steps`))
        : (process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL ??
          getQueueUrl(`${config.queuePrefix}-workflows`));

      const messageId = ulid();
      const body = JSON.stringify({
        queueName,
        message,
        messageId,
        headers: opts?.headers,
        attempt: 1,
      });

      try {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: body,
            DelaySeconds: opts?.delaySeconds,
            MessageAttributes: {
              ...(opts?.idempotencyKey
                ? {
                    IdempotencyKey: {
                      DataType: "String",
                      StringValue: opts.idempotencyKey,
                    },
                  }
                : {}),
              QueueName: { DataType: "String", StringValue: queueName },
            },
          })
        );
      } catch (e) {
        wrapAWSError(e, "queue.send");
      }

      return { messageId: messageId as string };
    },

    createQueueHandler(
      queueNamePrefix: string,
      handler: (
        message: unknown,
        meta: { attempt: number; queueName: string; messageId: string }
      ) => Promise<undefined | { timeoutSeconds: number }>
    ): (req: Request) => Promise<Response> {
      return async (req: Request): Promise<Response> => {
        try {
          // Detect protocol: header-based (local world dispatch) vs body envelope (SQS Lambda)
          const headerQueueName = req.headers.get("x-vqs-queue-name");

          let queueName: string;
          let message: unknown;
          let messageId: string;
          let attempt: number;

          if (headerQueueName) {
            // Header-based protocol: metadata in headers, raw message in body
            queueName = headerQueueName;
            messageId = req.headers.get("x-vqs-message-id") ?? "unknown";
            attempt = Number(req.headers.get("x-vqs-message-attempt") ?? "1");
            message = await req.json();
          } else {
            // Body envelope protocol: everything in JSON body
            const body = (await req.json()) as {
              queueName: string;
              message: unknown;
              messageId: string;
              attempt?: number;
            };
            queueName = body.queueName;
            message = body.message;
            messageId = body.messageId;
            attempt = body.attempt ?? 1;
          }

          if (!queueName?.startsWith(queueNamePrefix)) {
            return new Response("Queue name mismatch", { status: 400 });
          }

          const result = await handler(message, {
            attempt,
            queueName,
            messageId,
          });

          if (result?.timeoutSeconds) {
            return Response.json(
              { timeoutSeconds: result.timeoutSeconds },
              { status: 503 }
            );
          }

          return Response.json({ ok: true });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          return Response.json({ error: msg }, { status: 500 });
        }
      };
    },
  };
}
