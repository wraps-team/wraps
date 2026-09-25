/**
 * The SES Account dashboard for a region — where AWS's "Request production
 * access" button lives. Must stay identical to
 * `packages/cli/src/commands/email/init.ts`'s deep link.
 */
export function sesAccountDashboardUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/ses/home?region=${region}#/account`;
}
