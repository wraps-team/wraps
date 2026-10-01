// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/aws-accounts", () => ({
  removeWebhookSecretAction: vi.fn(),
  saveWebhookSecretAction: vi.fn(),
}));

import type { ClientAccount } from "../../lib/client-account";
import { WebhookConfiguration } from "../webhook-configuration";

afterEach(cleanup);

const account = (webhookConnected: boolean): ClientAccount => ({
  id: "acct-1",
  organizationId: "org-1",
  accountId: "123456789012",
  name: "Prod",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/wraps-console-access-role",
  externalId: "ext-1",
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  features: null,
  healthDetail: null,
  dailyQuotaReserve: null,
  webhookConnected,
});

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function renderCard(
  overrides: Partial<Parameters<typeof WebhookConfiguration>[0]> = {}
) {
  return render(
    <WebhookConfiguration
      account={account(true)}
      canManage={false}
      lastEventReceivedAt={null}
      region="us-east-1"
      staleSince={null}
      {...overrides}
    />
  );
}

describe("WebhookConfiguration", () => {
  it("shows Off and no disconnect control for a viewer when not connected", () => {
    renderCard({ account: account(false), canManage: false });

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disconnect streaming" })
    ).not.toBeInTheDocument();
  });

  it("shows Receiving and the last event time when events are arriving", () => {
    renderCard({ lastEventReceivedAt: hoursAgo(1) });

    expect(screen.getByText("Receiving")).toBeInTheDocument();
    expect(screen.getByText(/Last event /)).toBeInTheDocument();
  });

  it("shows Stopped when the feed is flagged stale", () => {
    renderCard({ lastEventReceivedAt: hoursAgo(30), staleSince: hoursAgo(5) });

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("Receiving")).not.toBeInTheDocument();
  });

  it("offers Disconnect streaming to a manager when connected", () => {
    renderCard({ canManage: true });

    expect(
      screen.getByRole("button", { name: "Disconnect streaming" })
    ).toBeInTheDocument();
  });

  it("is titled Event streaming with the region and never says Platform Connection", () => {
    renderCard();

    expect(screen.getByText("Event streaming · us-east-1")).toBeInTheDocument();
    expect(screen.queryByText(/Platform Connection/)).not.toBeInTheDocument();
  });
});
