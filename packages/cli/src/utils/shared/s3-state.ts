import { existsSync, statSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConnectionMetadata } from "./metadata.js";

function has404StatusCode(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const metadataError = error as Error & {
    $metadata?: { httpStatusCode?: number };
  };
  return metadataError.$metadata?.httpStatusCode === 404;
}

/**
 * Get the S3 state bucket name for an account/region pair
 */
export function getStateBucketName(accountId: string, region: string): string {
  return `wraps-state-${accountId}-${region}`;
}

/**
 * Get the S3 backend URL for Pulumi
 */
export function getS3BackendUrl(accountId: string, region: string): string {
  return `s3://${getStateBucketName(accountId, region)}`;
}

/**
 * Check if the state bucket already exists
 */
export async function stateBucketExists(
  accountId: string,
  region: string
): Promise<boolean> {
  const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const bucketName = getStateBucketName(accountId, region);

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" ||
        error.name === "NoSuchBucket" ||
        has404StatusCode(error))
    ) {
      return false;
    }
    // For other errors (permissions, network), propagate
    throw error;
  }
}

/**
 * Ensure the S3 state bucket exists, creating it if needed.
 * Configures SSE-S3 encryption, versioning, and public access block.
 * Returns the bucket name.
 */
export async function ensureStateBucket(
  accountId: string,
  region: string
): Promise<string> {
  const {
    S3Client,
    HeadBucketCommand,
    CreateBucketCommand,
    PutBucketEncryptionCommand,
    PutBucketVersioningCommand,
    PutPublicAccessBlockCommand,
    PutBucketTaggingCommand,
  } = await import("@aws-sdk/client-s3");

  const client = new S3Client({ region });
  const bucketName = getStateBucketName(accountId, region);

  // Check if bucket already exists
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return bucketName;
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      (error.name === "NotFound" ||
        error.name === "NoSuchBucket" ||
        has404StatusCode(error));
    if (!isNotFound) {
      throw error;
    }
    // Bucket doesn't exist, create it
  }

  // Create bucket
  const createParams: any = { Bucket: bucketName };
  // us-east-1 does not accept LocationConstraint
  if (region !== "us-east-1") {
    createParams.CreateBucketConfiguration = {
      LocationConstraint: region,
    };
  }
  await client.send(new CreateBucketCommand(createParams));

  // Enable SSE-S3 encryption
  await client.send(
    new PutBucketEncryptionCommand({
      Bucket: bucketName,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: "AES256",
            },
          },
        ],
      },
    })
  );

  // Enable versioning
  await client.send(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: {
        Status: "Enabled",
      },
    })
  );

  // Block all public access
  await client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  );

  // Tag bucket
  await client.send(
    new PutBucketTaggingCommand({
      Bucket: bucketName,
      Tagging: {
        TagSet: [
          { Key: "ManagedBy", Value: "wraps-cli" },
          { Key: "Purpose", Value: "state" },
        ],
      },
    })
  );

  return bucketName;
}

/**
 * Upload connection metadata to S3
 */
export async function uploadMetadata(
  bucketName: string,
  metadata: ConnectionMetadata
): Promise<void> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: metadata.region });
  const key = `metadata/${metadata.accountId}-${metadata.region}.json`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    })
  );
}

/**
 * Delete connection metadata from S3
 */
export async function deleteMetadata(
  bucketName: string,
  accountId: string,
  region: string
): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const key = `metadata/${accountId}-${region}.json`;

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );
}

/**
 * Clear Pulumi stack lock files from S3 backend.
 * Lists and deletes all objects under .pulumi/locks/ in the state bucket.
 * Returns the number of locks cleared.
 */
export async function clearS3StackLocks(
  accountId: string,
  region: string
): Promise<number> {
  const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import(
    "@aws-sdk/client-s3"
  );

  const client = new S3Client({ region });
  const bucketName = getStateBucketName(accountId, region);
  const prefix = ".pulumi/locks/";

  const response = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix })
  );

  const lockObjects = response.Contents ?? [];
  if (lockObjects.length === 0) {
    return 0;
  }

  for (const obj of lockObjects) {
    if (obj.Key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: obj.Key })
      );
    }
  }

  return lockObjects.length;
}

/**
 * Download connection metadata from S3
 * Returns null if the key doesn't exist
 */
export async function downloadMetadata(
  bucketName: string,
  accountId: string,
  region: string
): Promise<ConnectionMetadata | null> {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const key = `metadata/${accountId}-${region}.json`;

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) {
      return null;
    }

    return JSON.parse(body) as ConnectionMetadata;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchKey" ||
        has404StatusCode(error))
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if local Pulumi state needs to be migrated to S3
 */
export async function needsMigration(
  localPulumiDir: string,
  accountId: string,
  region: string
): Promise<boolean> {
  // Check for marker file indicating migration is already done
  const markerPath = join(localPulumiDir, `.migrated-${accountId}-${region}`);
  if (existsSync(markerPath)) {
    return false;
  }

  // Check if local stacks exist for this account/region
  // Pulumi stores stacks under .pulumi/stacks/{projectName}/{stackName}.json
  const stacksDir = join(localPulumiDir, ".pulumi", "stacks");
  if (!existsSync(stacksDir)) {
    return false;
  }

  try {
    const entries = await readdir(stacksDir);
    for (const entry of entries) {
      const entryPath = join(stacksDir, entry);
      if (statSync(entryPath).isDirectory()) {
        const files = await readdir(entryPath);
        const matching = files.filter(
          (f) =>
            f.includes(accountId) && f.includes(region) && f.endsWith(".json")
        );
        if (matching.length > 0) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Migrate local Pulumi state to S3 backend.
 * Uses Pulumi Automation API to export from local and import to S3.
 * Writes a marker file to prevent re-migration.
 */
export async function migrateLocalPulumiState(
  localPulumiDir: string,
  bucketName: string,
  accountId: string,
  region: string
): Promise<void> {
  const pulumi = await import("@pulumi/pulumi/automation/index.js");

  // Find local stacks for this account/region
  // Pulumi stores stacks under .pulumi/stacks/{projectName}/{stackName}.json
  const stacksDir = join(localPulumiDir, ".pulumi", "stacks");
  const entries = await readdir(stacksDir);

  for (const entry of entries) {
    const entryPath = join(stacksDir, entry);
    if (!statSync(entryPath).isDirectory()) {
      continue;
    }

    const projectName = entry;
    const files = await readdir(entryPath);
    const stackFiles = files.filter(
      (f) => f.includes(accountId) && f.includes(region) && f.endsWith(".json")
    );

    for (const stackFile of stackFiles) {
      const stackName = stackFile.replace(".json", "");

      try {
        // Export state from local backend
        const localStack = await pulumi.LocalWorkspace.selectStack({
          stackName,
          workDir: localPulumiDir,
        });
        const state = await localStack.exportStack();

        // Import state to S3 backend
        const s3Stack = await pulumi.LocalWorkspace.createOrSelectStack(
          {
            stackName,
            projectName,
            program: async () => ({}),
          },
          {
            workDir: localPulumiDir,
            envVars: {
              PULUMI_BACKEND_URL: `s3://${bucketName}`,
              PULUMI_CONFIG_PASSPHRASE: "",
            },
          }
        );
        await s3Stack.importStack(state);
      } catch (error) {
        // Log but don't fail on individual stack migration errors
        console.error(
          `Warning: Failed to migrate stack ${stackName}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }

  // Write marker file to prevent re-migration
  const markerPath = join(localPulumiDir, `.migrated-${accountId}-${region}`);
  await writeFile(markerPath, new Date().toISOString(), "utf-8");
}
