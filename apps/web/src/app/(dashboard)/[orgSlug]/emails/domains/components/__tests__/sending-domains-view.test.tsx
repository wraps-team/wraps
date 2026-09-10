/**
 * Sending domains view — plan 291 replaces one full-height card per domain
 * with a scannable table whose rows open a detail sheet carrying the DNS
 * records and the identity's configuration set.
 *
 * Rows are keyboard-operable following the segments-table.tsx pattern (audit
 * finding F9, WCAG 2.1.1 Level A) — there is no URL a sending domain can link
 * to, so the row itself is the operable control.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ListSendingDomainsResult,
  SendingDomain,
} from "@/actions/domains";

vi.mock("../add-domain-form", () => ({
  AddDomainForm: () => <div data-testid="add-domain-form" />,
}));

const mockGetConfigurationSetDetail = vi.fn();
const mockProbeTrackingDomain = vi.fn();
vi.mock("@/actions/domains", () => ({
  getConfigurationSetDetail: (...args: unknown[]) =>
    mockGetConfigurationSetDetail(...args),
  probeTrackingDomain: (...args: unknown[]) => mockProbeTrackingDomain(...args),
}));

import { SendingDomainsView } from "../sending-domains-view";

function makeDomain(overrides: Partial<SendingDomain> = {}): SendingDomain {
  return {
    identity: "example.com",
    identityType: "DOMAIN",
    verifiedForSending: true,
    verificationStatus: "SUCCESS",
    dkim: { status: "SUCCESS", tokens: ["dkimtoken1"] },
    mailFromDomain: null,
    configurationSet: "wraps-email-example.com",
    awsAccountId: "aws-account-1",
    region: "us-east-1",
    ...overrides,
  };
}

function successResult(domains: SendingDomain[]): ListSendingDomainsResult {
  return {
    success: true,
    domains,
    unreachableAccountIds: [],
    truncatedAccountIds: [],
  };
}

beforeEach(() => {
  mockGetConfigurationSetDetail.mockReset();
  mockGetConfigurationSetDetail.mockResolvedValue({
    success: true,
    detail: {
      name: "wraps-email-example.com",
      trackingRedirectDomain: null,
      trackingHttpsPolicy: "REQUIRE",
      tlsPolicy: "REQUIRE",
      sendingEnabled: true,
      reputationMetricsEnabled: true,
      suppressedReasons: [],
      eventDestinations: [],
    },
  });
  mockProbeTrackingDomain.mockReset();
  mockProbeTrackingDomain.mockResolvedValue({
    success: true,
    trackingDomain: "track.example.com",
    result: { status: "unknown", reason: "not probed" },
  });
});

afterEach(() => {
  cleanup();
});

describe("table replaces the per-domain card grid", () => {
  it("renders one row per domain, with the DNS records table not shown until a row is opened", () => {
    const domainA = makeDomain({
      identity: "example.com",
      dkim: { status: "SUCCESS", tokens: ["tok-a"] },
    });
    const domainB = makeDomain({
      identity: "second-domain.com",
      awsAccountId: "aws-account-2",
      dkim: { status: "SUCCESS", tokens: ["tok-b"] },
    });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domainA, domainB])}
      />
    );

    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("second-domain.com")).toBeInTheDocument();

    // The DNS-records table (a DKIM CNAME value) must not render inline —
    // that is the whole point of moving it into the detail sheet.
    expect(
      screen.queryByText("tok-a.dkim.amazonses.com")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("tok-b.dkim.amazonses.com")
    ).not.toBeInTheDocument();
  });

  it("exposes each row as a focusable, labelled button", () => {
    const domain = makeDomain({ identity: "example.com" });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    const row = screen.getByRole("button", {
      name: "View details for example.com",
    });
    expect(row).toHaveAttribute("tabIndex", "0");
  });
});

describe("rows are keyboard-operable (F9 pattern)", () => {
  it("opens the details sheet on Enter", async () => {
    const domain = makeDomain({ identity: "example.com" });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    const row = screen.getByRole("button", {
      name: "View details for example.com",
    });
    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", { name: "example.com" })
    ).toBeInTheDocument();
  });

  it("opens the details sheet on Space", async () => {
    const domain = makeDomain({ identity: "example.com" });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    const row = screen.getByRole("button", {
      name: "View details for example.com",
    });
    row.focus();
    await userEvent.keyboard(" ");

    expect(
      screen.getByRole("heading", { name: "example.com" })
    ).toBeInTheDocument();
  });
});

describe("clicking a row opens the sheet and loads the configuration set", () => {
  it("calls getConfigurationSetDetail with the domain's awsAccountId and configurationSet", async () => {
    const domain = makeDomain({
      identity: "example.com",
      awsAccountId: "aws-account-xyz",
      configurationSet: "wraps-email-example.com",
    });

    render(
      <SendingDomainsView
        organizationId="org-42"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    expect(
      screen.getByRole("heading", { name: "example.com" })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetConfigurationSetDetail).toHaveBeenCalledWith(
        "org-42",
        "aws-account-xyz",
        "wraps-email-example.com"
      );
    });
  });

  it("does not call getConfigurationSetDetail when the domain has no configuration set", async () => {
    const domain = makeDomain({
      identity: "no-config-set.com",
      configurationSet: null,
    });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "View details for no-config-set.com",
      })
    );

    expect(
      screen.getByRole("heading", { name: "no-config-set.com" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/has no configuration set attached/i)
    ).toBeInTheDocument();
    expect(mockGetConfigurationSetDetail).not.toHaveBeenCalled();
  });

  it("renders the HTTPS-policy warning when HttpsPolicy is OPTIONAL", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue({
      success: true,
      detail: {
        name: "wraps-email-example.com",
        trackingRedirectDomain: "track.example.com",
        trackingHttpsPolicy: "OPTIONAL",
        tlsPolicy: "REQUIRE",
        sendingEnabled: true,
        reputationMetricsEnabled: true,
        suppressedReasons: [],
        eventDestinations: [],
      },
    });
    const domain = makeDomain({ identity: "example.com" });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([domain])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    // Assert on the user-visible consequence, not the literal string
    // "OPTIONAL" — the warning must explain what actually breaks.
    expect(
      await screen.findByText(/no matching certificate/i)
    ).toBeInTheDocument();
  });
});

describe("tracking-domain TLS probe names which fix is right (plan 302)", () => {
  function optionalDetail(
    overrides: Partial<{
      trackingRedirectDomain: string | null;
      trackingHttpsPolicy: "REQUIRE" | "REQUIRE_OPEN_ONLY" | "OPTIONAL" | null;
    }> = {}
  ) {
    return {
      success: true as const,
      detail: {
        name: "wraps-email-example.com",
        trackingRedirectDomain: "track.example.com",
        trackingHttpsPolicy: "OPTIONAL" as const,
        tlsPolicy: "REQUIRE",
        sendingEnabled: true,
        reputationMetricsEnabled: true,
        suppressedReasons: [],
        eventDestinations: [],
        ...overrides,
      },
    };
  }

  it("recommends REQUIRE when the probe confirms something already serves the domain over valid TLS", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue(optionalDetail());
    mockProbeTrackingDomain.mockResolvedValue({
      success: true,
      trackingDomain: "track.example.com",
      result: { status: "serving" },
    });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain({ identity: "example.com" })])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    // Match the recommendation sentence, not a bare /REQUIRE/ — the TLS
    // policy field elsewhere in the sheet also renders the literal string
    // "REQUIRE" for an unrelated setting, which would make a bare match
    // ambiguous.
    expect(await screen.findByText(/set it to REQUIRE/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/nothing is currently serving/i)
    ).not.toBeInTheDocument();
  });

  it("never recommends REQUIRE when the probe finds nothing serving the domain over TLS", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue(optionalDetail());
    mockProbeTrackingDomain.mockResolvedValue({
      success: true,
      trackingDomain: "track.example.com",
      result: { status: "not-serving", reason: "ECONNREFUSED" },
    });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain({ identity: "example.com" })])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    // This is the regression plan 302 exists to prevent: OPTIONAL with
    // nothing serving the domain must never be told to set REQUIRE — that
    // would break every tracking link in production.
    expect(
      await screen.findByText(/nothing is currently serving/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/set it to REQUIRE/i)).not.toBeInTheDocument();
  });

  it("shows the generic degraded warning, with no specific recommendation, when the probe result is unknown", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue(optionalDetail());
    mockProbeTrackingDomain.mockResolvedValue({
      success: true,
      trackingDomain: "track.example.com",
      result: { status: "unknown", reason: "TLS handshake timed out" },
    });

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain({ identity: "example.com" })])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    expect(
      await screen.findByText(/no matching certificate/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/set it to REQUIRE/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/nothing is currently serving/i)
    ).not.toBeInTheDocument();
  });

  it("never calls the probe, and renders no warning, when trackingHttpsPolicy is REQUIRE", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue(
      optionalDetail({ trackingHttpsPolicy: "REQUIRE" })
    );

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain({ identity: "example.com" })])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    // "HTTPS policy" is a static label that only renders once the
    // configuration-set detail has loaded (past the loading skeleton) —
    // a stable anchor that doesn't collide with the TLS-policy field, which
    // also renders the literal string "REQUIRE" for an unrelated setting.
    await screen.findByText("HTTPS policy");
    expect(
      screen.queryByText(/no matching certificate/i)
    ).not.toBeInTheDocument();
    expect(mockProbeTrackingDomain).not.toHaveBeenCalled();
  });

  it("never calls the probe when OPTIONAL has no tracking domain configured", async () => {
    mockGetConfigurationSetDetail.mockResolvedValue(
      optionalDetail({ trackingRedirectDomain: null })
    );

    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain({ identity: "example.com" })])}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View details for example.com" })
    );

    await screen.findByText("Not configured");
    expect(mockProbeTrackingDomain).not.toHaveBeenCalled();
  });
});

describe("pre-existing behaviour is not disturbed by the restructure", () => {
  it("still renders the AddDomainForm", () => {
    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([makeDomain()])}
      />
    );

    expect(screen.getByTestId("add-domain-form")).toBeInTheDocument();
  });

  it("still renders the unreachable-accounts banner when accounts could not be read", () => {
    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={{
          success: true,
          domains: [makeDomain()],
          unreachableAccountIds: ["broken-account"],
          truncatedAccountIds: [],
        }}
      />
    );

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
  });

  it("still renders the Empty state when there are no domains", () => {
    render(
      <SendingDomainsView
        organizationId="org-1"
        orgSlug="acme"
        result={successResult([])}
      />
    );

    expect(screen.getByText(/No sending identities yet/i)).toBeInTheDocument();
  });
});
