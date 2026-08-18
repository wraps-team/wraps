/**
 * Scope language for the emails chart.
 *
 * Volume counts come from Postgres `message_send`, the authoritative store for
 * anything the emails list claims, filtered on the same predicate the table
 * uses — so the chart and the table describe one population and need no
 * disclaimer between them. Only the reputation figure is account-scoped, and it
 * says so.
 */

export type ReputationScope = "ses-account" | "window" | "none";

export type EmailChartMeta = {
  reputationScope: ReputationScope;
  awsAccountCount: number;
  awsAccountsUnavailable: number;
  /**
   * Epoch ms the payload was computed. Cached alongside the payload, so it is
   * the age of these numbers rather than the age of the request that got them.
   */
  generatedAt: number;
};

/**
 * What the emails list and its chart cover.
 *
 * Names the one gap a reader would otherwise discover the hard way: mail this
 * AWS account sent outside Wraps is not here.
 */
export const EMAIL_COVERAGE_EXPLAINER =
  "This list shows every message Wraps sent for you, plus every message your SES account reported an event for. Mail sent from this AWS account outside Wraps won't appear here.";

/**
 * Heading and scope line for the reputation tile.
 *
 * SES reputation is an account-lifetime rolling rate and has nothing to do with
 * the selected window, so it must not read as a window-scoped count. When
 * reputation is unavailable the tile falls back to window arithmetic, and says
 * that instead.
 */
export function reputationScopeLabel(
  scope: ReputationScope,
  awsAccountCount: number
): { title: string; detail: string } {
  switch (scope) {
    case "ses-account":
      return {
        title: "Account reputation",
        detail:
          awsAccountCount > 1
            ? `SES all-time rate, worst of ${awsAccountCount} AWS accounts`
            : "SES all-time rate for this AWS account",
      };
    case "window":
      return {
        title: "Bounces and complaints",
        detail: "Share of sends in the selected window",
      };
    default:
      return {
        title: "Account reputation",
        detail: "SES has not published a rate yet",
      };
  }
}

/**
 * Says the reputation figure is incomplete when an AWS account did not answer.
 *
 * Scoped to reputation only: the volume counts come from Postgres and are
 * unaffected by a CloudWatch failure.
 */
export function reputationPartialLabel(meta: EmailChartMeta): string | null {
  if (meta.awsAccountsUnavailable === 0) {
    return null;
  }
  return `${meta.awsAccountsUnavailable} of ${meta.awsAccountCount} AWS accounts did not report reputation`;
}

/**
 * Which population the bounce/complaint rates in a payload describe.
 *
 * `ses-account` means SES published its own rolling account-lifetime rate — the
 * number the SES console shows, and the one enforcement acts on. `window` means
 * SES has published nothing and the figure was computed from sends inside the
 * selected range instead. `none` means neither is available.
 *
 * Shared by every route that pairs Postgres volume with CloudWatch reputation,
 * so the two sources can never be labelled inconsistently across the dashboard.
 */
export function resolveReputationScope(
  hasReputation: boolean,
  effectiveSent: number
): ReputationScope {
  if (hasReputation) {
    return "ses-account";
  }
  return effectiveSent > 0 ? "window" : "none";
}
