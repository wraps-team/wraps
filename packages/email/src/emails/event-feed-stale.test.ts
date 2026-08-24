/**
 * Event Feed Stale Email Content Tests
 *
 * buildEventFeedStaleEmail is a pure content builder (no network calls) used
 * by the event-feed-staleness cron to notify org owners when their SES
 * event feed goes silent while sends are still happening.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildEventFeedStaleEmail } from "./event-feed-stale";

// The builder resolves the dashboard URL from the environment rather than
// hardcoding the Wraps platform, so a self-hosted deployment links to itself.
const APP_URL = "https://dash.selfhosted.example";

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const BASE_PARAMS = {
  accountName: "Production",
  awsAccountNumber: "123456789012",
  region: "us-east-1",
  orgSlug: "acme",
  awsAccountId: "aws-account-1",
  lastEventAt: new Date("2026-07-01T12:00:00.000Z"),
};

describe("buildEventFeedStaleEmail", () => {
  it("includes account name, AWS account number, and region", () => {
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);

    for (const content of [html, text]) {
      expect(content).toContain("Production");
      expect(content).toContain("123456789012");
      expect(content).toContain("us-east-1");
    }
  });

  it("includes the formatted lastEventAt timestamp", () => {
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);

    expect(html).toContain("2026-07-01 12:00 UTC");
    expect(text).toContain("2026-07-01 12:00 UTC");
  });

  it("links to the account settings page scoped by orgSlug and awsAccountId", () => {
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);
    const expectedUrl = `${APP_URL}/acme/settings/aws-accounts/aws-account-1`;

    expect(html).toContain(expectedUrl);
    expect(text).toContain(expectedUrl);
  });

  it("never points a self-hosted deployment at the Wraps platform", () => {
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);

    expect(html).not.toContain("app.wraps.dev");
    expect(text).not.toContain("app.wraps.dev");
  });

  it("mentions the wraps email doctor remediation command", () => {
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);

    expect(html).toContain("wraps email doctor");
    expect(text).toContain("wraps email doctor");
  });

  it("subject line names the account and its AWS account number", () => {
    const { subject } = buildEventFeedStaleEmail(BASE_PARAMS);

    expect(subject).toContain("Production");
    expect(subject).toContain("123456789012");
  });

  it("adds the observed-send-count sentence when observedSendCount is supplied (plan 195)", () => {
    const { html, text } = buildEventFeedStaleEmail({
      ...BASE_PARAMS,
      observedSendCount: 42,
    });

    for (const content of [html, text]) {
      expect(content).toContain("42");
      expect(content).toContain("SES reports");
    }
  });

  it("leaves the body unchanged when observedSendCount is omitted (plan 195)", () => {
    // BASE_PARAMS carries no observedSendCount at all -- this is plan 194's
    // exact output, byte-identical.
    const { html, text } = buildEventFeedStaleEmail(BASE_PARAMS);

    expect(html).not.toContain("SES reports");
    expect(text).not.toContain("SES reports");
    expect(html).toBe(
      buildEventFeedStaleEmail({ ...BASE_PARAMS, observedSendCount: undefined })
        .html
    );
  });
});
