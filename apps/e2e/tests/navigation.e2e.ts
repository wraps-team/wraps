import { describe, test } from "@e2e-dev/web";
import { expect } from "e2e";
import { openInWorkspace } from "./workspace.ts";

// Every sidebar destination a Free workspace with no AWS account can reach,
// with text only that page renders. Most no-AWS empty states title themselves
// in plain text, not a heading, hence `text`.
const PAGES: { path: string; heading?: string; text?: string }[] = [
  { path: "/emails", text: "Email Activity" },
  { path: "/emails/domains", text: "Sending Domains" },
  { path: "/emails/inbound", heading: "Deploy Inbound Email with CLI" },
  { path: "/emails/suppressions", text: "Suppression List" },
  { path: "/emails/broadcasts", text: "Create a broadcast" },
  { path: "/emails/templates", heading: "Email Templates" },
  { path: "/emails/brand-kits", heading: "Brand Kits" },
  { path: "/emails/analytics", text: "Email Activity" },
  { path: "/sms", text: "SMS Messages" },
  { path: "/sms/analytics", text: "SMS Analytics" },
  { path: "/contacts", heading: "Contacts" },
  { path: "/events", text: "Event Activity" },
  { path: "/topics", heading: "Topics" },
  { path: "/segments", heading: "Segments" },
  { path: "/automations/agents", heading: "Agents" },
  { path: "/settings", heading: "General Settings" },
  { path: "/settings/sender-defaults", heading: "Sender Defaults" },
  { path: "/settings/aws-accounts", heading: "AWS Accounts" },
  { path: "/settings/api-keys", heading: "API Keys" },
  { path: "/settings/members", heading: "Team Members" },
  { path: "/settings/sso", heading: "SSO & SCIM" },
  { path: "/settings/audit-logs", heading: "Audit Logs" },
  { path: "/settings/billing", heading: "Billing" },
];

describe("dashboard navigation", { session: "owner" }, () => {
  for (const { path, heading, text } of PAGES) {
    test(`${path} renders`, async ({ app, browser, screen }) => {
      await openInWorkspace(app, browser, path);

      await expect(browser).toHaveURL(new RegExp(`/e2e-[a-z0-9]+${path}$`));
      const marker = heading
        ? screen.getByRole("heading", heading)
        : screen.getByText(text ?? "");
      await expect(marker.first()).toBeVisible();
      await expect(screen.getByText("Something went wrong")).toHaveCount(0);
    });
  }
});

test(
  "Free plan sees the upgrade gate on topics",
  {
    session: "owner",
  },
  async ({ app, browser, screen }) => {
    await openInWorkspace(app, browser, "/topics");

    await expect(screen.getByText("Required:")).toBeVisible();
    await expect(screen.getByRole("link", "Upgrade to Pro")).toBeVisible();
  }
);
