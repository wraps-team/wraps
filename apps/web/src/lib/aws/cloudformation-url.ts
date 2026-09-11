/**
 * The S3-hosted template that defines `wraps-console-access-role`, and the
 * stack name it is deployed under.
 *
 * A CloudFormation quick-create link built from these CREATES ONLY — it cannot
 * repair an existing connection. `StackName` "must be unique in the Region", so
 * submitting one for an account that already has the stack fails with
 * `AlreadyExists` (HTTP 400), and the template declares a fixed
 * `RoleName: wraps-console-access-role`, so it fails the same way when the role
 * exists without a stack — which is every account connected by
 * `wraps platform connect`, since that calls CreateRole directly.
 *
 * A customer whose trust policy broke therefore cannot be sent to a
 * quick-create link. Send them to `buildStacksConsoleUrl` and the
 * update-an-existing-stack flow instead.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stacks-quick-create-links.html
 */
export const CONSOLE_ACCESS_TEMPLATE_URL =
  "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-console-access-role.yaml";

export const CONSOLE_ACCESS_STACK_NAME = "wraps-console-access";

/**
 * The other template that creates `wraps-console-access-role`: the full email
 * infrastructure stack (`cloudformation/wraps-email-infrastructure.yaml`),
 * which declares the same role alongside SES, EventBridge, DynamoDB and Lambda
 * resources. An account deployed this way has NO `wraps-console-access` stack.
 */
export const EMAIL_INFRASTRUCTURE_TEMPLATE_URL =
  "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-email-infrastructure.yaml";

/**
 * Deep link to the customer's CloudFormation stack list, filtered to one stack.
 * The starting point for repairing an existing deployment: select the stack,
 * then Update -> Replace existing template. There is no quick-create
 * equivalent for updates.
 *
 * Never offer this on self-hosted deployments: the template rewrites a role
 * trusting the Wraps platform account, the wrong principal when the dashboard
 * runs in the customer's own account.
 */
export function buildStacksConsoleUrl(
  region: string,
  stackName: string = CONSOLE_ACCESS_STACK_NAME
) {
  return `https://console.aws.amazon.com/cloudformation/home?region=${encodeURIComponent(region)}#/stacks?filteringText=${encodeURIComponent(stackName)}&filteringStatus=active`;
}

const STACK_ID_PATTERN =
  /^arn:aws:cloudformation:([a-z0-9-]+):\d{12}:stack\/([^/]+)\/[a-f0-9-]+$/;

/**
 * The email infrastructure template sets the role's `sts:ExternalId` condition
 * to `${AWS::StackId}`, so an External ID that is a stack ARN names the exact
 * stack that owns the role — including a stack the customer renamed at create
 * time, and the region it lives in, which need not be `awsAccount.region`.
 *
 * `wraps platform connect` and the console-access quick-create both carry a
 * server-minted `wraps_<hex>` External ID instead, which says nothing about
 * provenance.
 */
export function parseStackExternalId(
  externalId: string
): { stackName: string; region: string } | null {
  const match = STACK_ID_PATTERN.exec(externalId.trim());
  if (!(match?.[1] && match[2])) {
    return null;
  }
  return { region: match[1], stackName: match[2] };
}

export type CloudFormationRepairRoute = {
  stackName: string;
  templateUrl: string;
  stacksConsoleUrl: string;
  /**
   * True when the External ID identified the stack. False means we are showing
   * the console-access defaults as a guess, because the External ID carries no
   * provenance.
   */
  identified: boolean;
};

/**
 * Resolve which stack a customer must update, and with which template.
 *
 * Getting this wrong is not cosmetic. An account deployed from the full
 * infrastructure template has one stack — `wraps-email-infrastructure` — and no
 * `wraps-console-access` stack at all, so the console-access defaults sent them
 * to an empty filtered stack list; and had they applied that template URL to
 * the stack they do have, Update -> Replace existing template would have
 * deleted every SES, EventBridge, DynamoDB and Lambda resource the template
 * omits.
 */
export function resolveCloudFormationRepairRoute(
  externalId: string,
  fallbackRegion: string
): CloudFormationRepairRoute {
  const stack = parseStackExternalId(externalId);

  if (!stack) {
    return {
      stackName: CONSOLE_ACCESS_STACK_NAME,
      templateUrl: CONSOLE_ACCESS_TEMPLATE_URL,
      stacksConsoleUrl: buildStacksConsoleUrl(fallbackRegion),
      identified: false,
    };
  }

  return {
    stackName: stack.stackName,
    templateUrl: EMAIL_INFRASTRUCTURE_TEMPLATE_URL,
    stacksConsoleUrl: buildStacksConsoleUrl(stack.region, stack.stackName),
    identified: true,
  };
}
