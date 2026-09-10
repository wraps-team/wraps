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
vi.mock("@/actions/domains", () => ({
  getConfigurationSetDetail: (...args: unknown[]) =>
    mockGetConfigurationSetDetail(...args),
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
