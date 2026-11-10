/**
 * SES Receipt Rules for inbound email
 *
 * Uses SES v1 API (classic receipt rules) because SES v2 does not support receipt rules.
 * These must be managed via the AWS SDK rather than Pulumi (limited Pulumi support).
 *
 * The rule's S3 action also names an SNS topic. SES publishes its receipt
 * notification there for every stored message: the SMTP envelope
 * (`receipt.recipients`, `mail.source`), the spam/virus/SPF/DKIM/DMARC
 * verdicts and the S3 object key. The envelope exists nowhere else — the raw
 * MIME in S3 does not carry Bcc or forwarded recipients — so consumers that
 * need it subscribe to the topic.
 */

import {
  CreateReceiptRuleCommand,
  CreateReceiptRuleSetCommand,
  DeleteReceiptRuleCommand,
  DeleteReceiptRuleSetCommand,
  DescribeActiveReceiptRuleSetCommand,
  DescribeReceiptRuleCommand,
  SESClient,
  SetActiveReceiptRuleSetCommand,
  UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SetTopicAttributesCommand,
  SNSClient,
} from "@aws-sdk/client-sns";

const RULE_SET_NAME = "wraps-inbound-rules";
const RULE_NAME = "wraps-inbound-catch-all";
const RECEIPT_TOPIC_NAME = "wraps-inbound-receipts";

/**
 * Create SES client for a specific region
 */
function createSESClient(region: string): SESClient {
  return new SESClient({ region });
}

/**
 * Create the wraps-inbound-rules receipt rule set
 */
export async function createReceiptRuleSet(region: string): Promise<void> {
  const ses = createSESClient(region);

  try {
    await ses.send(
      new CreateReceiptRuleSetCommand({
        RuleSetName: RULE_SET_NAME,
      })
    );
  } catch (error: unknown) {
    // Ignore if already exists
    if (error instanceof Error && error.name === "AlreadyExistsException") {
      return;
    }
    throw error;
  }
}

/**
 * ARN of the SNS topic SES publishes inbound receipt notifications to
 */
export function getReceiptTopicArn(region: string, accountId: string): string {
  return `arn:aws:sns:${region}:${accountId}:${RECEIPT_TOPIC_NAME}`;
}

/**
 * Create the receipt notification topic (idempotent) and let SES publish to
 * it from this account's wraps-inbound-rules rule set only.
 * Returns the topic ARN.
 */
export async function ensureReceiptTopic(region: string): Promise<string> {
  const sns = new SNSClient({ region });

  const { TopicArn } = await sns.send(
    new CreateTopicCommand({
      Name: RECEIPT_TOPIC_NAME,
      Tags: [
        { Key: "ManagedBy", Value: "wraps-cli" },
        { Key: "Service", Value: "email-inbound" },
      ],
    })
  );
  if (!TopicArn) {
    throw new Error("SNS did not return an ARN for the receipt topic");
  }

  const accountId = TopicArn.split(":")[4];
  await sns.send(
    new SetTopicAttributesCommand({
      TopicArn,
      AttributeName: "Policy",
      AttributeValue: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowSESReceiptPublish",
            Effect: "Allow",
            Principal: { Service: "ses.amazonaws.com" },
            Action: "SNS:Publish",
            Resource: TopicArn,
            Condition: {
              StringEquals: { "AWS:SourceAccount": accountId },
              ArnLike: {
                "AWS:SourceArn": `arn:aws:ses:${region}:${accountId}:receipt-rule-set/${RULE_SET_NAME}:receipt-rule/*`,
              },
            },
          },
        ],
      }),
    })
  );

  return TopicArn;
}

/**
 * Delete the receipt notification topic (cleanup). Subscriptions go with it.
 */
export async function deleteReceiptTopic(
  region: string,
  accountId: string
): Promise<void> {
  const sns = new SNSClient({ region });

  // DeleteTopic is idempotent: a topic that does not exist is not an error.
  await sns.send(
    new DeleteTopicCommand({ TopicArn: getReceiptTopicArn(region, accountId) })
  );
}

/**
 * Create a catch-all receipt rule that stores emails in S3 and publishes the
 * receipt notification to SNS
 */
export async function createReceiptRule(
  region: string,
  receivingDomain: string,
  s3BucketName: string
): Promise<void> {
  const ses = createSESClient(region);

  // Check if rule already exists
  try {
    await ses.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );
    // Rule exists - delete it so we can recreate with updated config
    await ses.send(
      new DeleteReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name !== "RuleDoesNotExistException" &&
      error.name !== "RuleSetDoesNotExistException"
    ) {
      throw error;
    }
  }

  const topicArn = await ensureReceiptTopic(region);

  await ses.send(
    new CreateReceiptRuleCommand({
      RuleSetName: RULE_SET_NAME,
      Rule: {
        Name: RULE_NAME,
        Enabled: true,
        ScanEnabled: true, // Enable spam and virus scanning
        Recipients: [receivingDomain], // Match all emails to this domain
        Actions: [
          {
            S3Action: {
              BucketName: s3BucketName,
              ObjectKeyPrefix: "raw/",
              TopicArn: topicArn,
            },
          },
        ],
      },
    })
  );
}

/**
 * Get the currently active receipt rule set
 */
export async function getActiveReceiptRuleSet(
  region: string
): Promise<string | null> {
  const ses = createSESClient(region);

  try {
    const response = await ses.send(
      new DescribeActiveReceiptRuleSetCommand({})
    );
    return response.Metadata?.Name || null;
  } catch {
    return null;
  }
}

/**
 * Set the active receipt rule set
 * Returns the name of any previously active rule set (for warning purposes)
 */
export async function setActiveReceiptRuleSet(
  region: string,
  ruleSetName: string
): Promise<string | null> {
  const ses = createSESClient(region);

  // Check what's currently active
  const currentActive = await getActiveReceiptRuleSet(region);

  if (currentActive === ruleSetName) {
    // Already active
    return null;
  }

  await ses.send(
    new SetActiveReceiptRuleSetCommand({
      RuleSetName: ruleSetName,
    })
  );

  return currentActive;
}

/**
 * Delete the receipt rule (cleanup)
 */
export async function deleteReceiptRule(region: string): Promise<void> {
  const ses = createSESClient(region);

  try {
    await ses.send(
      new DeleteReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );
  } catch (error: unknown) {
    // Ignore if rule or rule set doesn't exist
    if (
      error instanceof Error &&
      (error.name === "RuleDoesNotExistException" ||
        error.name === "RuleSetDoesNotExistException")
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Deactivate and delete the receipt rule set (cleanup)
 */
export async function deleteReceiptRuleSet(region: string): Promise<void> {
  const ses = createSESClient(region);

  // Deactivate if this is the active rule set
  const activeRuleSet = await getActiveReceiptRuleSet(region);
  if (activeRuleSet === RULE_SET_NAME) {
    await ses.send(new SetActiveReceiptRuleSetCommand({}));
  }

  try {
    await ses.send(
      new DeleteReceiptRuleSetCommand({
        RuleSetName: RULE_SET_NAME,
      })
    );
  } catch (error: unknown) {
    // Ignore if doesn't exist
    if (
      error instanceof Error &&
      error.name === "RuleSetDoesNotExistException"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Add a domain to the existing receipt rule's Recipients list.
 * If the rule or rule set doesn't exist, creates them with this domain.
 */
export async function addDomainToReceiptRule(
  region: string,
  domain: string,
  s3BucketName: string
): Promise<void> {
  const ses = createSESClient(region);

  try {
    const response = await ses.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );

    const existingRecipients = response.Rule?.Recipients ?? [];
    if (existingRecipients.includes(domain)) {
      return; // Already present
    }

    await ses.send(
      new UpdateReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        Rule: {
          Name: RULE_NAME,
          Enabled: response.Rule?.Enabled,
          ScanEnabled: response.Rule?.ScanEnabled,
          TlsPolicy: response.Rule?.TlsPolicy,
          Actions: response.Rule?.Actions,
          Recipients: [...existingRecipients, domain],
        },
      })
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "RuleDoesNotExistException" ||
        error.name === "RuleSetDoesNotExistException")
    ) {
      // Rule/set doesn't exist — create from scratch
      await createReceiptRuleSet(region);
      await createReceiptRule(region, domain, s3BucketName);
      await setActiveReceiptRuleSet(region, RULE_SET_NAME);
      return;
    }
    throw error;
  }
}

/**
 * Remove a domain from the receipt rule's Recipients list.
 * If no domains remain after removal, deletes the rule entirely.
 */
export async function removeDomainFromReceiptRule(
  region: string,
  domain: string
): Promise<void> {
  const ses = createSESClient(region);

  try {
    const response = await ses.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );

    const existingRecipients = response.Rule?.Recipients ?? [];
    const updated = existingRecipients.filter((r) => r !== domain);

    if (updated.length === 0) {
      // No domains left — delete the rule
      await deleteReceiptRule(region);
      return;
    }

    await ses.send(
      new UpdateReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        Rule: {
          Name: RULE_NAME,
          Enabled: response.Rule?.Enabled,
          ScanEnabled: response.Rule?.ScanEnabled,
          TlsPolicy: response.Rule?.TlsPolicy,
          Actions: response.Rule?.Actions,
          Recipients: updated,
        },
      })
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "RuleDoesNotExistException" ||
        error.name === "RuleSetDoesNotExistException")
    ) {
      return; // Nothing to remove
    }
    throw error;
  }
}

/**
 * Get the current list of domains in the receipt rule.
 */
export async function getReceiptRuleDomains(region: string): Promise<string[]> {
  const ses = createSESClient(region);

  try {
    const response = await ses.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );

    return response.Rule?.Recipients ?? [];
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "RuleDoesNotExistException" ||
        error.name === "RuleSetDoesNotExistException")
    ) {
      return [];
    }
    throw error;
  }
}

export { RECEIPT_TOPIC_NAME, RULE_NAME, RULE_SET_NAME };
