import { describe, expect, it } from "vitest";
import {
  EMAIL_COVERAGE_EXPLAINER,
  type EmailChartMeta,
  REPUTATION_LOOKBACK_DAYS,
  REPUTATION_STALE_AFTER_DAYS,
  reputationAgeDays,
  reputationPartialLabel,
  reputationScopeLabel,
} from "../analytics-scope";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 21);

function meta(overrides: Partial<EmailChartMeta> = {}): EmailChartMeta {
  return {
    reputationScope: "ses-account",
    awsAccountCount: 1,
    awsAccountsUnavailable: 0,
    reputationAsOf: NOW,
    generatedAt: NOW,
    ...overrides,
  };
}

/** A rate SES published `days` ago, as the routes would report it. */
function publishedDaysAgo(
  days: number,
  overrides: Partial<EmailChartMeta> = {}
) {
  return meta({
    reputationAsOf: NOW - days * DAY_MS,
    generatedAt: NOW,
    ...overrides,
  });
}

describe("EMAIL_COVERAGE_EXPLAINER", () => {
  it("names the gap a reader would otherwise find the hard way", () => {
    // Volume now comes from Postgres, so the chart and table agree. The one
    // thing still worth stating is what neither of them covers.
    expect(EMAIL_COVERAGE_EXPLAINER).toContain(
      "Mail sent from this AWS account outside Wraps won't appear here"
    );
  });
});

describe("reputationScopeLabel", () => {
  it("marks SES reputation as all-time, not window-scoped", () => {
    const { title, detail, note } = reputationScopeLabel(meta());
    expect(title).toBe("Account reputation");
    expect(detail).toBe("SES all-time rate for this AWS account");
    expect(detail).toMatch(/all-time/);
    // A rate published today owes the reader no explanation.
    expect(note).toBeNull();
  });

  it("says worst-of-N when the org has several AWS accounts", () => {
    const { detail } = reputationScopeLabel(meta({ awsAccountCount: 3 }));
    expect(detail).toBe("SES all-time rate, worst of 3 AWS accounts");
  });

  it("uses a different title when falling back to window arithmetic", () => {
    const fallback = reputationScopeLabel(meta({ reputationScope: "window" }));
    const reputation = reputationScopeLabel(meta());
    expect(fallback.title).toBe("Bounces and complaints");
    expect(fallback.detail).toBe("Share of sends in the selected window");
    // The two must not be mistakable for one another.
    expect(fallback.title).not.toBe(reputation.title);
  });

  it("says how long SES has gone without publishing before using the window", () => {
    const { note } = reputationScopeLabel(meta({ reputationScope: "window" }));
    expect(note).toBe(
      `SES has not published an account rate in the last ${REPUTATION_LOOKBACK_DAYS} days.`
    );
  });

  it("does not claim a rate SES has never published", () => {
    const label = reputationScopeLabel(meta({ reputationScope: "none" }));
    expect(label.detail).toBe("SES has not published a rate yet");
    expect(label.note).toBeNull();
  });

  it("keeps a day-old rate unqualified - SES republishes daily while sending", () => {
    const label = reputationScopeLabel(publishedDaysAgo(1));
    expect(label.detail).toBe("SES all-time rate for this AWS account");
    expect(label.note).toBeNull();
  });

  it("dates a stale rate instead of swapping it for the window figure", () => {
    // The passumo shape: SES published, then sending stopped. The heading and
    // the population behind it must not change just because time passed.
    const label = reputationScopeLabel(publishedDaysAgo(10));

    expect(label.title).toBe("Account reputation");
    expect(label.detail).toBe(
      "SES all-time rate for this AWS account, last published 10 days ago"
    );
    expect(label.note).toBe(
      "SES publishes this rate only while the account is sending."
    );
    // Emphatically NOT the window wording - that is a different population.
    expect(label.title).not.toBe(
      reputationScopeLabel(meta({ reputationScope: "window" })).title
    );
    expect(label.detail).not.toContain("selected window");
  });

  it("dates a stale worst-of-N rate too", () => {
    const label = reputationScopeLabel(
      publishedDaysAgo(4, { awsAccountCount: 2 })
    );
    expect(label.detail).toBe(
      "SES all-time rate, worst of 2 AWS accounts, last published 4 days ago"
    );
  });

  it("starts qualifying exactly at the staleness threshold", () => {
    expect(
      reputationScopeLabel(publishedDaysAgo(REPUTATION_STALE_AFTER_DAYS - 1))
        .note
    ).toBeNull();
    expect(
      reputationScopeLabel(publishedDaysAgo(REPUTATION_STALE_AFTER_DAYS)).note
    ).not.toBeNull();
  });

  it("makes no freshness claim when the publish time is unknown", () => {
    const label = reputationScopeLabel(meta({ reputationAsOf: null }));
    expect(label.detail).toBe("SES all-time rate for this AWS account");
    expect(label.note).toBeNull();
  });

  it("keeps every copy string ASCII, which the baseline check requires", () => {
    const scopes = ["ses-account", "window", "none"] as const;
    for (const scope of scopes) {
      const label = reputationScopeLabel(
        publishedDaysAgo(10, { reputationScope: scope })
      );
      for (const text of [label.title, label.detail, label.note ?? ""]) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
        expect(text).toMatch(/^[\x00-\x7F]*$/);
      }
    }
  });
});

describe("reputationAgeDays", () => {
  it("measures the rate against the payload, not the browser clock", () => {
    // Both ends are server-side epoch ms in the same payload, so a client
    // render cannot disagree with the server about the age.
    expect(reputationAgeDays(publishedDaysAgo(3))).toBe(3);
  });

  it("floors partial days rather than rounding up", () => {
    const partial = meta({
      reputationAsOf: NOW - (2 * DAY_MS + DAY_MS / 2),
      generatedAt: NOW,
    });
    expect(reputationAgeDays(partial)).toBe(2);
  });

  it("has no age to report when SES never published", () => {
    expect(reputationAgeDays(meta({ reputationAsOf: null }))).toBeNull();
  });

  it("never reports a negative age from clock skew", () => {
    expect(
      reputationAgeDays(
        meta({ reputationAsOf: NOW + DAY_MS, generatedAt: NOW })
      )
    ).toBe(0);
  });
});

describe("reputationPartialLabel", () => {
  it("stays silent when every AWS account answered", () => {
    expect(reputationPartialLabel(meta())).toBeNull();
  });

  it("names how many accounts are missing from the reputation figure", () => {
    const label = reputationPartialLabel(
      meta({ awsAccountCount: 3, awsAccountsUnavailable: 2 })
    );
    expect(label).toBe("2 of 3 AWS accounts did not report reputation");
  });
});
