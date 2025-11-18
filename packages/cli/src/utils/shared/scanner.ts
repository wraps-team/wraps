import {
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import {
  DescribeConfigurationSetCommand,
  GetIdentityVerificationAttributesCommand,
  ListConfigurationSetsCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetTopicAttributesCommand,
  ListTopicsCommand,
  SNSClient,
} from "@aws-sdk/client-sns";

/**
 * SES Identity with configuration
 */
export type SESIdentity = {
  name: string;
  type: "Domain" | "EmailAddress";
  verified: boolean;
  configurationSet?: string;
  dkimEnabled?: boolean;
};

/**
 * SES Configuration Set
 */
export type SESConfigurationSet = {
  name: string;
  eventDestinations: Array<{
    name: string;
    enabled: boolean;
    matchingEventTypes: string[];
    snsDestination?: string;
    cloudWatchDestination?: any;
  }>;
};

/**
 * SNS Topic
 */
export type SNSTopic = {
  arn: string;
  name: string;
  subscriptions?: number;
};

/**
 * DynamoDB Table
 */
export type DynamoTable = {
  name: string;
  status: string;
  itemCount?: number;
  sizeBytes?: number;
};

/**
 * Lambda Function
 */
export type LambdaFunction = {
  name: string;
  arn: string;
  runtime?: string;
  handler?: string;
};

/**
 * IAM Role
 */
export type IAMRole = {
  name: string;
  arn: string;
  assumeRolePolicyDocument: string;
};

/**
 * Complete scan of existing AWS resources
 */
export type AWSResourceScan = {
  identities: SESIdentity[];
  configurationSets: SESConfigurationSet[];
  snsTopics: SNSTopic[];
  dynamoTables: DynamoTable[];
  lambdaFunctions: LambdaFunction[];
  iamRoles: IAMRole[];
};

/**
 * Scan all existing SES identities (domains and email addresses)
 */
export async function scanSESIdentities(
  region: string
): Promise<SESIdentity[]> {
  const ses = new SESClient({ region });
  const identities: SESIdentity[] = [];

  try {
    // List all identities
    const listResponse = await ses.send(new ListIdentitiesCommand({}));
    const identityNames = listResponse.Identities || [];

    if (identityNames.length === 0) {
      return [];
    }

    // Get verification attributes
    const attrsResponse = await ses.send(
      new GetIdentityVerificationAttributesCommand({
        Identities: identityNames,
      })
    );

    const attrs = attrsResponse.VerificationAttributes || {};

    // Build identity objects
    for (const name of identityNames) {
      const attr = attrs[name];
      identities.push({
        name,
        type: name.includes("@") ? "EmailAddress" : "Domain",
        verified: attr?.VerificationStatus === "Success",
      });
    }

    return identities;
  } catch (error: any) {
    console.error("Error scanning SES identities:", error.message);
    return [];
  }
}

/**
 * Scan all SES configuration sets
 */
export async function scanSESConfigurationSets(
  region: string
): Promise<SESConfigurationSet[]> {
  const ses = new SESClient({ region });
  const configSets: SESConfigurationSet[] = [];

  try {
    // List configuration sets
    const listResponse = await ses.send(new ListConfigurationSetsCommand({}));
    const configSetNames =
      listResponse.ConfigurationSets?.map((cs) => cs.Name!).filter(Boolean) ||
      [];

    // Get details for each config set
    for (const name of configSetNames) {
      try {
        const describeResponse = await ses.send(
          new DescribeConfigurationSetCommand({ ConfigurationSetName: name })
        );

        const eventDestinations =
          describeResponse.EventDestinations?.map((ed) => ({
            name: ed.Name!,
            enabled: ed.Enabled ?? false,
            matchingEventTypes: ed.MatchingEventTypes || [],
            snsDestination: ed.SNSDestination?.TopicARN,
            cloudWatchDestination: ed.CloudWatchDestination,
          })) || [];

        configSets.push({
          name,
          eventDestinations,
        });
      } catch (error: any) {
        console.error(`Error describing config set ${name}:`, error.message);
      }
    }

    return configSets;
  } catch (error: any) {
    console.error("Error scanning SES configuration sets:", error.message);
    return [];
  }
}

/**
 * Scan SNS topics (filter for email-related ones)
 */
export async function scanSNSTopics(region: string): Promise<SNSTopic[]> {
  const sns = new SNSClient({ region });
  const topics: SNSTopic[] = [];

  try {
    // List all topics
    const listResponse = await sns.send(new ListTopicsCommand({}));
    const topicArns =
      listResponse.Topics?.map((t) => t.TopicArn!).filter(Boolean) || [];

    // Get details for each topic
    for (const arn of topicArns) {
      try {
        const attrsResponse = await sns.send(
          new GetTopicAttributesCommand({ TopicArn: arn })
        );

        const name = arn.split(":").pop() || arn;
        const subscriptions = Number.parseInt(
          attrsResponse.Attributes?.SubscriptionsConfirmed || "0",
          10
        );

        topics.push({
          arn,
          name,
          subscriptions,
        });
      } catch (error: any) {
        console.error(
          `Error getting topic attributes for ${arn}:`,
          error.message
        );
      }
    }

    return topics;
  } catch (error: any) {
    console.error("Error scanning SNS topics:", error.message);
    return [];
  }
}

/**
 * Scan DynamoDB tables (filter for email-related ones)
 */
export async function scanDynamoTables(region: string): Promise<DynamoTable[]> {
  const dynamo = new DynamoDBClient({ region });
  const tables: DynamoTable[] = [];

  try {
    // List all tables
    const listResponse = await dynamo.send(new ListTablesCommand({}));
    const tableNames = listResponse.TableNames || [];

    // Get details for each table
    for (const name of tableNames) {
      try {
        const describeResponse = await dynamo.send(
          new DescribeTableCommand({ TableName: name })
        );

        const table = describeResponse.Table;
        if (table) {
          tables.push({
            name,
            status: table.TableStatus || "UNKNOWN",
            itemCount: table.ItemCount,
            sizeBytes: table.TableSizeBytes,
          });
        }
      } catch (error: any) {
        console.error(`Error describing table ${name}:`, error.message);
      }
    }

    return tables;
  } catch (error: any) {
    console.error("Error scanning DynamoDB tables:", error.message);
    return [];
  }
}

/**
 * Scan Lambda functions (filter for email-related ones)
 */
export async function scanLambdaFunctions(
  region: string
): Promise<LambdaFunction[]> {
  const lambda = new LambdaClient({ region });
  const functions: LambdaFunction[] = [];

  try {
    // List all functions
    const listResponse = await lambda.send(new ListFunctionsCommand({}));
    const functionConfigs = listResponse.Functions || [];

    for (const func of functionConfigs) {
      if (func.FunctionName && func.FunctionArn) {
        functions.push({
          name: func.FunctionName,
          arn: func.FunctionArn,
          runtime: func.Runtime,
          handler: func.Handler,
        });
      }
    }

    return functions;
  } catch (error: any) {
    console.error("Error scanning Lambda functions:", error.message);
    return [];
  }
}

/**
 * Scan IAM roles (filter for Wraps or email-related ones)
 */
export async function scanIAMRoles(region: string): Promise<IAMRole[]> {
  const iam = new IAMClient({ region });
  const roles: IAMRole[] = [];

  try {
    // List all roles (with pagination support)
    let marker: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const listResponse = await iam.send(
        new ListRolesCommand({
          Marker: marker,
          MaxItems: 100,
        })
      );

      const roleList = listResponse.Roles || [];

      for (const role of roleList) {
        if (role.RoleName && role.Arn) {
          roles.push({
            name: role.RoleName,
            arn: role.Arn,
            assumeRolePolicyDocument: role.AssumeRolePolicyDocument || "",
          });
        }
      }

      marker = listResponse.Marker;
      hasMore = listResponse.IsTruncated ?? false;
    }

    return roles;
  } catch (error: any) {
    console.error("Error scanning IAM roles:", error.message);
    return [];
  }
}

/**
 * Scan all relevant AWS resources for email infrastructure
 */
export async function scanAWSResources(
  region: string
): Promise<AWSResourceScan> {
  const [
    identities,
    configurationSets,
    snsTopics,
    dynamoTables,
    lambdaFunctions,
    iamRoles,
  ] = await Promise.all([
    scanSESIdentities(region),
    scanSESConfigurationSets(region),
    scanSNSTopics(region),
    scanDynamoTables(region),
    scanLambdaFunctions(region),
    scanIAMRoles(region),
  ]);

  return {
    identities,
    configurationSets,
    snsTopics,
    dynamoTables,
    lambdaFunctions,
    iamRoles,
  };
}

/**
 * Filter resources to only Wraps-managed ones (wraps-* prefix)
 */
export function filterWrapsResources(scan: AWSResourceScan): AWSResourceScan {
  return {
    identities: scan.identities, // All identities are relevant
    configurationSets: scan.configurationSets.filter((cs) =>
      cs.name.startsWith("wraps-")
    ),
    snsTopics: scan.snsTopics.filter((t) => t.name.startsWith("wraps-")),
    dynamoTables: scan.dynamoTables.filter((t) => t.name.startsWith("wraps-")),
    lambdaFunctions: scan.lambdaFunctions.filter((f) =>
      f.name.startsWith("wraps-")
    ),
    iamRoles: scan.iamRoles.filter((r) => r.name.startsWith("wraps-")),
  };
}

/**
 * Check if specific Wraps resources exist
 */
export function checkWrapsResourcesExist(scan: AWSResourceScan): {
  hasConfigSet: boolean;
  hasSNSTopics: boolean;
  hasDynamoTable: boolean;
  hasLambdaFunctions: boolean;
  hasIAMRole: boolean;
} {
  const filtered = filterWrapsResources(scan);

  return {
    hasConfigSet: filtered.configurationSets.length > 0,
    hasSNSTopics: filtered.snsTopics.length > 0,
    hasDynamoTable: filtered.dynamoTables.length > 0,
    hasLambdaFunctions: filtered.lambdaFunctions.length > 0,
    hasIAMRole: filtered.iamRoles.length > 0,
  };
}
