import {
  CreateArchiveCommand,
  GetArchiveCommand,
  ListArchivesCommand,
  MailManagerClient,
  type RetentionPeriod,
} from "@aws-sdk/client-mailmanager";
import {
  PutConfigurationSetArchivingOptionsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import type * as pulumi from "@pulumi/pulumi";
import type { ArchiveRetention } from "../../types/index.js";

/**
 * Mail Manager archive configuration
 */
export type MailManagerArchiveConfig = {
  name: string;
  retention: ArchiveRetention;
  configSetName: pulumi.Output<string>;
  region?: string;
  kmsKeyArn?: string; // Optional: provide existing KMS key, otherwise AWS-managed key is used
};

/**
 * Mail Manager archive resources
 */
export type MailManagerArchiveResources = {
  archiveId: string;
  archiveArn: string;
  kmsKeyArn?: string;
};

/**
 * Convert our retention types to AWS SDK RetentionPeriod enum
 */
function retentionToAWSPeriod(retention: ArchiveRetention): RetentionPeriod {
  switch (retention) {
    case "3months":
      return "THREE_MONTHS";
    case "6months":
      return "SIX_MONTHS";
    case "9months":
      return "NINE_MONTHS";
    case "1year":
      return "ONE_YEAR";
    case "18months":
      return "EIGHTEEN_MONTHS";
    case "2years":
      return "TWO_YEARS";
    case "30months":
      return "THIRTY_MONTHS";
    case "3years":
      return "THREE_YEARS";
    case "4years":
      return "FOUR_YEARS";
    case "5years":
      return "FIVE_YEARS";
    case "6years":
      return "SIX_YEARS";
    case "7years":
      return "SEVEN_YEARS";
    case "8years":
      return "EIGHT_YEARS";
    case "9years":
      return "NINE_YEARS";
    case "10years":
      return "TEN_YEARS";
    case "permanent":
      return "PERMANENT";
    default:
      return "THREE_MONTHS";
  }
}

/**
 * Create Mail Manager archive for storing full email content
 *
 * This creates:
 * 1. Mail Manager Archive - stores RFC 822/MIME formatted emails
 * 2. Links archive to SES Configuration Set
 *
 * Uses AWS SDK directly since Pulumi doesn't support Mail Manager yet.
 *
 * Cost: $2/GB ingestion + $0.19/GB/month storage
 * See: https://docs.aws.amazon.com/ses/latest/dg/eb-archiving.html
 *
 * Note: KMS encryption is optional. If not provided, AWS-managed encryption is used.
 */
export async function createMailManagerArchive(
  config: MailManagerArchiveConfig
): Promise<MailManagerArchiveResources> {
  const region = config.region || process.env.AWS_REGION || "us-east-1";
  const archiveName = `wraps-${config.name}-archive`;

  // Initialize clients
  const mailManagerClient = new MailManagerClient({ region });
  const sesClient = new SESv2Client({ region });

  const kmsKeyArn = config.kmsKeyArn;

  // If no KMS key provided, create one for encryption
  // Note: User can also opt to not provide one and AWS will use service-managed keys
  if (!kmsKeyArn) {
    // For now, we'll let AWS use service-managed keys
    // In the future, we could create a customer-managed key here if needed:
    //
    // const kmsClient = new KMSClient({ region });
    // const createKeyResult = await kmsClient.send(
    //   new CreateKeyCommand({
    //     Description: `KMS key for Wraps email archive (${archiveName})`,
    //     Tags: [
    //       { TagKey: "ManagedBy", TagValue: "wraps-cli" },
    //       { TagKey: "Name", TagValue: `wraps-${config.name}-archive-key` },
    //     ],
    //   })
    // );
    // kmsKeyArn = createKeyResult.KeyMetadata?.Arn;
  }

  // 1. Create Mail Manager Archive (or get existing)
  const awsRetention = retentionToAWSPeriod(config.retention);

  let archiveId: string | undefined;
  let archiveArn: string | undefined;

  // Check if archive already exists
  try {
    const listCommand = new ListArchivesCommand({});
    const listResult = await mailManagerClient.send(listCommand);

    const existingArchive = listResult.Archives?.find(
      (archive: { ArchiveName?: string; ArchiveId?: string }) =>
        archive.ArchiveName === archiveName
    );

    if (existingArchive?.ArchiveId) {
      // Archive exists, use it
      console.log(`Using existing Mail Manager archive: ${archiveName}`);
      archiveId = existingArchive.ArchiveId;

      // Get full archive details to get ARN
      const getCommand = new GetArchiveCommand({ ArchiveId: archiveId });
      const getResult = await mailManagerClient.send(getCommand);
      archiveArn = getResult.ArchiveArn;
    }
  } catch (error) {
    console.log("Error checking for existing archive:", error);
    // Continue to create new archive
  }

  // Create archive if it doesn't exist
  if (!archiveId) {
    try {
      const createArchiveCommand = new CreateArchiveCommand({
        ArchiveName: archiveName,
        Retention: {
          RetentionPeriod: awsRetention,
        },
        ...(kmsKeyArn && { KmsKeyArn: kmsKeyArn }),
        Tags: [
          { Key: "ManagedBy", Value: "wraps-cli" },
          { Key: "Name", Value: archiveName },
          { Key: "Retention", Value: config.retention },
        ],
      });

      const archiveResult = await mailManagerClient.send(createArchiveCommand);
      archiveId = archiveResult.ArchiveId;

      if (!archiveId) {
        throw new Error(
          "Failed to create Mail Manager Archive: No ArchiveId returned"
        );
      }

      console.log(`Created new Mail Manager archive: ${archiveName}`);
    } catch (error) {
      // If it's a ConflictException, the archive was created between our check and now
      if (
        error instanceof Error &&
        error.name === "ConflictException" &&
        error.message.includes("Archive already exists")
      ) {
        console.log(
          "Archive was created concurrently, fetching existing archive..."
        );

        // List again and find it
        const listCommand = new ListArchivesCommand({});
        const listResult = await mailManagerClient.send(listCommand);
        const existingArchive = listResult.Archives?.find(
          (archive: { ArchiveName?: string; ArchiveId?: string }) =>
            archive.ArchiveName === archiveName
        );

        if (!existingArchive?.ArchiveId) {
          throw new Error(
            `Archive exists but couldn't find it: ${archiveName}`
          );
        }

        archiveId = existingArchive.ArchiveId;

        // Get full archive details
        const getCommand = new GetArchiveCommand({ ArchiveId: archiveId });
        const getResult = await mailManagerClient.send(getCommand);
        archiveArn = getResult.ArchiveArn;
      } else {
        throw error;
      }
    }
  }

  // Construct the ARN if we don't have it yet
  if (!archiveArn) {
    // ARN format: arn:aws:ses:region:account-id:mailmanager-archive/archive-id
    const identity = await import("@aws-sdk/client-sts").then((m) =>
      new m.STSClient({ region }).send(new m.GetCallerIdentityCommand({}))
    );
    const accountId = identity.Account;
    archiveArn = `arn:aws:ses:${region}:${accountId}:mailmanager-archive/${archiveId}`;
  }

  // 2. Link archive to SES Configuration Set
  // We need to wait for the configSetName to resolve from Pulumi Output
  const configSetName = await new Promise<string>((resolve) => {
    config.configSetName.apply((name) => {
      resolve(name);
    });
  });

  const putArchivingOptionsCommand =
    new PutConfigurationSetArchivingOptionsCommand({
      ConfigurationSetName: configSetName,
      ArchiveArn: archiveArn,
    });

  await sesClient.send(putArchivingOptionsCommand);

  if (!(archiveId && archiveArn)) {
    throw new Error("Failed to get archive ID or ARN");
  }

  return {
    archiveId,
    archiveArn,
    kmsKeyArn,
  };
}
