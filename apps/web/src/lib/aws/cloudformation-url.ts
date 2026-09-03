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
 * Deep link to the customer's CloudFormation stack list, filtered to the
 * console-access stack. The starting point for repairing an existing
 * deployment: select the stack, then Update -> Replace existing template.
 * There is no quick-create equivalent for updates.
 *
 * Never offer this on self-hosted deployments: the template rewrites a role
 * trusting the Wraps platform account, the wrong principal when the dashboard
 * runs in the customer's own account.
 */
export function buildStacksConsoleUrl(region: string) {
  return `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks?filteringText=${CONSOLE_ACCESS_STACK_NAME}&filteringStatus=active`;
}
