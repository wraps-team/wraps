/**
 * Reasons tab presentation: banners, footnote, group rows and the empty state.
 * The component takes its response as props, so this runs without a server or
 * a query client.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ReasonGroup,
  ReasonGroups,
  type ReasonsResponse,
} from "../reason-groups";

afterEach(() => {
  cleanup();
});

function group(overrides: Partial<ReasonGroup> = {}): ReasonGroup {
  return {
    receiverDomain: "gmail.com",
    title: "Mailbox does not exist",
    explanation: "The address does not exist at the receiver.",
    suggestedAction: "Remove the address from your list.",
    provider: null,
    severity: "permanent",
    rawCode: null,
    feedbackType: null,
    count: 12,
    share: 60,
    distinctRecipients: 5,
    firstSeen: "2026-10-03T14:22:00.000Z",
    lastSeen: "2026-10-27T09:00:00.000Z",
    hasDetail: true,
    ...overrides,
  };
}

function response(overrides: Partial<ReasonsResponse> = {}): ReasonsResponse {
  return {
    mode: "detailed",
    metric: "bounce",
    totalCount: 20,
    fallbackSince: "2026-10-03T14:22:00.000Z",
    windowHasFallbackRows: false,
    groups: [group()],
    otherCount: 8,
    suppressionReconciliation: 0,
    ...overrides,
  };
}

describe("ReasonGroups", () => {
  it("shows the recorded-from banner with the derived date", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({ windowHasFallbackRows: true })}
        tz="UTC"
      />
    );
    expect(
      screen.getByText(
        "Detailed reasons are recorded for bounces received after Oct 3, 2026."
      )
    ).toBeInTheDocument();
  });

  it("shows the not-recorded-yet banner when fallbackSince is null", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({
          windowHasFallbackRows: true,
          fallbackSince: null,
        })}
        tz="UTC"
      />
    );
    expect(
      screen.getByText(
        "Detailed reasons are not recorded yet for your bounces. They appear for bounces received from now on."
      )
    ).toBeInTheDocument();
  });

  it("shows no banner when windowHasFallbackRows is false", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({ windowHasFallbackRows: false })}
        tz="UTC"
      />
    );
    expect(screen.queryByText(/Detailed reasons/)).not.toBeInTheDocument();
  });

  it("shows the legacy banner in legacy mode", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({
          mode: "legacy",
          windowHasFallbackRows: true,
          fallbackSince: null,
        })}
        tz="UTC"
      />
    );
    expect(
      screen.getByText(
        "Detailed reasons are not available yet. Showing receiver categories only."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/not recorded yet for your bounces/)
    ).not.toBeInTheDocument();
  });

  it("shows the reconciling footnote only when suppressionReconciliation > 0, on the bounce metric", () => {
    const { unmount } = render(
      <ReasonGroups
        metric="bounce"
        response={response({ suppressionReconciliation: 3 })}
        tz="UTC"
      />
    );
    expect(
      screen.getByText(
        "3 bounces in this window were suppression events recorded by the send path. They are counted as bounces on the bounce chart and are not listed here."
      )
    ).toBeInTheDocument();
    unmount();

    render(
      <ReasonGroups
        metric="bounce"
        response={response({ suppressionReconciliation: 0 })}
        tz="UTC"
      />
    );
    expect(
      screen.queryByText(/suppression events recorded by the send path/)
    ).not.toBeInTheDocument();
    cleanup();

    render(
      <ReasonGroups
        metric="complaint"
        response={response({
          metric: "complaint",
          suppressionReconciliation: 3,
        })}
        tz="UTC"
      />
    );
    expect(
      screen.queryByText(/suppression events recorded by the send path/)
    ).not.toBeInTheDocument();
  });

  it("labels a pre-M1 group as having no recorded reason", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({
          groups: [group({ hasDetail: false, rawCode: null })],
        })}
        tz="UTC"
      />
    );
    expect(screen.getByText("No reason recorded")).toBeInTheDocument();
  });

  it("shows the expandable receiver text for a recorded group", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({
          groups: [
            group({
              rawCode: "smtp; 550 5.1.1 user unknown",
              provider: "Gmail",
            }),
          ],
        })}
        tz="UTC"
      />
    );
    expect(screen.getByText("What the receiver said")).toBeInTheDocument();
    expect(
      screen.getByText("smtp; 550 5.1.1 user unknown")
    ).toBeInTheDocument();
    expect(screen.getByText("Gmail")).toBeInTheDocument();
  });

  it("shows the other-reasons row from otherCount", () => {
    render(<ReasonGroups metric="bounce" response={response()} tz="UTC" />);
    expect(screen.getByText("Other reasons: 8")).toBeInTheDocument();
  });

  it("shows the empty state when the window has no bounces", () => {
    render(
      <ReasonGroups
        metric="bounce"
        response={response({ totalCount: 0, groups: [], otherCount: 0 })}
        tz="UTC"
      />
    );
    expect(screen.getByText("No bounces in this window")).toBeInTheDocument();
  });

  it("never renders a recipient address", () => {
    const { container } = render(
      <ReasonGroups
        metric="bounce"
        response={response({
          groups: [
            group({
              rawCode: "smtp; 550 5.1.1 user unknown [address]",
              hasDetail: true,
            }),
          ],
        })}
        tz="UTC"
      />
    );
    expect(container.textContent ?? "").not.toMatch(/\S+@\S+/);
  });
});
