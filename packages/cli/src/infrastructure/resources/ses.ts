import * as aws from '@pulumi/aws';

/**
 * SES resources configuration
 */
export interface SESResourcesConfig {
  domain?: string;
  region: string;
}

/**
 * SES resources output
 */
export interface SESResources {
  configSet: aws.ses.ConfigurationSet;
  bounceComplaintTopic: aws.sns.Topic;
  domainIdentity?: aws.sesv2.EmailIdentity;
  dkimTokens?: string[];
  dnsAutoCreated?: boolean;
}

/**
 * Create SES resources (configuration set, SNS topics, domain identity)
 */
export async function createSESResources(config: SESResourcesConfig): Promise<SESResources> {
  // Configuration set for tracking
  const configSet = new aws.ses.ConfigurationSet('byo-email-tracking', {
    name: 'byo-email-tracking',
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  // SNS topic for bounce/complaint notifications
  const bounceComplaintTopic = new aws.sns.Topic('byo-email-bounce-complaints', {
    name: 'byo-email-bounce-complaints',
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  // Event destination for bounces/complaints
  new aws.ses.EventDestination('byo-email-bounce-complaint-events', {
    name: 'byo-email-bounce-complaints',
    configurationSetName: configSet.name,
    enabled: true,
    matchingTypes: ['bounce', 'complaint'],
    snsDestination: {
      topicArn: bounceComplaintTopic.arn,
    },
  });

  // Event destination for engagement (opens, clicks, deliveries)
  new aws.ses.EventDestination('byo-email-engagement-events', {
    name: 'byo-email-engagement',
    configurationSetName: configSet.name,
    enabled: true,
    matchingTypes: ['send', 'delivery', 'open', 'click'],
    snsDestination: {
      topicArn: bounceComplaintTopic.arn,
    },
  });

  // Optional: Verify domain if provided
  let domainIdentity: aws.sesv2.EmailIdentity | undefined;
  let dkimTokens: string[] | undefined;
  let dnsAutoCreated = false;

  if (config.domain) {
    // Use SES v2 API to create email identity with configuration set
    domainIdentity = new aws.sesv2.EmailIdentity('byo-email-domain', {
      emailIdentity: config.domain,
      configurationSetName: configSet.name, // Link configuration set to domain
      dkimSigningAttributes: {
        nextSigningKeyLength: 'RSA_2048_BIT',
      },
      tags: {
        ManagedBy: 'byo-cli',
      },
    });

    // Extract DKIM tokens for DNS configuration
    dkimTokens = domainIdentity.dkimSigningAttributes.apply((attrs) => attrs?.tokens || []) as any;
  }

  return {
    configSet,
    bounceComplaintTopic,
    domainIdentity,
    dkimTokens,
    dnsAutoCreated: false, // Will be set after deployment
  };
}
