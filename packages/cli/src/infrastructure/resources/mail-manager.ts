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
 *
 * TODO: Mail Manager Archive is not yet available in Pulumi AWS provider
 * When available, update this to use the proper types
 */
export type MailManagerArchiveResources = {
  archive: any; // TODO: Replace with aws.mailmanager.Archive when available
  eventDestination: any; // TODO: Replace with proper type
};

/**
 * Convert retention period to days for AWS Mail Manager
 * Currently unused but will be needed when Mail Manager Archive is supported
 */
// @ts-expect-error - Function is commented out but will be needed when Pulumi supports Mail Manager
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // Suppress unused variable warning
  void config;

  // TODO: Mail Manager Archive is not yet available in Pulumi AWS provider
  // This is a stub implementation that throws an error if called
  // When Pulumi adds support for Mail Manager, implement this properly:
  //
  // const retentionDays = retentionToDays(config.retention);
  //
  // const archive = new aws.mailmanager.Archive("wraps-email-archive", {
  //   archiveName: `wraps-${config.name}-archive`,
  //   retention: {
  //     retentionPeriod: "CUSTOM",
  //     retentionDays,
  //   },
  //   tags: {
  //     ManagedBy: "wraps-cli",
  //     Name: "wraps-email-archive",
  //     Retention: config.retention,
  //   },
  // });
  //
  // const eventDestination = new aws.sesv2.ConfigurationSetEventDestination(
  //   "wraps-email-archiving",
  //   {
  //     configurationSetName: config.configSetName,
  //     eventDestinationName: "wraps-email-archiving",
  //     eventDestination: {
  //       enabled: true,
  //       matchingEventTypes: ["SEND"],
  //       mailManagerDestination: {
  //         archiveArn: archive.arn,
  //       },
  //     },
  //   },
  //   {
  //     dependsOn: [archive],
  //   }
  // );

  throw new Error(
    "Mail Manager Archive is not yet supported in Pulumi AWS provider. " +
      "Email archiving with Mail Manager is coming soon."
  );
}
