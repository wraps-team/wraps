import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Provider, IntegrationLevel } from '../../types/index.js';

/**
 * IAM role configuration
 */
export interface IAMRoleConfig {
  provider: Provider;
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  integrationLevel: IntegrationLevel;
}

/**
 * Create IAM role for email infrastructure
 */
export async function createIAMRole(config: IAMRoleConfig): Promise<aws.iam.Role> {
  // Build assume role policy based on provider
  let assumeRolePolicy: pulumi.Output<string>;

  if (config.provider === 'vercel' && config.oidcProvider) {
    assumeRolePolicy = pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Federated": "${config.oidcProvider.arn}"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "oidc.vercel.com/${config.vercelTeamSlug}:aud": "https://vercel.com/${config.vercelTeamSlug}"
          },
          "StringLike": {
            "oidc.vercel.com/${config.vercelTeamSlug}:sub": "owner:${config.vercelTeamSlug}:project:${config.vercelProjectName}:environment:*"
          }
        }
      }]
    }`;
  } else if (config.provider === 'aws') {
    // Native AWS - EC2, Lambda, ECS can assume
    assumeRolePolicy = pulumi.output(`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Service": ["lambda.amazonaws.com", "ec2.amazonaws.com", "ecs-tasks.amazonaws.com"]
        },
        "Action": "sts:AssumeRole"
      }]
    }`);
  } else {
    // Other providers - will use access keys
    throw new Error('Other providers not yet implemented');
  }

  const role = new aws.iam.Role('byo-email-role', {
    name: 'byo-email-role',
    assumeRolePolicy,
    tags: {
      ManagedBy: 'byo-cli',
      Provider: config.provider,
    },
  });

  // Attach policies based on integration level
  if (config.integrationLevel === 'dashboard-only') {
    // Read-only access
    new aws.iam.RolePolicy('byo-email-dashboard-read-policy', {
      role: role.name,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'ses:GetSendStatistics',
              'ses:ListIdentities',
              'ses:GetIdentityVerificationAttributes',
              'cloudwatch:GetMetricData',
              'cloudwatch:GetMetricStatistics',
              'logs:FilterLogEvents',
            ],
            Resource: '*',
          },
        ],
      }),
    });
  } else {
    // Enhanced - send + read access
    new aws.iam.RolePolicy('byo-email-policy', {
      role: role.name,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'ses:SendEmail',
              'ses:SendRawEmail',
              'ses:SendTemplatedEmail',
              'ses:GetSendStatistics',
              'ses:ListIdentities',
            ],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:PutItem',
              'dynamodb:GetItem',
              'dynamodb:Query',
              'dynamodb:Scan',
            ],
            Resource: 'arn:aws:dynamodb:*:*:table/byo-email-*',
          },
        ],
      }),
    });
  }

  return role;
}
