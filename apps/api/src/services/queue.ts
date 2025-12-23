/**
 * SQS Queue Service
 *
 * Enqueues batch jobs for processing by the worker Lambda.
 */

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});
const QUEUE_URL = process.env.BATCH_QUEUE_URL;

export interface BatchJob {
  batchId: string;
  organizationId: string;
  awsAccountId: string;
  channel: string;
  chunkIndex: number;
}

export async function enqueueJob(job: BatchJob): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error("BATCH_QUEUE_URL not configured");
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
      MessageGroupId: job.batchId, // FIFO ordering by batch
      MessageDeduplicationId: `${job.batchId}-${job.chunkIndex}`,
    })
  );
}
