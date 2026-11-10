import {
  type _Object,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { db } from "@wraps/db";
import { getOrAssumeRole } from "./credential-cache";

type InboundEmailAddress = {
  address: string;
  name: string;
};

type InboundAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  contentDisposition?: string;
  cid?: string | null;
};

export type InboundEmailSummary = {
  emailId: string;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  subject: string;
  receivedAt: string;
  hasAttachments: boolean;
  attachmentCount: number;
  spamVerdict: string | null;
  virusVerdict: string | null;
};

export type InboundEmailDetail = {
  emailId: string;
  messageId: string;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  cc: InboundEmailAddress[];
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
  spamVerdict: string | null;
  virusVerdict: string | null;
  rawS3Key: string;
  receivedAt: string;
};

/**
 * List parsed inbound emails from S3 for a specific AWS account.
 */
export async function listInboundEmails(params: {
  awsAccountId: string;
  organizationId: string;
  limit?: number;
  continuationToken?: string;
}): Promise<{ emails: InboundEmailSummary[]; nextToken?: string }> {
  const {
    awsAccountId,
    organizationId,
    limit = 50,
    continuationToken,
  } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const bucketName = account.features?.email?.inboundBucketName;
  if (!bucketName) {
    return { emails: [] };
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const s3 = new S3Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: "parsed/",
        MaxKeys: limit,
        ContinuationToken: continuationToken,
      })
    );

    const objects = (listResponse.Contents || []).filter((obj: _Object) =>
      obj.Key?.endsWith(".json")
    );

    // Fetch each parsed JSON for summary fields
    const emails = await Promise.all(
      objects.map(async (obj: _Object) => {
        try {
          const getResponse = await s3.send(
            new GetObjectCommand({
              Bucket: bucketName,
              Key: obj.Key!,
            })
          );
          const body = await getResponse.Body?.transformToString();
          if (!body) {
            throw new Error("Empty body");
          }
          const parsed = JSON.parse(body);

          return {
            emailId: parsed.emailId,
            from: parsed.from,
            to: parsed.to,
            subject: parsed.subject,
            receivedAt: parsed.receivedAt,
            hasAttachments: parsed.attachments?.length > 0,
            attachmentCount: parsed.attachments?.length || 0,
            spamVerdict: parsed.spamVerdict,
            virusVerdict: parsed.virusVerdict,
          } as InboundEmailSummary;
        } catch {
          return null;
        }
      })
    );

    return {
      emails: emails.filter(
        (e: InboundEmailSummary | null): e is InboundEmailSummary => e !== null
      ),
      nextToken: listResponse.NextContinuationToken,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchBucket" ||
        error.message.includes("NoSuchBucket") ||
        error.name === "NoSuchKey" ||
        error.message.includes("NoSuchKey"))
    ) {
      return { emails: [] };
    }
    throw error;
  }
}

/**
 * Get a single parsed inbound email from S3.
 */
export async function getInboundEmail(params: {
  awsAccountId: string;
  organizationId: string;
  emailId: string;
}): Promise<InboundEmailDetail | null> {
  const { awsAccountId, organizationId, emailId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const bucketName = account.features?.email?.inboundBucketName;
  if (!bucketName) {
    return null;
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const s3 = new S3Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const getResponse = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `parsed/${emailId}.json`,
      })
    );

    const body = await getResponse.Body?.transformToString();
    if (!body) {
      throw new Error("Empty body");
    }
    return JSON.parse(body) as InboundEmailDetail;
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}
