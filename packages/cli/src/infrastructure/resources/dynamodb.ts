import * as aws from '@pulumi/aws';

/**
 * DynamoDB tables output
 */
export interface DynamoDBTables {
  emailHistory: aws.dynamodb.Table;
}

/**
 * Create DynamoDB tables for email tracking
 */
export async function createDynamoDBTables(): Promise<DynamoDBTables> {
  // Email history table
  const emailHistory = new aws.dynamodb.Table('byo-email-history', {
    name: 'byo-email-history',
    billingMode: 'PAY_PER_REQUEST',
    hashKey: 'messageId',
    rangeKey: 'sentAt',
    attributes: [
      { name: 'messageId', type: 'S' },
      { name: 'sentAt', type: 'N' },
      { name: 'accountId', type: 'S' },
    ],
    globalSecondaryIndexes: [
      {
        name: 'accountId-sentAt-index',
        hashKey: 'accountId',
        rangeKey: 'sentAt',
        projectionType: 'ALL',
      },
    ],
    ttl: {
      enabled: true,
      attributeName: 'expiresAt',
    },
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  return {
    emailHistory,
  };
}
