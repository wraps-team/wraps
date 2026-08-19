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

/**
 * How far back to look for a published SES reputation rate.
 *
 * SES publishes `Reputation.BounceRate` / `Reputation.ComplaintRate` only while
 * the account is actively sending. A lookback shorter than an ordinary sending
 * pause therefore makes a healthy account look like one that has no rate at
 * all, and the tile then silently relabels itself onto window arithmetic - a
 * different population behind the same heading, with no user action. 90 days
 * covers a quarter-long pause (campaign and seasonal senders) and sits well
 * inside CloudWatch's 15-month retention for daily-period datapoints.
 *
 * Lives here, not in the CloudWatch module, because the copy below quotes it
 * and this module must stay free of server-only imports.
 */
export const REPUTATION_LOOKBACK_DAYS = 90;

/**
 * How old a published rate may be before the tile says so out loud.
 *
 * SES republishes daily while sending, so anything past a couple of days means
 * sending has paused and the reader deserves to know the number is not live.
 */
export const REPUTATION_STALE_AFTER_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type EmailChartMeta = {
  reputationScope: ReputationScope;
  awsAccountCount: number;
  awsAccountsUnavailable: number;
  /**
   * Epoch ms SES last published the reputation rate carried in this payload, or
   * null when no AWS account has ever published one.
   *
   * This is the real datapoint timestamp from CloudWatch, not the time of the
   * read: a rate SES stopped republishing a week ago must not present itself as
   * current. Across several AWS accounts it is the OLDEST contributing
   * timestamp, so the freshness claim holds for every number on the tile.
   */
  reputationAsOf: number | null;
  /**
   * Epoch ms the payload was computed. Cached alongside the payload, so it is
   * the age of these numbers rather than the age of the request that got them.
   */
  generatedAt: number;
};

export type ReputationLabel = {
  title: string;
  detail: string;
  /** Second line, present only when the tile owes the reader an explanation. */
  note: string | null;
};

/**
 * Whole days between SES publishing the rate and this payload being computed.
 *
 * Both ends are server-side epoch ms from the same payload, so the answer is
 * deterministic and identical on server and client - no reading the browser
 * clock during render.
 */
export function reputationAgeDays(meta: EmailChartMeta): number | null {
  if (meta.reputationAsOf === null) {
    return null;
  }
  const ageMs = meta.generatedAt - meta.reputationAsOf;
  return ageMs <= 0 ? 0 : Math.floor(ageMs / DAY_MS);
}

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
 * the selected window, so it must not read as a window-scoped count.
 *
 * A rate SES published days ago is still the account's real rate, so it keeps
 * the account heading and dates itself. It does NOT become window arithmetic:
 * swapping populations behind an unchanged heading is how a paused sender's
 * tile jumps by orders of magnitude with nothing to explain it. Window
 * arithmetic is reserved for accounts SES has never rated at all.
 */
export function reputationScopeLabel(meta: EmailChartMeta): ReputationLabel {
  switch (meta.reputationScope) {
    case "ses-account": {
      const source =
        meta.awsAccountCount > 1
          ? `SES all-time rate, worst of ${meta.awsAccountCount} AWS accounts`
          : "SES all-time rate for this AWS account";
      const ageDays = reputationAgeDays(meta);
      if (ageDays === null || ageDays < REPUTATION_STALE_AFTER_DAYS) {
        return { title: "Account reputation", detail: source, note: null };
      }
      return {
        title: "Account reputation",
        detail: `${source}, last published ${ageDays} days ago`,
        note: "SES publishes this rate only while the account is sending.",
      };
    }
    case "window":
      return {
        title: "Bounces and complaints",
        detail: "Share of sends in the selected window",
        note: `SES has not published an account rate in the last ${REPUTATION_LOOKBACK_DAYS} days.`,
      };
    default:
      return {
        title: "Account reputation",
        detail: "SES has not published a rate yet",
        note: null,
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
 * number the SES console shows, and the one enforcement acts on, however
 * recently it was published. `window` means SES has published nothing across
 * the whole `REPUTATION_LOOKBACK_DAYS` lookback and the figure was computed
 * from sends inside the selected range instead. `none` means neither is
 * available.
 *
 * The two branches describe DIFFERENT POPULATIONS, so the boundary between them
 * must not move for a reason the reader cannot see. Merely pausing sending is
 * such a reason, which is why the lookback is long and staleness is labelled
 * rather than escalated into a fallback.
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
