import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ArchiveRetention } from "../../types/index.js";

/**
 * Mail Manager archive configuration
 */
export type MailManagerArchiveConfig = {
  name: string;
  retention: ArchiveRetention;
  configSetName: pulumi.Output<string>;
};

/**
 * Mail Manager archive resources
 */
export type MailManagerArchiveResources = {
  archive: aws.sesv2.MailManagerArchive;
  eventDestination: aws.sesv2.ConfigurationSetEventDestination;
};

/**
 * Convert retention period to days for AWS Mail Manager
 */
function retentionToDays(retention: ArchiveRetention): number {
  switch (retention) {
    case "7days":
      return 7;
    case "30days":
      return 30;
    case "90days":
      return 90;
    case "6months":
      return 180;
    case "1year":
      return 365;
    case "18months":
      return 548; // 18 months ≈ 548 days
    default:
      return 90; // Default to 90 days
  }
}

/**
 * Create Mail Manager archive for storing full email content
 *
 * This creates:
 * 1. Mail Manager Archive - stores RFC 822/MIME formatted emails
 * 2. Configuration Set Event Destination - links archive to SES config set
 *
 * Cost: $2/GB ingestion + $0.19/GB/month storage
 * See: https://docs.aws.amazon.com/ses/latest/dg/eb-archiving.html
 */
export async function createMailManagerArchive(
  config: MailManagerArchiveConfig
): Promise<MailManagerArchiveResources> {
  const retentionDays = retentionToDays(config.retention);

  // Create Mail Manager Archive
  const archive = new aws.sesv2.MailManagerArchive("wraps-email-archive", {
    archiveName: `wraps-${config.name}-archive`,
    retention: {
      retentionPeriod: "CUSTOM",
      retentionDays,
    },
    tags: {
      ManagedBy: "wraps-cli",
      Name: "wraps-email-archive",
      Retention: config.retention,
    },
  });

  // Link archive to SES configuration set
  const eventDestination = new aws.sesv2.ConfigurationSetEventDestination(
    "wraps-email-archiving",
    {
      configurationSetName: config.configSetName,
      eventDestinationName: "wraps-email-archiving",
      eventDestination: {
        enabled: true,
        matchingEventTypes: ["SEND"], // Archive all sent emails
        mailManagerDestination: {
          archiveArn: archive.arn,
        },
      },
    },
    {
      dependsOn: [archive],
    }
  );

  return {
    archive,
    eventDestination,
  };
}
