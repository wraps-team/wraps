/**
 * SES Receipt Rules for inbound email
 *
 * Uses SES v1 API (classic receipt rules) because SES v2 does not support receipt rules.
 * These must be managed via the AWS SDK rather than Pulumi (limited Pulumi support).
 *
 * Every function that writes the rule's actions takes the trigger mode
 * (design: plans/inbound-envelope §4.2). Every `UpdateReceiptRule` sends the
 * whole rule, copied from a fresh `DescribeReceiptRule`: AWS defaults an
 * omitted `Enabled` to false and an omitted `Recipients` to every verified
 * domain in the account.
 */

import {
  CreateReceiptRuleCommand,
  CreateReceiptRuleSetCommand,
  DeleteReceiptRuleCommand,
  DeleteReceiptRuleSetCommand,
  DescribeActiveReceiptRuleSetCommand,
  DescribeReceiptRuleCommand,
  type ReceiptAction,
  type ReceiptRule,
  SESClient,
  SetActiveReceiptRuleSetCommand,
  UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import { INBOUND_LEGACY_PREFIX, INBOUND_MAIL_PREFIX } from "@wraps/core";
import type { InboundTrigger } from "../../types/index.js";
import {
  INBOUND_PROCESSOR_FUNCTION_NAME,
  inboundProcessorArn,
  RULE_NAME,
  RULE_SET_NAME,
} from "./inbound-names.js";

/**
 * Create SES client for a specific region
 */
function createSESClient(region: string): SESClient {
  return new SESClient({ region });
}

function isRuleNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "RuleDoesNotExistException" ||
      error.name === "RuleSetDoesNotExistException")
  );
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
 * The rule actions for a trigger mode (design §4.1):
 * - "s3-notification": store under `raw/` (a bucket notification invokes the
 *   processor);
 * - "ses-lambda-action": store under `mail/`, then invoke the processor
 *   asynchronously with the SES event.
 * Never `raw/` with a Lambda action: that would hand every message to both
 * triggers.
 */
export function inboundRuleActions(
  region: string,
  accountId: string,
  bucketName: string,
  trigger: InboundTrigger
): ReceiptAction[] {
  if (trigger === "s3-notification") {
    return [
      {
        S3Action: {
          BucketName: bucketName,
          ObjectKeyPrefix: INBOUND_LEGACY_PREFIX,
        },
      },
    ];
  }
  return [
    {
      S3Action: {
        BucketName: bucketName,
        ObjectKeyPrefix: INBOUND_MAIL_PREFIX,
      },
    },
    {
      LambdaAction: {
        FunctionArn: inboundProcessorArn(region, accountId),
        InvocationType: "Event",
      },
    },
  ];
}

/**
 * Which trigger mode a rule's actions implement: "missing" when there is no
 * rule, "unknown" for any shape Wraps never writes.
 */
export function receiptRuleTriggerOf(
  rule: ReceiptRule | null | undefined
): InboundTrigger | "missing" | "unknown" {
  if (!rule) {
    return "missing";
  }
  const actions = rule.Actions ?? [];
  const prefixes = actions
    .map((a) => a.S3Action?.ObjectKeyPrefix)
    .filter((p): p is string => p !== undefined);
  const lambdaActions = actions.filter((a) => a.LambdaAction);
  const invokesProcessor = lambdaActions.some((a) =>
    a.LambdaAction?.FunctionArn?.endsWith(
      `:function:${INBOUND_PROCESSOR_FUNCTION_NAME}`
    )
  );

  if (
    prefixes.length === 1 &&
    prefixes[0] === INBOUND_MAIL_PREFIX &&
    lambdaActions.length === 1 &&
    invokesProcessor
  ) {
    return "ses-lambda-action";
  }
  if (
    prefixes.length === 1 &&
    prefixes[0] === INBOUND_LEGACY_PREFIX &&
    lambdaActions.length === 0
  ) {
    return "s3-notification";
  }
  return "unknown";
}

/**
 * Describe the wraps receipt rule. Returns null when the rule or its rule
 * set does not exist; any other error propagates.
 */
export async function describeInboundReceiptRule(
  region: string
): Promise<ReceiptRule | null> {
  const ses = createSESClient(region);
  try {
    const response = await ses.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        RuleName: RULE_NAME,
      })
    );
    return response.Rule ?? null;
  } catch (error: unknown) {
    if (isRuleNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function assertNoLegacyLambdaPair(actions: ReceiptAction[] | undefined): void {
  const list = actions ?? [];
  const legacyS3 = list.some(
    (a) => a.S3Action?.ObjectKeyPrefix === INBOUND_LEGACY_PREFIX
  );
  const lambda = list.some((a) => a.LambdaAction);
  if (legacyS3 && lambda) {
    throw new Error(
      `Refusing to write receipt rule ${RULE_NAME}: an S3 action on ${INBOUND_LEGACY_PREFIX} together with a Lambda action would process every message twice.`
    );
  }
}

/**
 * The whole rule for an `UpdateReceiptRule`: Name, Recipients, Enabled,
 * ScanEnabled and TlsPolicy copied from the described rule, with only the
 * passed fields replaced. Throws rather than send empty Recipients (AWS
 * would widen the rule to every verified domain).
 */
export function buildReceiptRuleUpdate(
  described: ReceiptRule,
  changes: { Recipients?: string[]; Actions?: ReceiptAction[] }
): ReceiptRule {
  const recipients = changes.Recipients ?? described.Recipients ?? [];
  if (recipients.length === 0) {
    throw new Error(
      `Refusing to update receipt rule ${RULE_NAME} with no recipients: SES would apply it to every verified domain in the account.`
    );
  }
  const actions = changes.Actions ?? described.Actions;
  assertNoLegacyLambdaPair(actions);
  return {
    Name: described.Name ?? RULE_NAME,
    Recipients: recipients,
    Enabled: described.Enabled,
    ScanEnabled: described.ScanEnabled,
    TlsPolicy: described.TlsPolicy,
    Actions: actions,
  };
}

/** Test seam: replaced in tests so the retry backoff runs instantly. */
export const receiptRuleRetryHooks = {
  sleep: (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Backoff between attempts; about 30 s in total. */
export const RECEIPT_RULE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15_000];

const RETRYABLE_RULE_WRITE_ERRORS = new Set([
  // SES checks it can invoke the function when the rule is written; a
  // permission created seconds earlier may not have propagated yet.
  "InvalidLambdaFunctionException",
  // Same for the bucket policy SES needs to write the object.
  "InvalidS3ConfigurationException",
]);

/**
 * Run a rule write (Create/Update), retrying SES's "can't use the function /
 * bucket yet" errors with backoff for about 30 seconds, then throwing.
 */
export async function withReceiptRuleRetry<T>(
  write: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (error: unknown) {
      const retryable =
        error instanceof Error && RETRYABLE_RULE_WRITE_ERRORS.has(error.name);
      if (!retryable || attempt >= RECEIPT_RULE_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await receiptRuleRetryHooks.sleep(RECEIPT_RULE_RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function sendRuleUpdate(
  region: string,
  rule: ReceiptRule
): Promise<void> {
  const ses = createSESClient(region);
  await withReceiptRuleRetry(() =>
    ses.send(
      new UpdateReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        Rule: rule,
      })
    )
  );
}

/**
 * Create or update the catch-all receipt rule for `receivingDomain`, with the
 * actions for `trigger`. When the rule exists it is updated in place: the
 * domain is merged into its Recipients (keeping `r.mail.*` reply domains and
 * every other domain) and its flags are kept. It never deletes the rule.
 */
export async function createReceiptRule(
  region: string,
  accountId: string,
  receivingDomain: string,
  s3BucketName: string,
  trigger: InboundTrigger
): Promise<void> {
  const actions = inboundRuleActions(region, accountId, s3BucketName, trigger);
  const described = await describeInboundReceiptRule(region);

  if (described) {
    const current = described.Recipients ?? [];
    const recipients = current.includes(receivingDomain)
      ? current
      : [...current, receivingDomain];
    await sendRuleUpdate(
      region,
      buildReceiptRuleUpdate(described, {
        Recipients: recipients,
        Actions: actions,
      })
    );
    return;
  }

  const ses = createSESClient(region);
  await withReceiptRuleRetry(() =>
    ses.send(
      new CreateReceiptRuleCommand({
        RuleSetName: RULE_SET_NAME,
        Rule: {
          Name: RULE_NAME,
          Enabled: true,
          ScanEnabled: true, // Enable spam and virus scanning
          Recipients: [receivingDomain], // Match all emails to this domain
          Actions: actions,
        },
      })
    )
  );
}

/**
 * Replace the actions of the existing rule with those for `trigger`, keeping
 * everything else (design §4.4 step 2). Throws when no rule exists: the
 * caller handles that case (nothing to switch).
 */
export async function syncReceiptRuleTrigger(
  region: string,
  accountId: string,
  s3BucketName: string,
  trigger: InboundTrigger
): Promise<void> {
  const described = await describeInboundReceiptRule(region);
  if (!described) {
    throw new Error(
      `Receipt rule ${RULE_NAME} in ${RULE_SET_NAME} does not exist; there is no trigger to switch.`
    );
  }
  await sendRuleUpdate(
    region,
    buildReceiptRuleUpdate(described, {
      Actions: inboundRuleActions(region, accountId, s3BucketName, trigger),
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
 * Add a domain to the existing receipt rule's Recipients list, keeping its
 * actions. If the rule or rule set doesn't exist, creates them with this
 * domain and the actions for `trigger` (the mode the most recent deploy used).
 */
export async function addDomainToReceiptRule(
  region: string,
  accountId: string,
  domain: string,
  s3BucketName: string,
  trigger: InboundTrigger
): Promise<void> {
  const described = await describeInboundReceiptRule(region);

  if (!described) {
    // Rule/set doesn't exist — create from scratch
    await createReceiptRuleSet(region);
    await createReceiptRule(region, accountId, domain, s3BucketName, trigger);
    await setActiveReceiptRuleSet(region, RULE_SET_NAME);
    return;
  }

  const existingRecipients = described.Recipients ?? [];
  if (existingRecipients.includes(domain)) {
    return; // Already present
  }

  await sendRuleUpdate(
    region,
    buildReceiptRuleUpdate(described, {
      Recipients: [...existingRecipients, domain],
    })
  );
}

/**
 * Remove a domain from the receipt rule's Recipients list.
 * If no domains remain after removal, deletes the rule entirely.
 */
export async function removeDomainFromReceiptRule(
  region: string,
  domain: string
): Promise<void> {
  const described = await describeInboundReceiptRule(region);
  if (!described) {
    return; // Nothing to remove
  }

  const existingRecipients = described.Recipients ?? [];
  const updated = existingRecipients.filter((r) => r !== domain);

  if (updated.length === 0) {
    // No domains left — delete the rule
    await deleteReceiptRule(region);
    return;
  }

  if (updated.length === existingRecipients.length) {
    return; // Domain was not on the rule
  }

  await sendRuleUpdate(
    region,
    buildReceiptRuleUpdate(described, { Recipients: updated })
  );
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

export { RULE_NAME, RULE_SET_NAME } from "./inbound-names.js";
