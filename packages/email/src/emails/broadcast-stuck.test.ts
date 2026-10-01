/**
 * Broadcast Stuck Email Content Tests
 *
 * buildBroadcastStuckEmail is a pure content builder (no network calls) used
 * by the batch-sender worker's quota-stuck escalation to notify org owners
 * when a quota-paused broadcast has made zero progress for 24h.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildBroadcastStuckEmail } from "./broadcast-stuck";

// The builder resolves the dashboard URL from the environment rather than
// hardcoding the Wraps platform, so a self-hosted deployment links to itself.
const APP_URL = "https://dash.selfhosted.example";

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const NOW = new Date("2026-07-31T12:00:00.000Z");

const BASE_PARAMS = {
  broadcastName: "Spring Sale",
  batchId: "batch-1",
  orgSlug: "acme",
  awsAccountId: "aws-account-1",
  stuckSince: new Date("2026-07-30T10:00:00.000Z"), // 26h before NOW
  processedRecipients: 240_000,
  totalRecipients: 800_000,
  max24HourSend: 150_000,
  sentLast24Hours: 149_000,
  reserve: 40_000,
  now: NOW,
};

describe("buildBroadcastStuckEmail", () => {
  it("subject names the broadcast and the elapsed hours", () => {
    const { subject } = buildBroadcastStuckEmail(BASE_PARAMS);

    expect(subject).toContain("Spring Sale");
    expect(subject).toContain("26 hours");
  });

  it("text and html both include all three quota numbers and progress counts", () => {
    const { html, text } = buildBroadcastStuckEmail(BASE_PARAMS);

    for (const content of [html, text]) {
      expect(content).toContain("150,000");
      expect(content).toContain("149,000");
      expect(content).toContain("40,000");
      expect(content).toContain("240,000");
      expect(content).toContain("800,000");
    }
  });

  it("includes both the reserve-settings link and the cancel link when awsAccountId is set", () => {
    const { html, text } = buildBroadcastStuckEmail(BASE_PARAMS);
    const reserveUrl = `${APP_URL}/acme/settings/aws-accounts/aws-account-1/settings#quota-reserve`;
    const cancelUrl = `${APP_URL}/acme/emails/broadcasts/batch-1`;

    for (const content of [html, text]) {
      expect(content).toContain(reserveUrl);
      expect(content).toContain(cancelUrl);
    }
  });

  it("carries the region into the reserve-settings link when given", () => {
    const { html, text } = buildBroadcastStuckEmail({
      ...BASE_PARAMS,
      region: "eu-west-1",
    });
    const reserveUrl = `${APP_URL}/acme/settings/aws-accounts/aws-account-1/settings?region=eu-west-1#quota-reserve`;

    for (const content of [html, text]) {
      expect(content).toContain(reserveUrl);
    }
  });

  it("omits the reserve-settings link but keeps the cancel link when awsAccountId is null", () => {
    const { html, text } = buildBroadcastStuckEmail({
      ...BASE_PARAMS,
      awsAccountId: null,
    });
    const cancelUrl = `${APP_URL}/acme/emails/broadcasts/batch-1`;

    for (const content of [html, text]) {
      expect(content).not.toContain("settings/aws-accounts");
      expect(content).toContain(cancelUrl);
    }
  });

  it("does not claim sending resumes automatically (distinct from the routine pause notification)", () => {
    const { html, text } = buildBroadcastStuckEmail(BASE_PARAMS);

    for (const content of [html, text]) {
      expect(content).not.toMatch(/resumes automatically/i);
    }
  });

  it("escapes a broadcast name carrying markup so it cannot inject a link", () => {
    // broadcastName is `batch.name || batch.subject`, both set by any org
    // member with broadcast-write. This mail is sent from a Wraps-verified
    // sender to the org's owners/admins, so working markup here is a phishing
    // vector that borrows our sender reputation.
    const { html } = buildBroadcastStuckEmail({
      ...BASE_PARAMS,
      broadcastName: '<a href="https://evil.example">Reset your password</a>',
    });

    expect(html).not.toContain('<a href="https://evil.example"');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;");
  });
});
