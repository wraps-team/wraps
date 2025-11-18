import * as aws from "@pulumi/aws";
import type { ArchiveRetention } from "../../types/index.js";

/**
 * DynamoDB configuration
 */
export type DynamoDBConfig = {
  retention?: ArchiveRetention;
};

/**
 * DynamoDB tables output
 */
export type DynamoDBTables = {
  emailHistory: aws.dynamodb.Table;
};

/**
 * Check if DynamoDB table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { DynamoDBClient, DescribeTableCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const dynamodb = new DynamoDBClient({});

    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === "ResourceNotFoundException") {
      return false;
    }
    console.error("Error checking for existing DynamoDB table:", error);
    return false;
  }
}

/**
 * Create DynamoDB tables for email tracking
 */
export async function createDynamoDBTables(
  _config?: DynamoDBConfig
): Promise<DynamoDBTables> {
  // Check if table already exists
  const tableName = "wraps-email-history";
  const exists = await tableExists(tableName);

  // Email history table (TTL is set based on retention in Lambda via expiresAt field)
  // Note: retention config is passed but TTL is actually managed by Lambda setting expiresAt
  const emailHistory = exists
    ? new aws.dynamodb.Table(
        tableName,
        {
          name: tableName,
          billingMode: "PAY_PER_REQUEST",
          hashKey: "messageId",
          rangeKey: "sentAt",
          attributes: [
            { name: "messageId", type: "S" },
            { name: "sentAt", type: "N" },
            { name: "accountId", type: "S" },
          ],
          globalSecondaryIndexes: [
            {
              name: "accountId-sentAt-index",
              hashKey: "accountId",
              rangeKey: "sentAt",
              projectionType: "ALL",
            },
          ],
          ttl: {
            enabled: true,
            attributeName: "expiresAt",
          },
          tags: {
            ManagedBy: "wraps-cli",
          },
        },
        {
          import: tableName, // Import existing table
        }
      )
    : new aws.dynamodb.Table(tableName, {
        name: tableName,
        billingMode: "PAY_PER_REQUEST",
        hashKey: "messageId",
        rangeKey: "sentAt",
        attributes: [
          { name: "messageId", type: "S" },
          { name: "sentAt", type: "N" },
          { name: "accountId", type: "S" },
        ],
        globalSecondaryIndexes: [
          {
            name: "accountId-sentAt-index",
            hashKey: "accountId",
            rangeKey: "sentAt",
            projectionType: "ALL",
          },
        ],
        ttl: {
          enabled: true,
          attributeName: "expiresAt",
        },
        tags: {
          ManagedBy: "wraps-cli",
        },
      });

  return {
    emailHistory,
  };
}
