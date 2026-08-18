import { describe, expect, it } from "vitest";
import {
  EMAIL_COVERAGE_EXPLAINER,
  type EmailChartMeta,
  reputationPartialLabel,
  reputationScopeLabel,
} from "../analytics-scope";

function meta(overrides: Partial<EmailChartMeta> = {}): EmailChartMeta {
  return {
    reputationScope: "ses-account",
    awsAccountCount: 1,
    awsAccountsUnavailable: 0,
    generatedAt: 0,
    ...overrides,
  };
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
    const { title, detail } = reputationScopeLabel("ses-account", 1);
    expect(title).toBe("Account reputation");
    expect(detail).toBe("SES all-time rate for this AWS account");
    expect(detail).toMatch(/all-time/);
  });

  it("says worst-of-N when the org has several AWS accounts", () => {
    const { detail } = reputationScopeLabel("ses-account", 3);
    expect(detail).toBe("SES all-time rate, worst of 3 AWS accounts");
  });

  it("uses a different title when falling back to window arithmetic", () => {
    const fallback = reputationScopeLabel("window", 1);
    const reputation = reputationScopeLabel("ses-account", 1);
    expect(fallback.title).toBe("Bounces and complaints");
    expect(fallback.detail).toBe("Share of sends in the selected window");
    // The two must not be mistakable for one another.
    expect(fallback.title).not.toBe(reputation.title);
  });

  it("does not claim a rate SES has never published", () => {
    expect(reputationScopeLabel("none", 1).detail).toBe(
      "SES has not published a rate yet"
    );
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
