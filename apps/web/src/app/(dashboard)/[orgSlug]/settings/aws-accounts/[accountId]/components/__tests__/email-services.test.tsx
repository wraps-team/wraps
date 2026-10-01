// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/aws-accounts", () => ({
  scanAWSAccountFeatures: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { EmailServices } from "../email-services";

afterEach(cleanup);

type Features = Parameters<typeof EmailServices>[0]["features"];

function renderCard(features: Features) {
  return render(
    <EmailServices
      awsAccountId="acct-1"
      features={features}
      organizationId="org-1"
      orgSlug="acme"
      region="us-east-1"
    />
  );
}

describe("EmailServices", () => {
  it("says 'Not scanned yet' with a Scan now button and no rows when features is null", () => {
    renderCard(null);

    expect(screen.getByText("Not scanned yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Scan now/ })
    ).toBeInTheDocument();
    expect(screen.queryByText("Configuration set")).not.toBeInTheDocument();
  });

  it("never claims TLS, reputation, suppression or 'Enabled' that the scan did not observe", () => {
    renderCard({ email: { configSetName: "wraps-email-acme" } });

    expect(screen.getByText("wraps-email-acme")).toBeInTheDocument();
    expect(screen.queryByText(/TLS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reputation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suppression/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enabled/)).not.toBeInTheDocument();
  });

  it("omits the SES account row when sandbox is unknown, and shows Sandbox when true", () => {
    const { unmount } = renderCard({ email: { configSetName: "x" } });

    expect(screen.queryByText("Sandbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Production")).not.toBeInTheDocument();
    unmount();

    renderCard({ email: { configSetName: "x", sandbox: true } });
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
  });

  it("counts identities and links to the domains page", () => {
    renderCard({
      email: {
        identities: [
          { identity: "a.com", type: "DOMAIN" },
          { identity: "b.com", type: "DOMAIN" },
          { identity: "me@a.com", type: "EMAIL_ADDRESS" },
        ],
      },
    });

    expect(screen.getByText(/2 domains, 1 address/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage domains" })
    ).toHaveAttribute("href", "/acme/emails/domains");
  });

  it("shows 'Scanned ...' only when scannedAt is recorded", () => {
    const { unmount } = renderCard({ email: { configSetName: "x" } });
    expect(screen.queryByText(/Scanned/)).not.toBeInTheDocument();
    unmount();

    renderCard({
      scannedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      email: { configSetName: "x" },
    });
    expect(screen.getByText(/^Scanned /)).toBeInTheDocument();
  });
});
