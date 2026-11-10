import type { WrapsEmailConfig } from "../../types/index.js";

/**
 * Core IAM actions required for any email deployment
 */
const CORE_IAM_ACTIONS = [
  "iam:CreateRole",
  "iam:GetRole",
  "iam:PutRolePolicy",
  "iam:DeleteRole",
  "iam:DeleteRolePolicy",
  "iam:TagRole",
  "ses:CreateConfigurationSet",
  "ses:DeleteConfigurationSet",
  "ses:CreateEmailIdentity",
  "ses:DeleteEmailIdentity",
  "ses:GetEmailIdentity",
  "ses:PutEmailIdentityDkimAttributes",
  "s3:HeadBucket",
  "s3:CreateBucket",
  "s3:GetObject",
  "s3:PutObject",
];

/**
 * IAM actions required for event tracking (EventBridge, SQS)
 */
const EVENT_TRACKING_ACTIONS = [
  "events:CreateEventBus",
  "events:DeleteEventBus",
  "events:PutRule",
  "events:DeleteRule",
  "events:PutTargets",
  "events:RemoveTargets",
  "sqs:CreateQueue",
  "sqs:DeleteQueue",
  "sqs:SetQueueAttributes",
  "sqs:GetQueueAttributes",
];

/**
 * IAM actions required for DynamoDB history storage
 */
const DYNAMODB_ACTIONS = [
  "dynamodb:CreateTable",
  "dynamodb:DeleteTable",
  "dynamodb:DescribeTable",
  "dynamodb:UpdateTable",
  "dynamodb:TagResource",
];

/**
 * IAM actions required for Lambda functions
 */
const LAMBDA_ACTIONS = [
  "lambda:CreateFunction",
  "lambda:DeleteFunction",
  "lambda:UpdateFunctionCode",
  "lambda:UpdateFunctionConfiguration",
  "lambda:GetFunction",
  "lambda:AddPermission",
  "lambda:RemovePermission",
  "lambda:CreateEventSourceMapping",
  "lambda:DeleteEventSourceMapping",
];

/**
 * Result of an IAM permission check
 */
export type IAMCheckResult = {
  /** Whether the check was successful (user has permissions or check was skipped) */
  success: boolean;
  /** Actions that were denied */
  deniedActions: string[];
  /** Actions that were allowed */
  allowedActions: string[];
  /** Whether the check was skipped (e.g., user lacks iam:SimulatePrincipalPolicy) */
  skipped: boolean;
  /** Reason for skipping the check */
  skipReason?: string;
};

/**
 * Gets the list of IAM actions required based on email configuration
 */
export function getRequiredActions(config: WrapsEmailConfig): string[] {
  const actions = [...CORE_IAM_ACTIONS];

  // Add event tracking permissions if enabled
  if (config.eventTracking?.enabled) {
    actions.push(...EVENT_TRACKING_ACTIONS);
  }

  // Add DynamoDB permissions if history storage enabled
  if (config.eventTracking?.dynamoDBHistory) {
    actions.push(...DYNAMODB_ACTIONS);
    actions.push(...LAMBDA_ACTIONS);
  }

  return [...new Set(actions)]; // Remove duplicates
}

/**
 * Check IAM permissions before deployment using SimulatePrincipalPolicy
 *
 * This provides early feedback to users about missing permissions,
 * rather than failing 30+ seconds into deployment.
 *
 * @param userArn - The ARN of the IAM user/role to check
 * @param actions - List of IAM actions to check
 * @param region - AWS region for the IAM client
 * @returns Result of the permission check
 */
export async function checkIAMPermissions(
  userArn: string,
  actions: string[],
  region: string
): Promise<IAMCheckResult> {
  try {
    const { IAMClient, SimulatePrincipalPolicyCommand } = await import(
      "@aws-sdk/client-iam"
    );

    const client = new IAMClient({ region });

    // Simulate the policy for all required actions
    // Note: SimulatePrincipalPolicy can only check up to 100 actions at once
    const batchSize = 100;
    const batches: string[][] = [];
    for (let i = 0; i < actions.length; i += batchSize) {
      batches.push(actions.slice(i, i + batchSize));
    }

    const allowedActions: string[] = [];
    const deniedActions: string[] = [];

    for (const batch of batches) {
      const command = new SimulatePrincipalPolicyCommand({
        PolicySourceArn: userArn,
        ActionNames: batch,
        // Use a wildcard resource since we're checking general permissions
        // More specific resource-level checks could be added later
        ResourceArns: ["*"],
      });

      const response = await client.send(command);

      for (const result of response.EvaluationResults || []) {
        const actionName = result.EvalActionName;
        const decision = result.EvalDecision;

        if (decision === "allowed") {
          if (actionName) {
            allowedActions.push(actionName);
          }
        } else if (actionName) {
          deniedActions.push(actionName);
        }
      }
    }

    return {
      success: deniedActions.length === 0,
      deniedActions,
      allowedActions,
      skipped: false,
    };
  } catch (error: unknown) {
    // Handle case where user lacks SimulatePrincipalPolicy permission
    // This is a common scenario - we should warn but not fail
    if (
      error instanceof Error &&
      (error.name === "AccessDenied" ||
        error.name === "AccessDeniedException" ||
        error.message?.includes("AccessDenied") ||
        error.message?.includes("iam:SimulatePrincipalPolicy"))
    ) {
      return {
        success: true, // Don't block on this
        deniedActions: [],
        allowedActions: [],
        skipped: true,
        skipReason:
          "Unable to verify permissions (iam:SimulatePrincipalPolicy not allowed). " +
          "Deployment will proceed, but may fail if permissions are missing.",
      };
    }

    // For other errors, also skip but with different message
    return {
      success: true,
      deniedActions: [],
      allowedActions: [],
      skipped: true,
      skipReason: `Permission check failed: ${error instanceof Error ? error.message : "Unknown error"}. Proceeding with deployment.`,
    };
  }
}

/**
 * Format denied actions for display
 */
export function formatDeniedActions(actions: string[]): string {
  if (actions.length === 0) {
    return "";
  }

  // Group by service
  const byService: Record<string, string[]> = {};
  for (const action of actions) {
    const [service, actionName] = action.split(":");
    if (!byService[service]) {
      byService[service] = [];
    }
    byService[service].push(actionName);
  }

  const lines: string[] = ["Missing permissions:"];
  for (const [service, serviceActions] of Object.entries(byService)) {
    lines.push(`  ${service.toUpperCase()}:`);
    for (const action of serviceActions) {
      lines.push(`    - ${service}:${action}`);
    }
  }

  lines.push("");
  lines.push(
    "Write the IAM policies to attach: `wraps permissions --policy-dir ./wraps-policy`"
  );

  return lines.join("\n");
}
