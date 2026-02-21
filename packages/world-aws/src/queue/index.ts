import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { ResolvedConfig } from "../config.js";
import { ulid } from "ulid";

export function createQueue(sqsClient: SQSClient, config: ResolvedConfig) {
  function getQueueUrl(sqsQueueName: string): string {
    if (config.endpoint) {
      return `${config.endpoint}/000000000000/${sqsQueueName}`;
    }
    return `https://sqs.${config.region}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${sqsQueueName}`;
  }

  const workflowsQueueUrl =
    process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL ?? getQueueUrl(`${config.queuePrefix}-workflows`);
  const stepsQueueUrl =
    process.env.WORKFLOW_AWS_STEPS_QUEUE_URL ?? getQueueUrl(`${config.queuePrefix}-steps`);

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
      },
    ): Promise<{ messageId: string }> {
      const isStep = queueName.startsWith("__wkf_step_");
      const queueUrl = isStep ? stepsQueueUrl : workflowsQueueUrl;

      const messageId = ulid();
      const body = JSON.stringify({
        queueName,
        message,
        messageId,
        headers: opts?.headers,
        attempt: 1,
      });

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: body,
          DelaySeconds: opts?.delaySeconds,
          MessageAttributes: {
            ...(opts?.idempotencyKey
              ? {
                  IdempotencyKey: { DataType: "String", StringValue: opts.idempotencyKey },
                }
              : {}),
            QueueName: { DataType: "String", StringValue: queueName },
          },
        }),
      );

      return { messageId: messageId as string };
    },

    createQueueHandler(
      queueNamePrefix: string,
      handler: (
        message: unknown,
        meta: { attempt: number; queueName: string; messageId: string },
      ) => Promise<void | { timeoutSeconds: number }>,
    ): (req: Request) => Promise<Response> {
      return async (req: Request): Promise<Response> => {
        try {
          const body = (await req.json()) as {
            queueName: string;
            message: unknown;
            messageId: string;
            attempt?: number;
          };
          const { queueName, message, messageId, attempt = 1 } = body;

          if (!queueName?.startsWith(queueNamePrefix)) {
            return new Response("Queue name mismatch", { status: 400 });
          }

          const result = await handler(message, { attempt, queueName, messageId });

          return new Response(JSON.stringify(result ?? {}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      };
    },
  };
}
