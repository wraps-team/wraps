import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMarketplaceWelcomeEmail } from "./marketplace-welcome";

const APP_URL = "https://app.wraps.dev";

beforeEach(() => {
  // resolveAppUrl() throws rather than guessing a URL for an email link.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
});

const content = {
  customerAwsAccountId: "845735284135",
  linkToken: "signed.link.token",
};

describe("buildMarketplaceWelcomeEmail", () => {
  it("confirms the subscription and names the AWS account", () => {
    const { subject, text, html } = buildMarketplaceWelcomeEmail(content);

    expect(subject).toBe("Your Wraps subscription is active");
    expect(text).toContain("845735284135");
    expect(html).toContain("845735284135");
  });

  it("carries the signed link token, which is what attaches the subscription", () => {
    const { text, html } = buildMarketplaceWelcomeEmail(content);

    expect(text).toContain("/marketplace/aws/link?token=signed.link.token");
    expect(html).toContain("/marketplace/aws/link?token=signed.link.token");
  });

  it("states that AWS bills infrastructure separately", () => {
    // AWS requires buyers be told they pay their own infrastructure charges.
    const { text } = buildMarketplaceWelcomeEmail(content);
    expect(text.toLowerCase()).toContain("separately from this subscription");
  });

  it("escapes untrusted values into the HTML body", () => {
    const { html } = buildMarketplaceWelcomeEmail({
      customerAwsAccountId: '"><script>alert(1)</script>',
      linkToken: "t",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps a plain-text alternative in step with the HTML", () => {
    const { text, html } = buildMarketplaceWelcomeEmail(content);
    expect(text.length).toBeGreaterThan(0);
    expect(html.length).toBeGreaterThan(0);
    expect(text).not.toContain("<p>");
  });
});
